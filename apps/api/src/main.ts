import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import basicAuth from 'express-basic-auth';
import { config as appConfig } from '@trail/config';
import { QUEUE_NAMES } from '@trail/queue';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  
  app.useLogger(app.get(Logger));
  app.use(helmet({
    contentSecurityPolicy: false,
  }));
  app.enableCors({ origin: '*' });
  
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Mount Secure Bull Board Dashboard
  const server = app.getHttpAdapter().getInstance();
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const connection = new Redis(appConfig.redis.url, { maxRetriesPerRequest: null });
  const tryonQueue = new Queue(QUEUE_NAMES.TRYON, { connection });
  const cleanupQueue = new Queue(QUEUE_NAMES.CLEANUP, { connection });

  createBullBoard({
    queues: [
      new BullMQAdapter(tryonQueue) as any,
      new BullMQAdapter(cleanupQueue) as any,
    ],
    serverAdapter: serverAdapter,
  });

  // Secure both Bull Board and Visual Dashboard with browser Basic Auth
  const authMiddleware = basicAuth({
    users: { admin: appConfig.admin.apiKey },
    challenge: true,
  });

  server.use('/admin/queues', authMiddleware, serverAdapter.getRouter());
  server.use('/admin/dashboard', authMiddleware);

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
