import axios from 'axios';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import pino from 'pino';
import sharp from 'sharp';

// Enforce strict memory & thread limits for Render starter instance (max 512MB RAM OOM protection)
sharp.cache({ memory: 15, files: 2, items: 10 });
sharp.concurrency(1);

import { config } from '@trail/config';
import { validateExternalImageUrl, SsrfBlockedError } from '@trail/security';
import {
  VirtualTryOnProvider,
  TryOnInput,
  TryOnResult,
  InvalidProviderResponseError,
  ProviderTimeoutError,
  ProviderRateLimitError,
  ProviderError
} from './types.js';

const logger = pino({
  transport: { target: 'pino-pretty' },
});

const FitRoomResponseSchema = z.object({
  image: z.string().min(1),
  status: z.string().optional(),
});

export class FitRoomProvider implements VirtualTryOnProvider {
  async generate(input: TryOnInput): Promise<TryOnResult> {
    const providerName = 'fitroom';
    const start = Date.now();
    const apiKey = config.fitroom.apiKey;
    const apiUrl = config.fitroom.apiUrl;

    logger.info({
      tenantId: input.tenantId,
      productId: input.productId,
      requestId: input.requestId,
      provider: providerName,
    }, 'Initiating FitRoom Try-On');

    // Handle offline/mock mode
    if (
      !apiKey ||
      apiKey === 'mock' ||
      apiKey.startsWith('FR_***') ||
      process.env.MOCK_AI === 'true'
    ) {
      logger.info({ provider: providerName, requestId: input.requestId }, 'Using FitRoom local mock mode');
      try {
        const res = await axios.get(
          'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1000',
          { responseType: 'arraybuffer', timeout: 5000 }
        );
        const imageBuffer = Buffer.from(res.data);
        const processingMs = Date.now() - start;
        return {
          success: true,
          outputImageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f',
          processingMs,
          provider: providerName,
          imageBuffer,
        };
      } catch (err) {
        const mockPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const imageBuffer = Buffer.from(mockPng, 'base64');
        return {
          success: true,
          outputImageUrl: 'data:image/png;base64,' + mockPng,
          processingMs: Date.now() - start,
          provider: providerName,
          imageBuffer,
        };
      }
    }

    try {
      // 1. SSRF validation — block private IPs and non-allowlisted domains
      try {
        validateExternalImageUrl(input.modelImage);
        validateExternalImageUrl(input.garmentImage);
      } catch (ssrfErr) {
        const err = ssrfErr as SsrfBlockedError;
        throw new InvalidProviderResponseError(
          `SSRF protection blocked image URL: ${err.message}`,
          providerName,
          input.tenantId,
          input.productId,
          Date.now() - start,
        );
      }

      // 2. Download model and garment images from their source URLs and convert to Blobs
      logger.debug({ provider: providerName, requestId: input.requestId }, 'Downloading model image from storage URL');
      const modelRes = await axios.get(input.modelImage, { responseType: 'arraybuffer', timeout: 15000 });
      let modelBuffer = Buffer.from(modelRes.data);
      try {
        modelBuffer = await sharp(modelBuffer).jpeg().toBuffer();
      } catch (err: any) {
        logger.warn({ provider: providerName, error: err.message }, 'Failed converting model image to JPEG, using raw bytes');
      }
      const modelBlob = new Blob([modelBuffer], { type: 'image/jpeg' });

      logger.debug({ provider: providerName, requestId: input.requestId }, 'Downloading garment image from storage URL');
      const garmentRes = await axios.get(input.garmentImage, { responseType: 'arraybuffer', timeout: 15000 });
      let garmentBuffer = Buffer.from(garmentRes.data);
      try {
        garmentBuffer = await sharp(garmentBuffer).jpeg().toBuffer();
      } catch (err: any) {
        logger.warn({ provider: providerName, error: err.message }, 'Failed converting garment image to JPEG, using raw bytes');
      }
      const garmentBlob = new Blob([garmentBuffer], { type: 'image/jpeg' });

      // 2. Map category safely to FitRoom's expected values: upper, lower, or full_body
      let clothType = 'upper';
      if (input.category) {
        const cleanCat = input.category.toLowerCase().trim();
        if (
          cleanCat.includes('upper') ||
          cleanCat.includes('top') ||
          cleanCat.includes('shirt') ||
          cleanCat.includes('jacket') ||
          cleanCat.includes('outerwear')
        ) {
          clothType = 'upper';
        } else if (
          cleanCat.includes('lower') ||
          cleanCat.includes('bottom') ||
          cleanCat.includes('pant') ||
          cleanCat.includes('skirt') ||
          cleanCat.includes('jeans') ||
          cleanCat.includes('shorts')
        ) {
          clothType = 'lower';
        } else if (
          cleanCat.includes('overall') ||
          cleanCat.includes('full') ||
          cleanCat.includes('dress') ||
          cleanCat.includes('suit') ||
          cleanCat.includes('suite') ||
          cleanCat.includes('onesie') ||
          cleanCat.includes('romper')
        ) {
          clothType = 'full_body';
        }
      }

      // 3. Build helper to submit a task
      let currentClothType = clothType;
      let response;
      let taskId = '';

      const submitTask = async (cType: string) => {
        const formData = new FormData();
        formData.append('model_image', modelBlob, 'model.jpg');
        formData.append('cloth_image', garmentBlob, 'garment.jpg');
        formData.append('cloth_type', cType);

        logger.info({ provider: providerName, requestId: input.requestId, clothType: cType }, 'Submitting async task to FitRoom API');
        const res = await axios.post(
          apiUrl,
          formData,
          {
            headers: {
              'X-API-KEY': apiKey,
            },
            timeout: 30000,
          }
        );
        return res;
      };

      response = await submitTask(currentClothType);
      taskId = response.data.task_id || response.data.id;
      if (!taskId) {
        throw new InvalidProviderResponseError(
          `FitRoom API response missing task identifier: ${JSON.stringify(response.data)}`,
          providerName,
          input.tenantId,
          input.productId,
          Date.now() - start
        );
      }

      logger.info({ provider: providerName, requestId: input.requestId, taskId }, 'FitRoom task created, starting polling');

      // 4. Poll status endpoint until COMPLETED or FAILED
      let taskStatus = (response.data.status || '').toUpperCase();
      let downloadUrl = '';
      let attempts = 0;
      const maxAttempts = 90; // 180 seconds maximum polling window

      while (attempts < maxAttempts) {
        attempts++;
        
        // Base API URL is e.g. https://platform.fitroom.app/api/tryon/v2/tasks, so we append /:id
        const pollUrl = `${apiUrl}/${taskId}`;
        
        try {
          const pollRes = await axios.get(pollUrl, {
            headers: {
              'X-API-KEY': apiKey,
            },
            timeout: 10000,
          });

          const data = pollRes.data;
          taskStatus = (data.status || '').toUpperCase();
          logger.debug({ provider: providerName, taskId, status: taskStatus, progress: data.progress }, 'Polling task status');

          if (taskStatus === 'COMPLETED' || taskStatus === 'SUCCESS') {
            downloadUrl = data.download_signed_url || data.result_url || data.url;
            break;
          } else if (taskStatus === 'FAILED' || taskStatus === 'ERROR') {
            const reason = data.message || data.reason || 'Unknown processing error';

            // If the failure is due to an unsupported cloth_type (e.g. full_body on a half-body selfie)
            // we dynamically fallback to trying on the garment as 'upper'
            if (currentClothType === 'full_body' && reason.toLowerCase().includes('unsupported cloth_type')) {
              logger.warn({ provider: providerName, taskId, reason }, 'FitRoom full_body not supported for this model image, retrying with cloth_type: upper');
              currentClothType = 'upper';
              response = await submitTask(currentClothType);
              taskId = response.data.task_id || response.data.id;
              if (!taskId) {
                throw new InvalidProviderResponseError(
                  `FitRoom API response missing task identifier on fallback: ${JSON.stringify(response.data)}`,
                  providerName,
                  input.tenantId,
                  input.productId,
                  Date.now() - start
                );
              }
              attempts = 0; // Reset attempts for the new task
              taskStatus = (response.data.status || '').toUpperCase();
              continue;
            }

            throw new InvalidProviderResponseError(
              `FitRoom task processing failed: ${reason}`,
              providerName,
              input.tenantId,
              input.productId,
              Date.now() - start
            );
          }
        } catch (pollErr: any) {
          logger.warn({ provider: providerName, taskId, error: pollErr.message }, 'Transient polling error');
          // If it's a validation response error we threw, propagate it immediately
          if (pollErr instanceof ProviderError) {
            throw pollErr;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (taskStatus !== 'COMPLETED' || !downloadUrl) {
        throw new ProviderTimeoutError(
          `FitRoom task polling timed out after ${attempts * 2}s`,
          providerName,
          input.tenantId,
          input.productId,
          Date.now() - start
        );
      }

      // 5. Download the final rendered try-on image buffer
      logger.info({ provider: providerName, requestId: input.requestId, taskId }, 'Downloading final rendered try-on image');
      const imgRes = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 30000 });
      const imageBuffer = Buffer.from(imgRes.data);
      const processingMs = Date.now() - start;

      return {
        success: true,
        outputImageUrl: downloadUrl,
        processingMs,
        provider: providerName,
        imageBuffer,
      };

    } catch (error: any) {
      const processingMs = Date.now() - start;

      if (error instanceof ProviderError) {
        if (config.sentry.dsnWorker) {
          Sentry.captureException(error, {
            tags: { provider: providerName, tenantId: input.tenantId, productId: input.productId, requestId: input.requestId },
            extra: { processingMs }
          });
        }
        throw error;
      }

      const message = error.message || 'Unknown FitRoom error';
      const status = error.response?.status;
      let finalError: ProviderError;

      const failedUrl = error.config?.url;
      if (failedUrl && (failedUrl === input.modelImage || failedUrl === input.garmentImage)) {
        const imageType = failedUrl === input.modelImage ? 'model' : 'garment';
        finalError = new InvalidProviderResponseError(
          `Failed to download ${imageType} image: Request failed with status code ${status || 'unknown'}`,
          providerName,
          input.tenantId,
          input.productId,
          processingMs
        );
      } else if (error.code === 'ECONNABORTED' || message.includes('timeout')) {
        finalError = new ProviderTimeoutError(
          `FitRoom API request timed out: ${message}`,
          providerName,
          input.tenantId,
          input.productId,
          processingMs
        );
      } else if (status === 429) {
        finalError = new ProviderRateLimitError(
          `FitRoom API rate limited (429): ${message}`,
          providerName,
          input.tenantId,
          input.productId,
          processingMs
        );
      } else {
        finalError = new InvalidProviderResponseError(
          `FitRoom API failed with status ${status || 'unknown'}: ${message}`,
          providerName,
          input.tenantId,
          input.productId,
          processingMs
        );
      }

      if (config.sentry.dsnWorker) {
        Sentry.captureException(finalError, {
          tags: { provider: providerName, tenantId: input.tenantId, productId: input.productId, requestId: input.requestId },
          extra: { processingMs, originalError: error.message }
        });
      }

      throw finalError;
    }
  }
}
