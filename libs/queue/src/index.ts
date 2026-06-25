import type { JobsOptions } from 'bullmq';

export interface TryonJobPayload {
  requestId: string;
  tenantId: string;
  productId: string;
  productImageUrl: string;
  userImageKey: string;
  category?: string | null;
  config: {
    segmindModel: string;
    complimentTone: 'friendly' | 'luxury' | 'playful';
    watermark?: {
      type?: 'corner-logo' | 'pattern-text' | 'pattern-logo' | 'hybrid' | string;
      keyOrUrl?: string | null;
      text?: string | null;
      scale?: number;
      position?: string;
      opacity: number;
      rotation?: number;
      spacing?: number;
      tenantId?: string;
    } | null;
  };
}

export const QUEUE_NAMES = {
  TRYON: 'tryon-queue',
  CLEANUP: 'cleanup-queue',
} as const;

export const JOB_OPTIONS: Record<keyof typeof QUEUE_NAMES, JobsOptions> = {
  TRYON: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
  CLEANUP: {
    attempts: 1,
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  },
};
