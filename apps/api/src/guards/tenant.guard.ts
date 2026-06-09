import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { resolveTenantConfig, TenantNotFoundError } from '@trail/tenant';

/**
 * Timing-safe string comparison to prevent timing side-channel attacks
 * on the tenant API key validation.
 */
function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      crypto.timingSafeEqual(Buffer.alloc(bufA.length), Buffer.alloc(bufA.length));
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

@Injectable()
export class TenantGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // ── 1. Extract tenantId ────────────────────────────────────────────────────
    const tenantId: string | undefined =
      request.body?.tenantId ||
      request.query?.tenantId ||
      request.params?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    // ── 2. Extract tenantApiKey ────────────────────────────────────────────────
    // Accept via dedicated header OR request body (widget POST) OR query param (GET polling).
    const tenantApiKey: string | undefined =
      (request.headers['x-tenant-api-key'] as string | undefined) ||
      request.body?.tenantApiKey ||
      request.query?.tenantApiKey;

    if (!tenantApiKey) {
      throw new UnauthorizedException(
        'x-tenant-api-key header or tenantApiKey field is required',
      );
    }

    // ── 3. Resolve tenant from cache / DB ─────────────────────────────────────
    let tenantConfig: Awaited<ReturnType<typeof resolveTenantConfig>>;
    try {
      tenantConfig = await resolveTenantConfig(tenantId);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        // Return generic 401 — don't reveal whether the tenant exists
        throw new UnauthorizedException('Invalid tenant credentials');
      }
      throw error;
    }

    // ── 4. Validate API key (timing-safe) ─────────────────────────────────────
    if (!timingSafeCompare(tenantApiKey, tenantConfig.apiKey)) {
      throw new UnauthorizedException('Invalid tenant credentials');
    }

    // ── 5. Attach resolved tenant config to the request ───────────────────────
    request.tenant = tenantConfig;
    return true;
  }
}
