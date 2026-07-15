import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import * as crypto from 'crypto';
import { config as appConfig } from '@trail/config';
import {
  createLead,
  getLeadByTryonRequestId,
  getLeadsForTenant,
  getTryonRequest,
  createAuditLog,
  getLeadByPhone,
} from '@trail/db';
import { getSignedReadUrl } from '@trail/storage';
import { resolveTenantConfig } from '@trail/tenant';
import { CreateLeadDto, UnlockTryonDto, LeadResponse } from './lead.dto';
import { OtpService } from '../otp/otp.service';

interface TokenPayload {
  tenantId: string;
  tryonRequestId: string;
  expiresAt: number;
}

function generateUnlockToken(tenantId: string, tryonRequestId: string, secret: string, expiresInSeconds = 600): string {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const payload: TokenPayload = { tenantId, tryonRequestId, expiresAt };
  const payloadStr = JSON.stringify(payload);
  const base64Payload = Buffer.from(payloadStr).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', secret)
    .update(base64Payload)
    .digest('base64url');
    
  return `${base64Payload}.${signature}`;
}

function verifyUnlockToken(token: string, secret: string): TokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid token format');
  }
  const [base64Payload, signature] = parts;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(base64Payload)
    .digest('base64url');
    
  const isSignatureValid = crypto.timingSafeEqual(
    Buffer.from(signature, 'base64url'),
    Buffer.from(expectedSignature, 'base64url')
  );
  if (!isSignatureValid) {
    throw new Error('Invalid token signature');
  }
  
  const payloadStr = Buffer.from(base64Payload, 'base64url').toString('utf8');
  const payload: TokenPayload = JSON.parse(payloadStr);
  
  if (Date.now() > payload.expiresAt) {
    throw new Error('Token expired');
  }
  
  return payload;
}

@Injectable()
export class LeadService {
  private readonly logger: Logger;
  private redis: Redis;

  constructor(private readonly otpService?: OtpService) {
    this.logger = new Logger(LeadService.name);
    this.redis = new Redis(appConfig.redis.url, { maxRetriesPerRequest: null });
  }

  async generateUnlockToken(tenantId: string, tryonRequestId: string): Promise<string> {
    return generateUnlockToken(tenantId, tryonRequestId, appConfig.jwt.secret);
  }

