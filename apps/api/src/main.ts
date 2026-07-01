import 'reflect-metadata';
import './instrument';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
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
import { RequestSanitizationPipe } from './common/pipes/sanitize.pipe';
import { SentryExceptionFilter } from './common/filters/sentry.filter';
import { json, urlencoded } from 'express';


// ── CORS allowlist ────────────────────────────────────────────────────────────
// Uses EXACT Set membership — no substring matching to prevent
// "evil-onrender.com.attacker.com" style bypasses.
const ALLOWED_ORIGINS = new Set([
  'https://virtual-trail.pages.dev',
  'https://app.virtual-trail.com',
  'https://admin.virtual-trail.com',
  'https://momzcradle.in',
  'https://www.momzcradle.in',
  'https://autoshipp.com',
  'https://www.autoshipp.com',
  'https://autoshipp.in',
  'https://www.autoshipp.in',
  // Development origins — kept here so they can be reviewed explicitly
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]);

/**
 * Returns true for any Demo Portal host or custom subdomains.
 */
function isDemoPortalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    return (
      url.protocol === 'https:' &&
      (hostname === 'virtual-tryon-demo-portal.vercel.app' ||
        hostname.endsWith('.virtual-tryon-demo-portal.vercel.app') ||
        hostname === 'demo.virtualtrail.ai' ||
        hostname.endsWith('.demo.virtualtrail.ai') ||
        hostname === 'virtual-trail.pages.dev' ||
        hostname.endsWith('.virtual-trail.pages.dev'))
    );
  } catch {
    return false;
  }
}

/**
 * Returns true for any *.myshopify.com merchant storefront.
 * Uses strict suffix matching — not suffix substring — to prevent spoofing.
 */
function isShopifyOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'myshopify.com' || url.hostname.endsWith('.myshopify.com'))
    );
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  app.useLogger(app.get(Logger));

  // ── Body Parser Limits — allow Base64 image uploads ────────────────────────
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  // ── Security headers ────────────────────────────────────────────────────────
  app.use(
    helmet({
      // CSP is intentionally omitted for the API server (JSON-only responses).
      // The admin dashboard HTML sets its own restrictive CSP inline.
      contentSecurityPolicy: false,
      // All other Helmet defaults apply: X-Frame-Options, X-Content-Type-Options,
      // HSTS (max-age=15552000), Referrer-Policy: no-referrer, etc.
    }),
  );

  // ── CORS — exact-match allowlist ────────────────────────────────────────────
  app.enableCors({
    origin: (origin, callback) => {
      // No-origin requests (server-to-server, curl, mobile): allow
      if (!origin) {
        callback(null, true);
        return;
      }

      if (ALLOWED_ORIGINS.has(origin) || isShopifyOrigin(origin) || isDemoPortalOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin "${origin}" is not permitted by CORS policy`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-api-key',
      'x-request-id',
    ],
  });

  app.useGlobalPipes(
    new RequestSanitizationPipe(),
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryExceptionFilter(httpAdapter));

  // ── Admin area — Basic Auth on ALL /admin/* routes ────────────────────────
  // Applying one middleware to the /admin prefix covers:
  //   • /admin/dashboard   — visual analytics dashboard
  //   • /admin/queues/*    — Bull Board queue monitor
  //   • /admin/tenants     — tenant management API (also protected by AdminGuard)
  //   • /admin/analytics   — dashboard data API
  //   • /admin/costs       — cost analytics API
  const server = app.getHttpAdapter().getInstance();

  const authMiddleware = basicAuth({
    authorizer: (username: string, password: string): boolean => {
      const validUsername = basicAuth.safeCompare(username, 'admin');
      const validPassword = basicAuth.safeCompare(password, appConfig.admin.apiKey);
      return validUsername && validPassword;
    },
    authorizeAsync: false,
    challenge: true,
    realm: 'Virtual-Trail Admin',
  });

  // Mount Bull Board BEFORE the auth middleware so the serverAdapter
  // registers its routes first; auth is enforced at the /admin level.
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const connection = new Redis(appConfig.redis.url, { maxRetriesPerRequest: null });
  const tryonQueue = new Queue(QUEUE_NAMES.TRYON, { connection });
  const cleanupQueue = new Queue(QUEUE_NAMES.CLEANUP, { connection });
  const dlqQueue = new Queue('tryon-dlq', { connection });

  createBullBoard({
    queues: [
      new BullMQAdapter(tryonQueue) as any,
      new BullMQAdapter(cleanupQueue) as any,
      new BullMQAdapter(dlqQueue) as any,
    ],
    serverAdapter,
  });

  // Single auth middleware guards the entire /admin namespace
  server.use('/admin', authMiddleware);
  // Bull Board router registered after auth; Express evaluates middleware
  // in registration order so auth always runs first.
  server.use('/admin/queues', serverAdapter.getRouter());

  await app.listen(process.env.PORT || 3000);
}

bootstrap();
