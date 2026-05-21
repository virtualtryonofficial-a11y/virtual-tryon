import * as dotenv from 'dotenv';
import { join } from 'path';

// Load .env from root or parent directories if it exists (monorepo support)
dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '..', '.env') });
dotenv.config({ path: join(process.cwd(), '..', '..', '.env') });
dotenv.config(); // Also check local

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return val;
}

export const config = {
  database: {
    url: requireEnv('DATABASE_URL'),
  },
  redis: {
    url: requireEnv('REDIS_URL'),
  },
  r2: {
    accountId: requireEnv('R2_ACCOUNT_ID'),
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    bucketName: requireEnv('R2_BUCKET_NAME'),
    publicUrl: requireEnv('R2_PUBLIC_URL'),
  },
  segmind: {
    apiKey: requireEnv('SEGMIND_API_KEY'),
  },
  fitroom: {
    apiKey: process.env['FITROOM_API_KEY'] || '',
    apiUrl: process.env['FITROOM_API_URL'] || '',
  },
  aiProvider: requireEnv('AI_PROVIDER'),
  gemini: {
    apiKey: requireEnv('GEMINI_API_KEY'),
  },
  widget: {
    publicUrl: requireEnv('WIDGET_PUBLIC_URL'),
  },
  shopify: {
    apiKey: process.env['SHOPIFY_API_KEY'] || 'mock_client_id_placeholder',
    apiSecret: process.env['SHOPIFY_API_SECRET'] || 'mock_client_secret_placeholder',
    appUrl: process.env['SHOPIFY_APP_URL'] || 'http://localhost:3000',
    scopes: process.env['SHOPIFY_SCOPES'] || 'read_products,write_script_tags',
  },
  jwt: {
    secret: requireEnv('JWT_SECRET'),
  },
  admin: {
    apiKey: requireEnv('ADMIN_API_KEY'),
  },
  sentry: {
    dsnApi: process.env.SENTRY_DSN_API || '',
    dsnWorker: process.env.SENTRY_DSN_WORKER || '',
  },
} as const;

export type Config = typeof config;
