import axios from 'axios';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import { config } from '@trail/config';

const SegmindResponseSchema = z.object({
  image: z.string().min(1),
  status: z.string().optional(),
});

export class SegmindError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SegmindError';
  }
}

export async function generateTryOn(payload: {
  userImageUrl: string;
  garmentImageUrl: string;
  model: string;
}): Promise<{ imageBuffer: Buffer }> {
  const url = `https://api.segmind.com/v1/${payload.model}`;

  try {
    const response = await axios.post(
      url,
      {
        model_image: payload.userImageUrl,
        outfit_image: payload.garmentImageUrl,
      },
      {
        headers: {
          'x-api-key': config.segmind.apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 60000, // Strict 60s timeout
        responseType: 'arraybuffer',
      }
    );

    const contentType = response.headers['content-type'];

    // Handle JSON response (usually containing base64 image)
    if (typeof contentType === 'string' && contentType.includes('application/json')) {
      const data = JSON.parse(Buffer.from(response.data).toString());
      const parsed = SegmindResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new SegmindError(`Invalid response format: ${parsed.error.message}`);
      }
      return { imageBuffer: Buffer.from(parsed.data.image, 'base64') };
    }

    // Handle binary image response
    if (typeof contentType === 'string' && contentType.startsWith('image/')) {
      return { imageBuffer: Buffer.from(response.data) };
    }

    throw new SegmindError(`Unsupported content type: ${contentType}`);
  } catch (error: any) {
    if (error instanceof SegmindError) {
      if (config.sentry.dsn) {
        Sentry.captureException(error, {
          tags: { service: 'segmind', model: payload.model },
          extra: { payload }
        });
      }
      throw error;
    }
    
    let message = error.message;
    if (error.response) {
      try {
        const errorData = Buffer.from(error.response.data).toString();
        message = `Segmind API failed (${error.response.status}): ${errorData}`;
      } catch (e) {
        message = `Segmind API failed (${error.response.status})`;
      }
    }
      
    const finalError = new SegmindError(message || 'Unknown Segmind error');
    if (config.sentry.dsn) {
      Sentry.captureException(finalError, {
        tags: { service: 'segmind', model: payload.model },
        extra: { payload }
      });
    }
    throw finalError;
  }
}
