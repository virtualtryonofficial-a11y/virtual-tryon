import * as dotenv from 'dotenv';
import { join } from 'path';

// Load .env from root if it exists
dotenv.config({ path: join(process.cwd(), '.env') });
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
  gemini: {
    apiKey: requireEnv('GEMINI_API_KEY'),
  },
  widget: {
    publicUrl: requireEnv('WIDGET_PUBLIC_URL'),
  },
  shopify: {
    apiKey: requireEnv('SHOPIFY_API_KEY'),
    apiSecret: requireEnv('SHOPIFY_API_SECRET'),
    scopes: process.env['SHOPIFY_SCOPES'] || 'read_products,write_script_tags',
  },
  jwt: {
    secret: requireEnv('JWT_SECRET'),
  },
  admin: {
    apiKey: requireEnv('ADMIN_API_KEY'),
  },
  sentry: {
    dsn: process.env.SENTRY_DSN || '',
  },
} as const;

export type Config = typeof config;
