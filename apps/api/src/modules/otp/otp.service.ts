import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { config as appConfig } from '@trail/config';
import { createLead, createAuditLog, getLeadByTryonRequestId } from '@trail/db';
import { resolveTenantConfig } from '@trail/tenant';
import { OtpRepository } from './otp.repository';
import { OtpProvider, OtpProviderResponse } from './otp.interface';
import { MockOtpProvider } from './providers/mock-otp.provider';

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

function maskPhoneNumber(countryCode: string, phoneNumber: string, maskEnabled = true): string {
  if (!maskEnabled) return `${countryCode} ${phoneNumber}`;
  const len = phoneNumber.length;
  if (len <= 4) return `${countryCode} ${phoneNumber}`;
  const visibleDigits = 3;
  const masked = 'X'.repeat(len - visibleDigits) + phoneNumber.slice(-visibleDigits);
  return `${countryCode} ${masked}`;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly redis: Redis;
  private readonly provider: OtpProvider;

  constructor(private readonly otpRepository: OtpRepository) {
    this.redis = new Redis(appConfig.redis.url, { maxRetriesPerRequest: null });
    // Bind mock provider for AGENT_TASK_022
    this.provider = new MockOtpProvider();
  }

  private generateNumericOtp(length: number): string {
    const chars = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
      const idx = crypto.randomInt(0, chars.length);
      otp += chars[idx];
    }
    return otp;
  }

  async createOrUpdateSession(
    tenantId: string,
    tryonRequestId: string,
    customerName: string,
    countryCode: string,
    phoneNumber: string,
    marketingConsent: boolean,
    metadata: any
  ) {
    const tenantConfig = await resolveTenantConfig(tenantId);
    const otpConfig = tenantConfig.leadCapture.otpVerification;
    
    // Idempotency: check if lead already exists
    const existingLead = await getLeadByTryonRequestId(tryonRequestId);
    if (existingLead) {
      const unlockToken = generateUnlockToken(tenantId, tryonRequestId, appConfig.jwt.secret);
      return {
        otpRequired: false,
        leadId: existingLead.id,
        unlockToken,
      };
    }

    const otp = this.generateNumericOtp(otpConfig.otpLength);
    const hashedOtp = await bcrypt.hash(otp, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + otpConfig.expirySeconds * 1000);

    let session = await this.otpRepository.getSessionByTryon(tryonRequestId);

    if (session) {
      // Cooldown check
      if (session.lastSentAt) {
        const diffSeconds = Math.floor((now.getTime() - session.lastSentAt.getTime()) / 1000);
        if (diffSeconds < otpConfig.resendCooldown) {
          const waitTime = otpConfig.resendCooldown - diffSeconds;
          throw new BadRequestException(`Please wait ${waitTime}s before requesting a new code.`);
        }
      }

      // Check resend limits
      if (session.resendCount >= otpConfig.maxResends) {
        throw new BadRequestException('Maximum resend attempts reached.');
      }

      session = await this.otpRepository.updateSession(session.id, {
        customerName,
        countryCode,
        phoneNumber,
        hashedOtp,
        expiresAt,
        status: 'PENDING',
        resendCount: session.resendCount + 1,
        verificationAttempts: 0,
        lastSentAt: now,
        marketingConsent,
        metadata: metadata || {},
      });
    } else {
      session = await this.otpRepository.createSession({
        tenantId,
        tryonRequestId,
        customerName,
        countryCode,
        phoneNumber,
        hashedOtp,
        expiresAt,
        status: 'PENDING',
        resendCount: 0,
        verificationAttempts: 0,
        lastSentAt: now,
        marketingConsent,
        metadata: metadata || {},
      });
    }

    await createAuditLog({
      tenantId,
      action: 'otp_requested',
      actor: 'widget',
      metadata: { tryonRequestId, sessionId: session.id },
    }).catch(() => {});

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[TESTING] Saving OTP ${otp} to Redis key test:otp:${session.id}`);
      await this.redis.set(`test:otp:${session.id}`, otp, 'EX', 600);
    }

    // Send OTP
    const providerResponse: OtpProviderResponse = await this.provider.sendOtp(
      phoneNumber,
      countryCode,
      otp,
      tenantConfig.name,
      tenantConfig.name, // brandName fallback
      tenantConfig.logoUrl || undefined
    );

    session = await this.otpRepository.updateSession(session.id, {
      status: 'SENT',
      provider: providerResponse.provider,
      providerMessageId: providerResponse.otpId,
    });

    await createAuditLog({
      tenantId,
      action: 'otp_sent',
      actor: 'widget',
      metadata: { tryonRequestId, sessionId: session.id, provider: providerResponse.provider },
    }).catch(() => {});

    return {
      otpRequired: true,
      otpSessionId: session.id,
      expiresAt: expiresAt.toISOString(),
      resendAfter: otpConfig.resendCooldown,
      maskedPhone: maskPhoneNumber(countryCode, phoneNumber, otpConfig.maskPhone),
    };
  }

  async resendOtp(tenantId: string, otpSessionId: string) {
    const session = await this.otpRepository.getSession(otpSessionId);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException('OTP session not found or tenant mismatch');
    }

    const tenantConfig = await resolveTenantConfig(tenantId);
    const otpConfig = tenantConfig.leadCapture.otpVerification;

    // Check resend limits
    if (session.resendCount >= otpConfig.maxResends) {
      throw new BadRequestException('Maximum resend attempts reached.');
    }

    // Cooldown check
    const now = new Date();
    if (session.lastSentAt) {
      const diffSeconds = Math.floor((now.getTime() - session.lastSentAt.getTime()) / 1000);
      if (diffSeconds < otpConfig.resendCooldown) {
        const waitTime = otpConfig.resendCooldown - diffSeconds;
        throw new BadRequestException(`Please wait ${waitTime}s before requesting a new code.`);
      }
    }

    const otp = this.generateNumericOtp(otpConfig.otpLength);
    const hashedOtp = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(now.getTime() + otpConfig.expirySeconds * 1000);

    await this.otpRepository.updateSession(session.id, {
      hashedOtp,
      expiresAt,
      status: 'PENDING',
      resendCount: session.resendCount + 1,
      verificationAttempts: 0,
      lastSentAt: now,
    });

    await createAuditLog({
      tenantId,
      action: 'otp_resend',
      actor: 'widget',
      metadata: { tryonRequestId: session.tryonRequestId, sessionId: session.id },
    }).catch(() => {});

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[TESTING] Saving OTP ${otp} to Redis key test:otp:${session.id}`);
      await this.redis.set(`test:otp:${session.id}`, otp, 'EX', 600);
    }

    // Send OTP
    const providerResponse = await this.provider.sendOtp(
      session.phoneNumber,
      session.countryCode,
      otp,
      tenantConfig.name,
      tenantConfig.name,
      tenantConfig.logoUrl || undefined
    );

    await this.otpRepository.updateSession(session.id, {
      status: 'SENT',
      provider: providerResponse.provider,
      providerMessageId: providerResponse.otpId,
    });

    await createAuditLog({
      tenantId,
      action: 'otp_sent',
      actor: 'widget',
      metadata: { tryonRequestId: session.tryonRequestId, sessionId: session.id, provider: providerResponse.provider },
    }).catch(() => {});

    return {
      success: true,
      expiresAt: expiresAt.toISOString(),
      resendAfter: otpConfig.resendCooldown,
    };
  }

  async verifyOtp(tenantId: string, otpSessionId: string, otp: string) {
    let session = await this.otpRepository.getSession(otpSessionId);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException('OTP session not found or tenant mismatch');
    }

    const tenantConfig = await resolveTenantConfig(tenantId);
    const otpConfig = tenantConfig.leadCapture.otpVerification;

    // Check expiration
    const now = new Date();
    if (now.getTime() > session.expiresAt.getTime()) {
      await this.otpRepository.updateSession(session.id, { status: 'EXPIRED' });
      await createAuditLog({
        tenantId,
        action: 'otp_expired',
        actor: 'widget',
        metadata: { tryonRequestId: session.tryonRequestId, sessionId: session.id },
      }).catch(() => {});
      throw new BadRequestException('Verification code expired. Please request a new code.');
    }

    // Check max attempts
    if (session.verificationAttempts >= otpConfig.maxAttempts) {
      await this.otpRepository.updateSession(session.id, { status: 'LOCKED' });
      await this.otpRepository.deleteSession(session.id).catch(() => {});
      await createAuditLog({
        tenantId,
        action: 'otp_failed',
        actor: 'widget',
        metadata: { tryonRequestId: session.tryonRequestId, sessionId: session.id, error: 'max_attempts_exceeded' },
      }).catch(() => {});
      throw new BadRequestException('Maximum verification attempts reached. Please restart.');
    }

    // Verify OTP using bcrypt
    const isOtpValid = await bcrypt.compare(otp, session.hashedOtp);

    if (!isOtpValid) {
      const attempts = session.verificationAttempts + 1;
      await this.otpRepository.updateSession(session.id, {
        verificationAttempts: attempts,
      });

      await createAuditLog({
        tenantId,
        action: 'otp_failed',
        actor: 'widget',
        metadata: { tryonRequestId: session.tryonRequestId, sessionId: session.id, attempt: attempts },
      }).catch(() => {});

      if (attempts >= otpConfig.maxAttempts) {
        await this.otpRepository.updateSession(session.id, { status: 'LOCKED' });
        await this.otpRepository.deleteSession(session.id).catch(() => {});
        throw new BadRequestException('Maximum verification attempts reached. Please restart.');
      }

      throw new BadRequestException('Invalid verification code. Please try again.');
    }

    // Successful OTP Verification
    await this.otpRepository.updateSession(session.id, {
      status: 'VERIFIED',
      verifiedAt: now,
    });

    await createAuditLog({
      tenantId,
      action: 'otp_verified',
      actor: 'widget',
      metadata: { tryonRequestId: session.tryonRequestId, sessionId: session.id },
    }).catch(() => {});

    // Create lead record
    const newLead = await createLead({
      tenantId,
      tryonRequestId: session.tryonRequestId,
      customerName: session.customerName,
      phoneNumber: session.phoneNumber,
      countryCode: session.countryCode,
      marketingConsentAt: session.marketingConsent ? now : null,
      whatsappOptInAt: session.marketingConsent ? now : null,
      status: 'NEW',
      metadata: session.metadata || {},
    });

    await createAuditLog({
      tenantId,
      action: 'lead_verified',
      actor: 'widget',
      metadata: { leadId: newLead.id, tryonRequestId: session.tryonRequestId },
    }).catch(() => {});

    // Clean up temporary session record
    await this.otpRepository.deleteSession(session.id).catch(() => {});

    // Clear cached status response
    await this.redis.del(`tryon:${session.tryonRequestId}:response`);

    const unlockToken = generateUnlockToken(tenantId, session.tryonRequestId, appConfig.jwt.secret);

    await createAuditLog({
      tenantId,
      action: 'image_unlocked',
      actor: 'widget',
      metadata: { tryonRequestId: session.tryonRequestId },
    }).catch(() => {});

    return {
      success: true,
      leadId: newLead.id,
      unlockToken,
    };
  }
}
