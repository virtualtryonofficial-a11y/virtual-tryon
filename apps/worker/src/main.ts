import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import * as Sentry from '@sentry/node';
import { config } from '@trail/config';
import { QUEUE_NAMES } from '@trail/queue';
import { processTryOn } from './processors/tryon.processor.js';
import { processCleanup } from './processors/cleanup.processor.js';

const logger = pino({
  transport: { target: 'pino-pretty' },
});

async function bootstrap() {
  logger.info('Worker starting...');

  if (config.sentry.dsnWorker) {
    Sentry.init({
      dsn: config.sentry.dsnWorker,
      tracesSampleRate: 1.0,
      environment: process.env.NODE_ENV || 'production',
    });
  }

  const connection = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
  });

  // Exported for Bull Board or other monitoring if needed
  // IMPORTANT: 512 MB Memory Validation Dependency
  // The memory safety of the process-wide Semaphore(3) relies entirely on
  // TryonWorker concurrency remaining strictly at 1. Increasing worker concurrency
  // invalidates the memory model and will likely cause an OOM on 512 MB runtimes.
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
    const waitTimeMs = job.processedOn ? job.processedOn - job.timestamp : 0;
    const processingTimeMs = (job.finishedOn && job.processedOn) ? job.finishedOn - job.processedOn : 0;
    
    if (waitTimeMs > 10000) {
      logger.warn({ jobId: job.id, waitTimeMs, queue: QUEUE_NAMES.TRYON }, 'Worker lag detected (Queue spike)');
    }

    logger.info({ 
      jobId: job.id, 
      queue: QUEUE_NAMES.TRYON,
      metrics: { waitTimeMs, processingTimeMs, attempts: job.attemptsMade }
    }, 'Job completed');
  });

  tryonWorker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, queue: QUEUE_NAMES.TRYON, err: err.message }, 'Job failed');
    
    const attemptsMade = job?.attemptsMade || 1;
    if (attemptsMade > 1) {
      logger.warn({ jobId: job?.id, attemptsMade }, 'Retry storm / repeated failures detected');
    }
    
    const isPermanent = job && attemptsMade >= (job.opts.attempts || 1);

    if (isPermanent) {
      logger.error({ jobId: job.id, attemptsMade: job.attemptsMade }, 'Job PERMANENTLY failed.');
    }

    if (config.sentry.dsnWorker) {
      Sentry.captureException(err, {
        tags: { 
          queue: QUEUE_NAMES.TRYON, 
          jobId: job?.id,
          permanent: isPermanent ? 'true' : 'false',
        },
        extra: { jobData: job?.data }
      });
    }
  });

  cleanupWorker.on('completed', (job) => {
    logger.info({ jobId: job.id, queue: QUEUE_NAMES.CLEANUP }, 'Cleanup job completed');
  });

  cleanupWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, queue: QUEUE_NAMES.CLEANUP, err: err.message }, 'Cleanup job failed');
    if (config.sentry.dsnWorker) {
      Sentry.captureException(err, {
        tags: { queue: QUEUE_NAMES.CLEANUP, jobId: job?.id }
      });
    }
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    if (config.sentry.dsnWorker) {
      await Sentry.close(2000);
    }
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
