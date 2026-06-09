import { deleteObject } from '@trail/storage';
import { getTryonRequestsForTenant, purgeTenantFromDb } from '@trail/db';
import { Redis } from 'ioredis';
import { config } from '@trail/config';
import pino from 'pino';

const logger = pino({
  transport: { target: 'pino-pretty' },
});

const redis = new Redis(config.redis.url);

/**
 * Completely purges a tenant's data to support GDPR Right to be Forgotten.
 * Deletes all associated R2 storage images, then performs a cascade database delete,
 * and purges all cached tenant configuration keys from Redis.
 */
export async function purgeTenantData(tenantId: string, shopifyDomain: string): Promise<void> {
  logger.info({ tenantId, shopifyDomain }, 'Starting GDPR tenant data purge workflow');

  try {
    // 1. Fetch all try-on requests to get the keys of uploaded/generated files
    const requests = await getTryonRequestsForTenant(tenantId);
    logger.info({ tenantId, requestCount: requests.length }, 'Found try-on requests to delete from R2');

    let deletedFiles = 0;
    for (const req of requests) {
      if (req.userImageKey) {
        try {
          await deleteObject(req.userImageKey);
          deletedFiles++;
        } catch (err: any) {
          logger.error({ key: req.userImageKey, error: err.message }, 'Failed to delete user image during tenant purge');
        }
      }
      if (req.generatedImageKey) {
        try {
          await deleteObject(req.generatedImageKey);
          deletedFiles++;
        } catch (err: any) {
          logger.error({ key: req.generatedImageKey, error: err.message }, 'Failed to delete generated image during tenant purge');
        }
      }
    }
    logger.info({ tenantId, deletedFiles }, 'Finished purging files from Cloudflare R2');

    // 2. Cascade delete from PostgreSQL database
    await purgeTenantFromDb(tenantId);
    logger.info({ tenantId }, 'Tenant deleted from database');

    // 3. Purge cached data in Redis
    const configCacheKey = `tenant:${tenantId}:config`;
    const tokenCacheKey = `shopify:${shopifyDomain}:token`;
    await redis.del(configCacheKey);
    await redis.del(tokenCacheKey);
    logger.info({ tenantId, shopifyDomain }, 'Redis caches cleared for tenant');

  } catch (error: any) {
    logger.error({ tenantId, shopifyDomain, error: error.message }, 'Failed to complete tenant purge workflow');
    throw error;
  }
}