  async createOrUpdateLead(tenantId: string, dto: CreateLeadDto): Promise<LeadResponse> {
    // 1. Verify tenant config and lead capture feature flag
    const tenantConfig = await resolveTenantConfig(tenantId);
    if (!tenantConfig.leadCaptureEnabled) {
      throw new BadRequestException('Lead capture is not enabled for this tenant');
    }

    // 2. Validate marketing consent
    if (dto.marketingConsent !== true) {
      throw new ForbiddenException('Marketing consent must be accepted to unlock the try-on');
    }

    // Dynamic fields validation from tenant config
    const leadConfig = (tenantConfig as any).leadCapture;
    const configFields = leadConfig?.fields || [];
    for (const field of configFields) {
      const isRequired = field.required === true;
      if (field.id === 'name') {
        if (isRequired && (!dto.customerName || !dto.customerName.trim())) {
          throw new BadRequestException('Full Name is required');
        }
      } else if (field.id === 'phone') {
        if (isRequired && (!dto.phoneNumber || !dto.phoneNumber.trim())) {
          throw new BadRequestException('Mobile Number is required');
        }
        if (dto.phoneNumber) {
          const cleanPhone = dto.phoneNumber.replace(/[\s\-()]/g, '');
          if (!/^\+?[1-9]\d{1,14}$/.test(cleanPhone) && !/^\d{4,15}$/.test(cleanPhone)) {
            throw new BadRequestException('Phone number format is invalid');
          }
        }
      } else {
        // Dynamic dynamic fields check (email, city, gender, birthday, etc.)
        const val = dto.metadata?.[field.id];
        if (isRequired && (val === undefined || val === null || String(val).trim() === '')) {
          throw new BadRequestException(`${field.label || field.id} is required`);
        }
      }
    }

    // 3. Validate TryOnRequest ownership & status
    const tryon = await getTryonRequest(dto.tryonRequestId);
    if (!tryon || tryon.tenantId !== tenantId) {
      throw new NotFoundException(`TryOnRequest ${dto.tryonRequestId} not found or tenant mismatch`);
    }
    if (tryon.status !== 'completed') {
      throw new BadRequestException('Try-On job must be completed before capturing lead details');
    }

    // OTP Gating check
    const otpConfig = tenantConfig.leadCapture?.otpVerification;
    let bypassOtp = false;

    if (otpConfig?.enabled === true) {
      if (dto.phoneNumber) {
        const cleanPhone = dto.phoneNumber.replace(/[\s\-()]/g, '');
        const recentLead = await getLeadByPhone(tenantId, dto.countryCode || '', cleanPhone);
        if (recentLead && (Date.now() - recentLead.createdAt.getTime()) <= 24 * 60 * 60 * 1000) {
          this.logger.debug(`[OTP Bypass] Skipping OTP for recently verified phone: ${cleanPhone}`);
          bypassOtp = true;
        }
      }

      if (!bypassOtp) {
        if (!this.otpService) {
          throw new Error('OtpService is not initialized');
        }
        return this.otpService.createOrUpdateSession(
          tenantId,
          tryon.id,
          dto.customerName || '',
          dto.countryCode || '',
          dto.phoneNumber || '',
          dto.marketingConsent || false,
          dto.metadata
        ) as any;
      }
    }

    // 4. Idempotency Check — if lead already captured for this specific tryonRequestId, return immediately
    const existingByTryon = await getLeadByTryonRequestId(dto.tryonRequestId);
    if (existingByTryon) {
      this.logger.debug(`[Idempotent Lead] Lead already exists for tryonRequestId: ${dto.tryonRequestId}`);
      const unlockToken = await this.generateUnlockToken(tenantId, tryon.id);
      return {
        success: true,
        leadId: existingByTryon.id,
        unlockToken,
        requiresLeadCapture: false,
      };
    }

    // 5. Create lead record
    const now = new Date();
    const newLead = await createLead({
      tenantId,
      tryonRequestId: tryon.id,
      customerName: dto.customerName || '',
      phoneNumber: dto.phoneNumber || '',
      countryCode: dto.countryCode || '',
      marketingConsentAt: now,
      whatsappOptInAt: now,
      status: 'NEW',
      metadata: dto.metadata || {},
    });

    // Clear cached response so polling getStatus returns full imageUrl now that lead is captured
    await this.redis.del(`tryon:${tryon.id}:response`);

    // 6. Generate Unlock Token for revealing final high-res image
    const unlockToken = await this.generateUnlockToken(tenantId, tryon.id);

    return {
      success: true,
      leadId: newLead.id,
      unlockToken,
      requiresLeadCapture: false,
    };
  }

  async trackEvent(tenantId: string, dto: any) {
    await createAuditLog({
      tenantId,
      action: dto.event,
      actor: 'widget',
      metadata: dto.metadata || {},
    }).catch((e: any) => {
      this.logger.warn(`Failed to create audit log for event ${dto.event}: ${e.message}`);
    });
    return { success: true };
  }

  async unlockTryon(tenantId: string, dto: UnlockTryonDto): Promise<{
    imageUrl: string;
    downloadUrl: string;
    compliment?: string;
    expiresAt: string;
  }> {
    let payload: TokenPayload;
    try {
      payload = verifyUnlockToken(dto.unlockToken, appConfig.jwt.secret);
    } catch (err: any) {
      throw new UnauthorizedException(err.message || 'Invalid or expired unlock token');
    }

    const { tenantId: tokenTenantId, tryonRequestId } = payload;
    if (tokenTenantId !== tenantId) {
      this.logger.warn(`[Cross-Tenant Attempt] Unlock token tenant ${tokenTenantId} mismatched with requester ${tenantId}`);
      throw new UnauthorizedException('Cross-tenant unlock token access forbidden');
    }

    // Verify lead actually exists for this job before granting R2 URL access
    const lead = await getLeadByTryonRequestId(tryonRequestId);
    if (!lead) {
      throw new UnauthorizedException('Lead capture is required prior to unlocking generated image');
    }

    const tryon = await getTryonRequest(tryonRequestId);
    if (!tryon || tryon.tenantId !== tenantId) {
      throw new NotFoundException('Try-On request not found');
    }
    if (tryon.status !== 'completed') {
      throw new BadRequestException('Try-On job not completed yet');
    }
    if (!tryon.generatedImageKey) {
      throw new NotFoundException('Generated Try-On image not found in storage');
    }

    const expiresIn = 3600; // 1 hour
    const imageUrl = await getSignedReadUrl(tryon.generatedImageKey, expiresIn);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return {
      imageUrl,
      downloadUrl: imageUrl,
      compliment: tryon.compliment ?? undefined,
      expiresAt,
    };
  }

  async getLeadsByTenant(tenantId: string, options?: { productId?: string; status?: string }) {
    return getLeadsForTenant(tenantId, options);
  }
}
