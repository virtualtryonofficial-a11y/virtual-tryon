import { JobsOptions } from 'bullmq';

export interface TryonJobPayload {
  requestId: string;
  tenantId: string;
  productId: string;
  productImageUrl: string;
  userImageKey: string;
  config: {
    segmindModel: string;
    complimentTone: 'friendly' | 'luxury' | 'playful';
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
