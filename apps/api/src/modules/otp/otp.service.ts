import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { config as appConfig } from '@trail/config';
import { createLead, createAuditLog, getLeadByTryonRequestId, prisma } from '@trail/db';
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
  private readonly vhUrl: string;
  private readonly vhAccountId: string;
  private readonly vhApiKey: string;

  constructor(private readonly otpRepository: OtpRepository) {
    this.redis = new Redis(appConfig.redis.url, { maxRetriesPerRequest: null });
    this.vhUrl = (process.env.VERIFICATION_HUB_API_URL || 'https://verification-hub-api.onrender.com').replace(/^["']|["']$/g, '').trim();
    this.vhAccountId = (process.env.VERIFICATION_HUB_ACCOUNT_ID || '').replace(/^["']|["']$/g, '').trim();
    this.vhApiKey = (process.env.VERIFICATION_HUB_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  }

  private async callVerificationHub(endpoint: string, payload: any) {
    const url = `${this.vhUrl}${endpoint}`;
    const bodyStr = JSON.stringify(payload);
    const timestamp = new Date().toISOString();

    const payloadToSign = `${timestamp}.POST.${endpoint}.${bodyStr}`;
    const signature = crypto
      .createHmac('sha256', this.vhApiKey)
      .update(payloadToSign)
      .digest('hex');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.vhApiKey}`,
        'x-vh-timestamp': timestamp,
        'x-vh-signature': signature
      },
      body: bodyStr
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Verification Hub Error: ${response.status} ${errorText}`);
      throw new BadRequestException('Verification service error. Please try again.');
    }
    return response.json();
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
    
    const existingLead = await getLeadByTryonRequestId(tryonRequestId);
    if (existingLead) {
      const unlockToken = generateUnlockToken(tenantId, tryonRequestId, appConfig.jwt.secret);
      return {
        otpRequired: false,
        leadId: existingLead.id,
        unlockToken,
      };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + otpConfig.expirySeconds * 1000);
    let session = await this.otpRepository.getSessionByTryon(tryonRequestId);

    if (session) {
      if (session.lastSentAt) {
        const diffSeconds = Math.floor((now.getTime() - session.lastSentAt.getTime()) / 1000);
        if (diffSeconds < otpConfig.resendCooldown) {
          const waitTime = otpConfig.resendCooldown - diffSeconds;
          throw new BadRequestException(`Please wait ${waitTime}s before requesting a new code.`);
        }
      }
      if (session.resendCount >= otpConfig.maxResends) {
        throw new BadRequestException('Maximum resend attempts reached.');
      }
    }

    const identifier = countryCode.startsWith('+') ? `${countryCode}${phoneNumber}` : `+${countryCode}${phoneNumber}`;
    
    let vhRes;
    try {
      vhRes = await this.callVerificationHub('/api/v1/verifications', {
        destination: identifier,
        channel: 'WHATSAPP',
        purpose: 'ADD_TO_CART'
      });
    } catch (err: any) {
      this.logger.error(`Failed to create verification session: ${err.message}`, err.stack);
      throw new BadRequestException('Failed to generate verification code. Please try again.');
    }

    const verificationId = vhRes.data.id;

    if (session) {
      session = await this.otpRepository.updateSession(session.id, {
        customerName,
        countryCode,
        phoneNumber,
        hashedOtp: 'managed-by-verification-hub',
        expiresAt,
        status: 'SENT',
        resendCount: session.resendCount + 1,
        verificationAttempts: 0,
        lastSentAt: now,
        marketingConsent,
        metadata: metadata || {},
        providerMessageId: verificationId,
        provider: 'verification-hub'
      });
    } else {
      session = await this.otpRepository.createSession({
        tenantId,
        tryonRequestId,
        customerName,
        countryCode,
        phoneNumber,
        hashedOtp: 'managed-by-verification-hub',
        expiresAt,
        status: 'SENT',
        resendCount: 0,
        verificationAttempts: 0,
        lastSentAt: now,
        marketingConsent,
        metadata: metadata || {},
        providerMessageId: verificationId,
        provider: 'verification-hub'
      });
    }

    await createAuditLog({
      tenantId,
      action: 'otp_sent',
      actor: 'widget',
      metadata: { tryonRequestId, sessionId: session.id, provider: 'verification-hub' },
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

    if (session.resendCount >= otpConfig.maxResends) {
      throw new BadRequestException('Maximum resend attempts reached.');
    }

    const now = new Date();
    if (session.lastSentAt) {
      const diffSeconds = Math.floor((now.getTime() - session.lastSentAt.getTime()) / 1000);
      if (diffSeconds < otpConfig.resendCooldown) {
        const waitTime = otpConfig.resendCooldown - diffSeconds;
        throw new BadRequestException(`Please wait ${waitTime}s before requesting a new code.`);
      }
    }

    const identifier = session.countryCode.startsWith('+') ? `${session.countryCode}${session.phoneNumber}` : `+${session.countryCode}${session.phoneNumber}`;
    
    let vhRes;
    try {
      vhRes = await this.callVerificationHub('/api/v1/verifications', {
        destination: identifier,
        channel: 'WHATSAPP'
      });
    } catch (err: any) {
      throw new BadRequestException('Failed to generate verification code. Please try again.');
    }
    
    const verificationId = vhRes.data.id;
    const expiresAt = new Date(now.getTime() + otpConfig.expirySeconds * 1000);

    await this.otpRepository.updateSession(session.id, {
      expiresAt,
      status: 'SENT',
      resendCount: session.resendCount + 1,
      verificationAttempts: 0,
      lastSentAt: now,
      providerMessageId: verificationId
    });

    await createAuditLog({
      tenantId,
      action: 'otp_resend',
      actor: 'widget',
      metadata: { tryonRequestId: session.tryonRequestId, sessionId: session.id },
    }).catch(() => {});

    await createAuditLog({
      tenantId,
      action: 'otp_sent',
      actor: 'widget',
      metadata: { tryonRequestId: session.tryonRequestId, sessionId: session.id, provider: 'verification-hub' },
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
    const now = new Date();

    if (now.getTime() > session.expiresAt.getTime()) {
      await this.otpRepository.updateSession(session.id, { status: 'EXPIRED' });
      throw new BadRequestException('Verification code expired. Please request a new code.');
    }

    if (session.verificationAttempts >= otpConfig.maxAttempts) {
      await this.otpRepository.updateSession(session.id, { status: 'LOCKED' });
      await this.otpRepository.deleteSession(session.id).catch(() => {});
      throw new BadRequestException('Maximum verification attempts reached. Please restart.');
    }

    let vhRes;
    try {
      vhRes = await this.callVerificationHub(`/api/v1/verifications/${session.providerMessageId}/validate`, {
        code: otp
      });
    } catch (err: any) {
      this.logger.error(`Failed to validate verification code: ${err.message}`, err.stack);
      const attempts = session.verificationAttempts + 1;
      await this.otpRepository.updateSession(session.id, {
        verificationAttempts: attempts,
      });

      if (attempts >= otpConfig.maxAttempts) {
        await this.otpRepository.updateSession(session.id, { status: 'LOCKED' });
        await this.otpRepository.deleteSession(session.id).catch(() => {});
        throw new BadRequestException('Maximum verification attempts reached. Please restart.');
      }

      if (err.message && err.message.toLowerCase().includes('expired')) {
        throw new BadRequestException('Verification code expired. Please request a new code.');
      }
      throw new BadRequestException('Invalid verification code. Please check your WhatsApp and try again.');
    }

    if (vhRes.data.status !== 'VERIFIED' && vhRes.data.status !== 'COMPLETED') {
      const attempts = session.verificationAttempts + 1;
      await this.otpRepository.updateSession(session.id, { verificationAttempts: attempts });
      throw new BadRequestException('Invalid verification code. Please try again.');
    }

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

    await this.otpRepository.deleteSession(session.id).catch(() => {});
    await this.redis.del(`tryon:${session.tryonRequestId}:response`);

    const unlockToken = generateUnlockToken(tenantId, session.tryonRequestId, appConfig.jwt.secret);

    await createAuditLog({
      tenantId,
      action: 'image_unlocked',
      actor: 'widget',
      metadata: { tryonRequestId: session.tryonRequestId },
    }).catch(() => {});

    let customer = await prisma.customer.findUnique({
      where: {
        tenantId_countryCode_phone: {
          tenantId,
          countryCode: session.countryCode,
          phone: session.phoneNumber
        }
      }
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          tenantId,
          countryCode: session.countryCode,
          phone: session.phoneNumber,
        }
      });
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

    const rememberDurationDays = (tenantConfig as any).rememberDurationDays || 30;
    const expiresAt = new Date(Date.now() + rememberDurationDays * 24 * 60 * 60 * 1000);

    await prisma.customerSession.create({
      data: {
        customerId: customer.id,
        sessionTokenHash,
        expiresAt,
      }
    });

    await prisma.lead.update({
      where: { id: newLead.id },
      data: { customerId: customer.id }
    });

    return {
      success: true,
      leadId: newLead.id,
      unlockToken,
      sessionToken,
    };
  }
}
