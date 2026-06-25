import { Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { TryonJobPayload } from '@trail/queue';
import { updateTryonRequest, prisma } from '@trail/db';
import { getSignedReadUrl, upload } from '@trail/storage';
import { getProvider, generateCompliment, selectBestGarmentImage, applyWatermarkWithMetrics } from '@trail/ai';
import { config } from '@trail/config';
import * as Sentry from '@sentry/node';

const logger = pino({
  transport: { target: 'pino-pretty' },
});

const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
});

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries: number; delayMs: number; name: string }
): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      logger.warn(
        { attempt, name: options.name, error: err.message },
        `Transient error in ${options.name}, retrying...`
      );
      if (attempt < options.retries) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs * attempt));
      }
    }
  }
  throw lastErr;
}

export async function processTryOn(job: Job<TryonJobPayload>) {
  const start = Date.now();
  const { requestId, tenantId, productId, productImageUrl, userImageKey, category, config: tenantConfig } = job.data;

  logger.info({
    requestId,
    tenantId,
    productId,
    attempt: job.attemptsMade + 1,
  }, 'Processing try-on job');

  try {
    // STEP 1: Update status to processing
    await updateTryonRequest(requestId, { status: 'processing' });

    // STEP 2: Generate signed R2 URL for user image
    const userImageUrl = await getSignedReadUrl(userImageKey);

    // STEP 3: Check compliment cache
    const cacheKey = `compliment:${tenantId}:${productId}:${tenantConfig.complimentTone}`;
    const cachedCompliment = await redis.get(cacheKey);
    
    let complimentResult: { compliment: string; score: number } | null = null;
    let complimentCached = false;

    if (cachedCompliment) {
      complimentResult = JSON.parse(cachedCompliment);
      complimentCached = true;
      logger.info({ requestId, cacheKey }, 'Compliment cache hit');
    }

    // Resolve the best garment image using selection priority logic
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    let selectedGarmentUrl = productImageUrl; // default fallback
    let selectionStrategy = 'fallback_default';
    let selectedImageType = 'unknown';
    let selectionScore = 0;
    let selectionReason = 'Default product image url used';
    let fallbackUsed = true;

    if (product) {
      if (product.preferredGarmentImage) {
        selectedGarmentUrl = product.preferredGarmentImage;
        selectionStrategy = 'manual_override';
        selectedImageType = 'manual';
        selectionScore = 100;
        selectionReason = 'Merchant manually preferred garment image';
        fallbackUsed = false;
      } else if (product.images) {
        let imagesArray: any[] = [];
        try {
          if (typeof product.images === 'string') {
            imagesArray = JSON.parse(product.images);
          } else if (Array.isArray(product.images)) {
            imagesArray = product.images;
          }
        } catch (err: any) {
          logger.warn({ error: err.message, productId }, 'Failed to parse product.images JSON');
        }

        if (imagesArray.length > 0) {
          const selectionResult = selectBestGarmentImage(imagesArray);
          if (selectionResult) {
            const bestImage = selectionResult.image;
            selectedGarmentUrl = bestImage.url || bestImage.src || selectedGarmentUrl;
            selectionStrategy = selectionResult.reasons.length > 0 ? 'heuristic' : 'fallback_order';
            selectedImageType = selectionResult.reasons.length > 0 ? 'auto-selected' : 'first-last-fallback';
            selectionScore = selectionResult.score;
            selectionReason = selectionResult.reasons.join(', ') || 'No heuristic match; fell back to position order';
            fallbackUsed = false;
          }
        }
      }
    }

    logger.info({
      requestId,
      productId,
      selectedGarmentUrl,
      selectionStrategy,
      selectedImageType,
      selectionScore,
      selectionReason,
      fallbackUsed
    }, 'Garment image selection result');

    // STEP 4: Call active provider with local retries
    const provider = getProvider();
    const providerStart = Date.now();
    const result = await withRetry(
      () => provider.generate({
        modelImage: userImageUrl,
        garmentImage: selectedGarmentUrl,
        tenantId,
        productId,
        requestId,
        category: category || undefined,
        model: tenantConfig.segmindModel,
      }),
      { retries: 3, delayMs: 1000, name: `AI Try-On Generation (${provider.constructor.name})` }
    );
    const providerMs = Date.now() - providerStart;
    const imageBuffer = result.imageBuffer;

    if (!imageBuffer) {
      throw new Error(`Provider ${result.provider} returned success but no image buffer was resolved`);
    }

    // STEP 4.5: Apply watermark if configured
    let finalBuffer = imageBuffer;
    if (tenantConfig && tenantConfig.watermark) {
      const wmResult = await applyWatermarkWithMetrics(imageBuffer, tenantConfig.watermark);
      finalBuffer = wmResult.buffer;
      logger.info({
        tenantId,
        requestId,
        ...wmResult.metrics
      }, 'Watermark telemetry runtime metrics');
    }

    // STEP 5: Upload generated image to R2 with local retries
    const uploadStart = Date.now();
    const generatedKey = `${tenantId}/generated/${requestId}`;
    await withRetry(
      () => upload(generatedKey, finalBuffer, 'image/jpeg'),
      { retries: 3, delayMs: 1000, name: 'Cloudflare R2 Upload' }
    );
    const uploadMs = Date.now() - uploadStart;

    // STEP 6: Call Gemini Flash with local retries if cache miss
    let geminiMs = 0;
    if (!complimentResult) {
      const geminiStart = Date.now();
      complimentResult = await withRetry(
        () => generateCompliment({ tone: tenantConfig.complimentTone }),
        { retries: 3, delayMs: 1000, name: 'Gemini Text Generation' }
      );
      geminiMs = Date.now() - geminiStart;
      
      // Cache for 24h
      await redis.set(cacheKey, JSON.stringify(complimentResult), 'EX', 86400);
    }

    // STEP 7: Update DB
    const elapsed = Date.now() - start;
    await updateTryonRequest(requestId, {
      status: 'completed',
      generatedImageKey: generatedKey,
      compliment: complimentResult!.compliment,
      styleScore: complimentResult!.score,
      processingTimeMs: elapsed,
      complimentCached,
    });

    // Generate the signed read URL for the generated try-on image
    const signedGeneratedUrl = await getSignedReadUrl(generatedKey);

    const fullResponse = {
      status: 'completed',
      imageUrl: signedGeneratedUrl,
      compliment: complimentResult!.compliment,
      styleScore: complimentResult!.score,
      complimentCached,
    };

    // Cache the full response payload in Redis for 3 minutes (180s) to completely avoid DB reads on polling
    await redis.set(`tryon:${requestId}:response`, JSON.stringify(fullResponse), 'EX', 180);

    // STEP 8: Cache status in Redis for 180s
    await redis.set(`tryon:${requestId}:status`, 'completed', 'EX', 180);

    // STEP 9: Structured logging
    logger.info({
      requestId,
      tenantId,
      elapsed,
      attempt: job.attemptsMade + 1,
      complimentCached,
      provider: result.provider,
      providerMs,
      geminiMs,
      uploadMs,
      selectedImageType,
      selectionScore,
      selectionReason,
      fallbackUsed,
      event: 'tryon_completed'
    }, 'Try-on completed successfully');

  } catch (error: any) {
    const elapsed = Date.now() - start;
    const providerName = error.provider || config.aiProvider || 'fitroom';

    logger.error({
      requestId,
      tenantId,
      elapsed,
      attempt: job.attemptsMade + 1,
      provider: providerName,
      error: error.message,
      stack: error.stack,
      event: 'tryon_failed'
    }, 'Try-on job failed');

    await updateTryonRequest(requestId, {
      status: 'failed',
      errorMessage: `[Attempt ${job.attemptsMade + 1}/3 failed]: ${error.message}`,
    });

    if (config.sentry.dsnWorker) {
      Sentry.withScope((scope) => {
        scope.setTag('queue', 'tryon-queue');
        scope.setTag('tenantId', tenantId);
        scope.setTag('productId', productId);
        scope.setTag('requestId', requestId);
        scope.setTag('provider', providerName);
        scope.setTag('attempt', (job.attemptsMade + 1).toString());
        Sentry.captureException(error);
      });
    }

    throw error; // Re-throw for BullMQ retry strategy
  }
}
