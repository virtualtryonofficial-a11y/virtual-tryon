import { Job } from 'bullmq';
import pino from 'pino';
import { getTryonRequestsForCleanup, updateTryonRequest, prisma } from '@trail/db';
import { deleteObject } from '@trail/storage';

const logger = pino({
  transport: { target: 'pino-pretty' },
});

export async function processCleanup(job: Job) {
  logger.info('Starting daily cleanup processor');
  
  try {
    // 1. Clean up expired OTP sessions
    logger.info('Cleaning up expired OTP sessions...');
    const expiredOtp = await prisma.otpSession.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });
    logger.info({ count: expiredOtp.count }, 'Deleted expired OTP sessions');
    // Rules:
    // - delete user uploads older than 24h
    // - delete generated images older than 7d
    const userImageOlderThanMs = 24 * 60 * 60 * 1000;
    const generatedImageOlderThanMs = 7 * 24 * 60 * 60 * 1000;

    const records = await getTryonRequestsForCleanup(userImageOlderThanMs, generatedImageOlderThanMs);
    
    logger.info({ count: records.length }, 'Found records for cleanup');

    const now = Date.now();
    let userDeletions = 0;
    let generatedDeletions = 0;

    for (const record of records) {
      const updates: any = {};

      // Check user image
      if (record.userImageKey && record.createdAt.getTime() < now - userImageOlderThanMs) {
        try {
          await deleteObject(record.userImageKey);
          updates.userImageKey = null;
          userDeletions++;
        } catch (err: any) {
          logger.error({ key: record.userImageKey, error: err.message }, 'Failed to delete user image');
        }
      }

      // Check generated image
      if (record.generatedImageKey && record.createdAt.getTime() < now - generatedImageOlderThanMs) {
        try {
          await deleteObject(record.generatedImageKey);
          updates.generatedImageKey = null;
          generatedDeletions++;
        } catch (err: any) {
          logger.error({ key: record.generatedImageKey, error: err.message }, 'Failed to delete generated image');
        }
      }

      if (Object.keys(updates).length > 0) {
        await updateTryonRequest(record.id, updates);
      }
    }

    logger.info({ 
      userDeletions, 
      generatedDeletions,
      event: 'cleanup_completed' 
    }, 'Cleanup completed');

  } catch (error: any) {
    logger.error({ error: error.message, event: 'cleanup_failed' }, 'Cleanup processor failed');
    throw error;
  }
}
