import axios from 'axios';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import pino from 'pino';
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

const SegmindResponseSchema = z.object({
  image: z.string().min(1),
  status: z.string().optional(),
});

export class SegmindProvider implements VirtualTryOnProvider {
  async generate(input: TryOnInput & { model?: string }): Promise<TryOnResult> {
    const providerName = 'segmind';
    const start = Date.now();
    const apiKey = config.segmind.apiKey;

    logger.info({
      tenantId: input.tenantId,
      productId: input.productId,
      requestId: input.requestId,
      provider: providerName,
    }, 'Initiating Segmind Try-On');

    // Handle offline/mock mode
    if (
      !apiKey ||
      apiKey === 'mock' ||
      apiKey.startsWith('SG_***') ||
      process.env.MOCK_AI === 'true'
    ) {
      logger.info({ provider: providerName, requestId: input.requestId }, 'Using Segmind local mock mode');
      try {
        const res = await axios.get(
          'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1000',
          { responseType: 'arraybuffer', timeout: 5000 }
        );
        const imageBuffer = Buffer.from(res.data);
        return {
          success: true,
          outputImageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f',
          processingMs: Date.now() - start,
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

    const modelName = input.model || 'fashion-tryon-v1';
    const url = `https://api.segmind.com/v1/${modelName}`;

    try {
      // SSRF validation — block private IPs and non-allowlisted domains before
      // passing URLs to the Segmind API payload.
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

      const response = await axios.post(
        url,
        {
          model_image: input.modelImage,
          outfit_image: input.garmentImage,
        },
        {
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
          responseType: 'arraybuffer',
        }
      );

      const processingMs = Date.now() - start;
      const contentType = response.headers['content-type'];

      logger.info({
        provider: providerName,
        requestId: input.requestId,
        processingMs,
        contentType,
      }, 'Segmind API request succeeded, processing response');

      if (typeof contentType === 'string' && contentType.includes('application/json')) {
        const data = JSON.parse(Buffer.from(response.data).toString());
        const parsed = SegmindResponseSchema.safeParse(data);
        if (!parsed.success) {
          throw new InvalidProviderResponseError(
            `Invalid response format: ${parsed.error.message}`,
            providerName,
            input.tenantId,
            input.productId,
            processingMs
          );
        }

        const imageStr = parsed.data.image;
        let imageBuffer: Buffer;
        if (imageStr.startsWith('data:image')) {
          const base64Data = imageStr.split(',')[1] || imageStr;
          imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
          imageBuffer = Buffer.from(imageStr, 'base64');
        }

        // Validate image buffer header bytes (PNG/JPEG/WEBP)
        if (imageBuffer.length < 4) {
          throw new InvalidProviderResponseError(
            'Response image buffer is too small',
            providerName,
            input.tenantId,
            input.productId,
            processingMs
          );
        }

        return {
          success: true,
          outputImageUrl: 'data:image/jpeg;base64,' + imageBuffer.toString('base64'),
          processingMs,
          provider: providerName,
          imageBuffer,
          raw: data,
        };
      }

      if (typeof contentType === 'string' && contentType.startsWith('image/')) {
        const imageBuffer = Buffer.from(response.data);
        return {
          success: true,
          outputImageUrl: 'data:image/jpeg;base64,' + imageBuffer.toString('base64'),
          processingMs,
          provider: providerName,
          imageBuffer,
        };
      }

      throw new InvalidProviderResponseError(
        `Unsupported content type: ${contentType}`,
        providerName,
        input.tenantId,
        input.productId,
        processingMs
      );

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

      const message = error.message || 'Unknown Segmind error';
      const status = error.response?.status;
      let finalError: ProviderError;

      if (error.code === 'ECONNABORTED' || message.includes('timeout')) {
        finalError = new ProviderTimeoutError(
          `Segmind API request timed out: ${message}`,
          providerName,
          input.tenantId,
          input.productId,
          processingMs
        );
      } else if (status === 429) {
        finalError = new ProviderRateLimitError(
          `Segmind API rate limited (429): ${message}`,
          providerName,
          input.tenantId,
          input.productId,
          processingMs
        );
      } else {
        finalError = new InvalidProviderResponseError(
          `Segmind API failed with status ${status || 'unknown'}: ${message}`,
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
