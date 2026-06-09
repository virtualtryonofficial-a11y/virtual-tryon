import { Redis } from 'ioredis';
import { config } from '@trail/config';
import { getTenantWithConfig } from '@trail/db';

const redis = new Redis(config.redis.url);

export const TENANT_CONFIG_CACHE_TTL = 300; // 5 minutes

export class TenantNotFoundError extends Error {
  constructor(id: string) {
    super(`Tenant not found: ${id}`);
    this.name = 'TenantNotFoundError';
  }
}

export async function resolveTenantConfig(tenantId: string) {
  const cacheKey = `tenant:${tenantId}:config`;
  
  // 1. Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // 2. Fallback to DB
  const tenant = await getTenantWithConfig(tenantId);
  if (!tenant) {
    throw new TenantNotFoundError(tenantId);
  }

  const result = {
    id: tenant.id,
    name: tenant.name,
    apiKey: tenant.apiKey,   // Required for TenantGuard authentication
    features: tenant.features,
    ...tenant.config,
  };

  // 3. Cache result
  await redis.set(cacheKey, JSON.stringify(result), 'EX', TENANT_CONFIG_CACHE_TTL);

  return result;
}

export async function clearTenantCache(tenantId: string) {
  const cacheKey = `tenant:${tenantId}:config`;
  await redis.del(cacheKey);
}

export * from './webhook.helper';
export * from './purge';
