import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { config } from '@trail/config';
import { createAuditLog } from '@trail/db';

/**
 * Timing-safe string comparison that prevents timing side-channel attacks.
 * Returns false (safe) when the lengths differ instead of throwing.
 */
function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Still run timingSafeEqual on equal-length buffers to avoid short-circuit leaks,
      // but we already know the result is false.
      crypto.timingSafeEqual(Buffer.alloc(bufA.length), Buffer.alloc(bufA.length));
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Extracts the password from an Authorization: Basic <base64> header.
 * Returns null when the header is absent or malformed.
 */
function extractBasicAuthPassword(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx < 0) return null;
    return decoded.slice(colonIdx + 1);
  } catch {
    return null;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip: string = request.ip ?? request.socket?.remoteAddress ?? 'unknown';

    // ── Method 1: X-Admin-Api-Key header (programmatic API consumers) ──────────
    const apiKey = request.headers['x-admin-api-key'] as string | undefined;
    if (apiKey !== undefined) {
      if (timingSafeCompare(apiKey, config.admin.apiKey)) {
        await this.logAuthEvent('admin_login_success', 'admin', ip, 'x-admin-api-key header');
        return true;
      }
      await this.logAuthEvent('admin_login_failure', 'admin', ip, 'invalid x-admin-api-key header');
      throw new UnauthorizedException('Invalid Admin API Key');
    }

    // ── Method 2: HTTP Basic Auth header (browser dashboard users) ────────────
    const basicPassword = extractBasicAuthPassword(request.headers['authorization']);
    if (basicPassword !== null) {
      if (timingSafeCompare(basicPassword, config.admin.apiKey)) {
        await this.logAuthEvent('admin_login_success', 'admin', ip, 'http-basic-auth');
        return true;
      }
      await this.logAuthEvent('admin_login_failure', 'admin', ip, 'invalid http-basic-auth password');
      throw new UnauthorizedException('Invalid admin credentials');
    }

    // ── No credentials provided ───────────────────────────────────────────────
    await this.logAuthEvent('admin_login_failure', 'admin', ip, 'no credentials provided');
    throw new UnauthorizedException('Admin authentication required');
  }

  private async logAuthEvent(
    action: string,
    actor: string,
    ipAddress: string,
    reason: string,
  ): Promise<void> {
    try {
      await createAuditLog({
        tenantId: 'system',
        action,
        actor,
        ipAddress,
        metadata: { reason },
      });
    } catch {
      // Never let audit log failures block authentication responses
    }
  }
}
