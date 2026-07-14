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

  const leadCaptureConfig = (tenant.config?.leadCaptureConfig as any) || null;
  const leadCaptureEnabled = tenant.config?.leadCaptureEnabled === true || leadCaptureConfig?.enabled === true;

  const result = {
    ...tenant.config,
    id: tenant.id,
    name: tenant.name,
    apiKey: tenant.apiKey,   // Required for TenantGuard authentication
    features: tenant.features,
    leadCaptureEnabled,
    leadCapture: {
      enabled: leadCaptureEnabled,
      title: leadCaptureConfig?.title || 'Unlock Your Styling',
      subtitle: leadCaptureConfig?.subtitle || 'Enter your details below to reveal the original high-resolution styling.',
      buttonText: leadCaptureConfig?.buttonText || 'Unlock High-Res Image',
      successMessage: leadCaptureConfig?.successMessage || 'Preparing your high-resolution image...',
      consentText: (leadCaptureConfig?.consentText || 'I agree to receive personalized updates and styling offers from {{brandName}}.').replace(/\{\{\s*brandName\s*\}\}/g, tenant.name),
      fields: leadCaptureConfig?.fields || [
        { id: 'name', type: 'text', label: 'Full Name', required: true },
        { id: 'phone', type: 'phone', label: 'Mobile Number', required: true }
      ],
      otpVerification: {
        enabled: leadCaptureConfig?.otpVerification?.enabled === true,
        provider: {
          type: leadCaptureConfig?.otpVerification?.provider?.type || 'mock',
          config: leadCaptureConfig?.otpVerification?.provider?.config || {}
        },
        otpLength: leadCaptureConfig?.otpVerification?.otpLength || 6,
        expirySeconds: leadCaptureConfig?.otpVerification?.expirySeconds || 300,
        maxAttempts: leadCaptureConfig?.otpVerification?.maxAttempts || 5,
        maxResends: leadCaptureConfig?.otpVerification?.maxResends || 3,
        resendCooldown: leadCaptureConfig?.otpVerification?.resendCooldown || 30,
        maskPhone: leadCaptureConfig?.otpVerification?.maskPhone !== false,
        autoSubmit: leadCaptureConfig?.otpVerification?.autoSubmit === true
      }
    }
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
