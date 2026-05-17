import { Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { TryonJobPayload } from '@trail/queue';
import { updateTryonRequest } from '@trail/db';
import { getSignedReadUrl, upload } from '@trail/storage';
import { generateTryOn } from '@trail/ai';
import { generateCompliment } from '@trail/ai';
import { config } from '@trail/config';

const logger = pino({
  transport: { target: 'pino-pretty' },
});

const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
});

export async function processTryOn(job: Job<TryonJobPayload>) {
  const start = Date.now();
  const { requestId, tenantId, productId, productImageUrl, userImageKey, config: tenantConfig } = job.data;

  logger.info({ requestId, tenantId, productId }, 'Processing try-on job');

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

    // STEP 4: Call Segmind generateTryOn()
    const segmindStart = Date.now();
    const { imageBuffer } = await generateTryOn({
      userImageUrl,
      garmentImageUrl: productImageUrl,
      model: tenantConfig.segmindModel,
    });
    const segmindMs = Date.now() - segmindStart;

    // STEP 5: Upload generated image to R2
    const uploadStart = Date.now();
    const generatedKey = `${tenantId}/generated/${requestId}`;
    await upload(generatedKey, imageBuffer, 'image/jpeg');
    const uploadMs = Date.now() - uploadStart;

    // STEP 6: Call Gemini Flash if cache miss
    let geminiMs = 0;
    if (!complimentResult) {
      const geminiStart = Date.now();
      complimentResult = await generateCompliment({ tone: tenantConfig.complimentTone });
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

    // STEP 8: Cache status in Redis for 180s
    await redis.set(`tryon:${requestId}:status`, 'completed', 'EX', 180);

    // STEP 9: Structured logging
    logger.info({
      requestId,
      tenantId,
      elapsed,
      complimentCached,
      segmindMs,
      geminiMs,
      uploadMs,
      event: 'tryon_completed'
    }, 'Try-on completed successfully');

  } catch (error: any) {
    const elapsed = Date.now() - start;
    logger.error({
      requestId,
      tenantId,
      elapsed,
      error: error.message,
      stack: error.stack,
      event: 'tryon_failed'
    }, 'Try-on job failed');

    await updateTryonRequest(requestId, {
      status: 'failed',
      errorMessage: error.message,
    });

    throw error; // Re-throw for BullMQ retry strategy
  }
}
