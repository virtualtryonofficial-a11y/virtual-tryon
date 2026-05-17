import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { config } from '@trail/config';
import { QUEUE_NAMES } from '@trail/queue';
import { processTryOn } from './processors/tryon.processor.js';
import { processCleanup } from './processors/cleanup.processor.js';

const logger = pino({
  transport: { target: 'pino-pretty' },
});

async function bootstrap() {
  logger.info('Worker starting...');

  const connection = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
  });

  // Exported for Bull Board or other monitoring if needed
  const tryonWorker = new Worker(
    QUEUE_NAMES.TRYON,
    processTryOn,
    { 
      connection,
    }
  );

  const cleanupWorker = new Worker(
    QUEUE_NAMES.CLEANUP,
    processCleanup,
    { 
      connection,
    }
  );

  // Setup daily cleanup job if not already present
  const cleanupQueue = new Queue(QUEUE_NAMES.CLEANUP, { connection });
  await cleanupQueue.add(
    'daily-cleanup',
    {},
    {
      repeat: {
        pattern: '0 2 * * *', // Daily at 02:00
      },
    }
  );

  tryonWorker.on('completed', (job) => {
    logger.info({ jobId: job.id, queue: QUEUE_NAMES.TRYON }, 'Job completed');
  });

  tryonWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, queue: QUEUE_NAMES.TRYON, err: err.message }, 'Job failed');
  });

  cleanupWorker.on('completed', (job) => {
    logger.info({ jobId: job.id, queue: QUEUE_NAMES.CLEANUP }, 'Cleanup job completed');
  });

  cleanupWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, queue: QUEUE_NAMES.CLEANUP, err: err.message }, 'Cleanup job failed');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await tryonWorker.close();
    await cleanupWorker.close();
    await connection.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('Worker instances ready');
}

bootstrap().catch((err) => {
  logger.error(err, 'Worker bootstrap failed');
  process.exit(1);
});
