import { adminClient, apiClient, logResult } from './utils';
import { prisma } from '@trail/db';
import { clearTenantCache } from '@trail/tenant';
import { Redis } from 'ioredis';
import { config as appConfig } from '@trail/config';

export async function runOtpTests() {
  console.log('\n--- Running WhatsApp OTP Verification Engine Tests ---');
  let passed = 0;
  let failed = 0;

  const redis = new Redis(appConfig.redis.url);

  try {
    // 1. Provision Test Tenant
    const tenantRes = await adminClient.post('/admin/tenants', {
      name: 'Tenant OTP Production',
      shopifyDomain: 'otp-production-test.myshopify.com',
      features: ['tryon']
    });

    const tenantId = tenantRes.data?.id;
    const apiKey = tenantRes.data?.apiKey;

    if (!tenantId || !apiKey) {
      logResult('OTP Engine: Test Tenant Creation', false, 'Failed to create tenant');
      return { passed, failed: failed + 1 };
    }
    logResult('OTP Engine: Test Tenant Creation', true);
    passed++;

    // 2. Configure OTP Verification Enabled
    await adminClient.patch(`/admin/tenants/${tenantId}/config`, {
      leadCaptureEnabled: true,
      leadCaptureConfig: {
        enabled: true,
        title: 'Momzcradle Verification',
        fields: [
          { id: 'name', type: 'text', label: 'Full Name', required: true },
          { id: 'phone', type: 'phone', label: 'WhatsApp Number', required: true }
        ],
        otpVerification: {
          enabled: true,
          provider: {
            type: 'mock',
            config: {}
          },
          otpLength: 6,
          expirySeconds: 300,
          maxAttempts: 5,
          maxResends: 3,
          resendCooldown: 30
        }
      }
    });
    await clearTenantCache(tenantId);

    // Create a product
    const product = await prisma.product.create({
      data: {
        tenantId,
        shopifyProductId: 'prod_otp_test',
        imageUrl: 'https://example.com/otp-product.jpg'
      }
    });

    // Create a completed TryOnRequest
    const tryon = await prisma.tryonRequest.create({
      data: {
        tenantId,
        productId: product.id,
        status: 'completed',
        generatedImageKey: `${tenantId}/generated/job_otp`,
        previewImageKey: `${tenantId}/previews/job_otp`
      }
    });

    // ── SCENARIO 1: Submitting Lead Form starts OTP flow and returns Session Details ──
    const initRes = await apiClient.post(`/v1/leads?tenantId=${tenantId}&tenantApiKey=${apiKey}`, {
      tryonRequestId: tryon.id,
      customerName: 'Alice Verification',
      phoneNumber: '9876543210',
      countryCode: '+91',
      marketingConsent: true
    });

    const otpSessionId = initRes.data?.otpSessionId;
    const maskedPhone = initRes.data?.maskedPhone;

    if (initRes.status === 201 && initRes.data?.otpRequired === true && otpSessionId && maskedPhone === '+91 XXXXXXX210') {
      logResult('OTP Engine: Submitting form returns otpSessionId and maskedPhone', true);
      passed++;
    } else {
      logResult('OTP Engine: Submitting form returns otpSessionId and maskedPhone', false, `Expected otpRequired and sessionId, got status ${initRes.status}: ${JSON.stringify(initRes.data)}`);
      failed++;
    }

    // Verify no permanent lead created yet
    const leadBefore = await prisma.lead.findUnique({
      where: { tryonRequestId: tryon.id }
    });
    if (!leadBefore) {
      logResult('OTP Engine: Permanent lead NOT created before verification', true);
      passed++;
    } else {
      logResult('OTP Engine: Permanent lead NOT created before verification', false, 'Lead should not exist');
      failed++;
    }

    // ── SCENARIO 2: Rejects incorrect OTP code and increments attempts ──
    const verifyWrong = await apiClient.post(`/v1/otp/verify?tenantId=${tenantId}&tenantApiKey=${apiKey}`, {
      otpSessionId,
      otp: '000000'
    });
    if (verifyWrong.status === 400 && verifyWrong.data?.message.includes('Invalid verification code')) {
      const session = await prisma.otpSession.findUnique({ where: { id: otpSessionId } });
      if (session?.verificationAttempts === 1) {
        logResult('OTP Engine: Rejects incorrect OTP and increments verificationAttempts', true);
        passed++;
      } else {
        logResult('OTP Engine: Rejects incorrect OTP and increments verificationAttempts', false, `Attempts count expected 1, got: ${session?.verificationAttempts}`);
        failed++;
      }
    } else {
      logResult('OTP Engine: Rejects incorrect OTP and increments verificationAttempts', false, `Expected 400 Invalid verification code, got ${verifyWrong.status}: ${JSON.stringify(verifyWrong.data)}`);
      failed++;
    }

    // ── SCENARIO 3: Cooldown limits (block resends immediately) ──
    const resendImmediate = await apiClient.post(`/v1/otp/resend?tenantId=${tenantId}&tenantApiKey=${apiKey}`, {
      otpSessionId
    });
    if (resendImmediate.status === 400 && resendImmediate.data?.message.includes('before requesting a new code')) {
      logResult('OTP Engine: Enforces OTP resend cooldown limit (400)', true);
      passed++;
    } else {
      logResult('OTP Engine: Enforces OTP resend cooldown limit (400)', false, `Expected 400 cooldown error, got ${resendImmediate.status}: ${JSON.stringify(resendImmediate.data)}`);
      failed++;
    }

    // ── SCENARIO 4: Resending OTP generates a new code and resets attempts ──
    await prisma.otpSession.update({
      where: { id: otpSessionId },
      data: { lastSentAt: new Date(Date.now() - 40000) }
    });
    const resendSuccess = await apiClient.post(`/v1/otp/resend?tenantId=${tenantId}&tenantApiKey=${apiKey}`, {
      otpSessionId
    });
    if (resendSuccess.status === 201 && resendSuccess.data?.success === true) {
      const session = await prisma.otpSession.findUnique({ where: { id: otpSessionId } });
      if (session?.resendCount === 1 && session?.verificationAttempts === 0) {
        logResult('OTP Engine: Resending OTP resets verificationAttempts and updates resendCount', true);
        passed++;
      } else {
        logResult('OTP Engine: Resending OTP resets verificationAttempts and updates resendCount', false, `Expected resendCount=1 and attempts=0, got resendCount=${session?.resendCount}, attempts=${session?.verificationAttempts}`);
        failed++;
      }
    } else {
      logResult('OTP Engine: Resending OTP resets verificationAttempts and updates resendCount', false, `Expected 201 success, got ${resendSuccess.status}: ${JSON.stringify(resendSuccess.data)}`);
      failed++;
    }

    // ── SCENARIO 5: Maximum verification attempts (fails and deletes session on 5th failure) ──
    // We already made 1 wrong attempt, then resent (which reset attempts to 0). Now we make 5 wrong attempts.
    for (let i = 0; i < 4; i++) {
      await apiClient.post(`/v1/otp/verify?tenantId=${tenantId}&tenantApiKey=${apiKey}`, {
        otpSessionId,
        otp: '000000'
      });
    }
    const finalWrong = await apiClient.post(`/v1/otp/verify?tenantId=${tenantId}&tenantApiKey=${apiKey}`, {
      otpSessionId,
      otp: '000000'
    });
    if (finalWrong.status === 400 && finalWrong.data?.message.includes('attempts reached')) {
      const session = await prisma.otpSession.findUnique({ where: { id: otpSessionId } });
      if (!session) {
        logResult('OTP Engine: Deletes OtpSession after max attempts exceeded', true);
        passed++;
      } else {
        logResult('OTP Engine: Deletes OtpSession after max attempts exceeded', false, 'Session still exists in DB');
        failed++;
      }
    } else {
      logResult('OTP Engine: Deletes OtpSession after max attempts exceeded', false, `Expected 400 attempts reached, got ${finalWrong.status}: ${JSON.stringify(finalWrong.data)}`);
      failed++;
    }

    // ── SCENARIO 6: Successful Verification promotes session to permanent Lead ──
    // Start a new session
    const initRes2 = await apiClient.post(`/v1/leads?tenantId=${tenantId}&tenantApiKey=${apiKey}`, {
      tryonRequestId: tryon.id,
      customerName: 'Alice Verified',
      phoneNumber: '9876543210',
      countryCode: '+91',
      marketingConsent: true,
      metadata: { referrer: 'ad_campaign' }
    });
    const otpSessionId2 = initRes2.data?.otpSessionId;

    // Fetch the generated OTP code from redis (saved in test mode)
    const otpCode = await redis.get(`test:otp:${otpSessionId2}`);
    if (!otpCode) {
      logResult('OTP Engine: Promote Flow - Fetch OTP code from Redis', false, 'OTP code not found in Redis');
      failed++;
    } else {
      // Verify with correct OTP
      const verifySuccess = await apiClient.post(`/v1/otp/verify?tenantId=${tenantId}&tenantApiKey=${apiKey}`, {
        otpSessionId: otpSessionId2,
        otp: otpCode
      });

      const unlockToken = verifySuccess.data?.unlockToken;

      if (verifySuccess.status === 201 && verifySuccess.data?.success === true && unlockToken) {
        // Verify OtpSession deleted
        const session2 = await prisma.otpSession.findUnique({ where: { id: otpSessionId2 } });
        // Verify permanent Lead created
        const lead = await prisma.lead.findUnique({ where: { tryonRequestId: tryon.id } });

        if (!session2 && lead?.customerName === 'Alice Verified' && (lead?.metadata as any)?.referrer === 'ad_campaign') {
          logResult('OTP Engine: Correct OTP verification promotes session to Lead and clears session', true);
          passed++;
        } else {
          logResult('OTP Engine: Correct OTP verification promotes session to Lead and clears session', false, `Verification check failed. Session exists: ${!!session2}, Lead exists: ${!!lead}`);
          failed++;
        }

        // Verify image unlocking
        const unlockRes = await apiClient.post(`/v1/tryon/unlock?tenantId=${tenantId}&tenantApiKey=${apiKey}`, {
          unlockToken
        });
        if (unlockRes.status === 201 && unlockRes.data?.imageUrl) {
          logResult('OTP Engine: Image unlocks successfully after verification', true);
          passed++;
        } else {
          logResult('OTP Engine: Image unlocks successfully after verification', false, `Unlock failed with status ${unlockRes.status}: ${JSON.stringify(unlockRes.data)}`);
          failed++;
        }

      } else {
        logResult('OTP Engine: Correct OTP verification promotes session to Lead and clears session', false, `Expected 201 verified, got ${verifySuccess.status}: ${JSON.stringify(verifySuccess.data)}`);
        failed++;
      }
    }

    // ── SCENARIO 7: Cross-Tenant Protection ──
    // Create another tenant
    const tenantResB = await adminClient.post('/admin/tenants', {
      name: 'Tenant OTP BadGuy',
      shopifyDomain: 'otp-badguy.myshopify.com',
      features: ['tryon']
    });
    const tenantB = tenantResB.data?.id;
    const apiKeyB = tenantResB.data?.apiKey;

    // Enable lead capture and OTP verification for Tenant B
    await adminClient.patch(`/admin/tenants/${tenantB}/config`, {
      leadCaptureEnabled: true,
      leadCaptureConfig: {
        enabled: true,
        otpVerification: {
          enabled: true
        }
      }
    });
    await clearTenantCache(tenantB);

    const tryonB = await prisma.tryonRequest.create({
      data: {
        tenantId: tenantB,
        productId: product.id,
        status: 'completed',
        generatedImageKey: `${tenantB}/generated/job_otp_b`,
        previewImageKey: `${tenantB}/previews/job_otp_b`
      }
    });

    const initResB = await apiClient.post(`/v1/leads?tenantId=${tenantB}&tenantApiKey=${apiKeyB}`, {
      tryonRequestId: tryonB.id,
      customerName: 'Bob CrossTenant',
      phoneNumber: '9876543211',
      countryCode: '+91',
      marketingConsent: true
    });
    const otpSessionIdB = initResB.data?.otpSessionId;

    // Tenant A tries to verify Tenant B's OTP session
    const crossTenantVerify = await apiClient.post(`/v1/otp/verify?tenantId=${tenantId}&tenantApiKey=${apiKey}`, {
      otpSessionId: otpSessionIdB,
      otp: '123456'
    });
    if (crossTenantVerify.status === 404) {
      logResult('OTP Engine: Prevents cross-tenant verification attempts (404)', true);
      passed++;
    } else {
      logResult('OTP Engine: Prevents cross-tenant verification attempts (404)', false, `Expected 404 Not Found, got: ${crossTenantVerify.status}`);
      failed++;
    }

    // ── SCENARIO 8: Backward Compatibility (OTP Disabled) ──
    // Configure OTP Verification Disabled
    await adminClient.patch(`/admin/tenants/${tenantId}/config`, {
      leadCaptureEnabled: true,
      leadCaptureConfig: {
        enabled: true,
        otpVerification: {
          enabled: false
        }
      }
    });
    await clearTenantCache(tenantId);

    // Create a new TryOnRequest
    const tryonDisabled = await prisma.tryonRequest.create({
      data: {
        tenantId,
        productId: product.id,
        status: 'completed',
        generatedImageKey: `${tenantId}/generated/job_otp_disabled`,
        previewImageKey: `${tenantId}/previews/job_otp_disabled`
      }
    });

    const directRes = await apiClient.post(`/v1/leads?tenantId=${tenantId}&tenantApiKey=${apiKey}`, {
      tryonRequestId: tryonDisabled.id,
      customerName: 'Alice BackwardCompat',
      phoneNumber: '9876543212',
      countryCode: '+91',
      marketingConsent: true
    });
    if (directRes.status === 201 && directRes.data?.otpRequired !== true && directRes.data?.unlockToken) {
      logResult('OTP Engine: Backward compatibility verified (OTP disabled directly capture leads)', true);
      passed++;
    } else {
      logResult('OTP Engine: Backward compatibility verified (OTP disabled directly capture leads)', false, `Expected 201 direct capture, got status ${directRes.status}: ${JSON.stringify(directRes.data)}`);
      failed++;
    }

  } catch (err: any) {
    console.error('OTP E2E test error:', err.message);
    failed++;
  }

  // Clean up database test entries
  try {
    await prisma.tenant.deleteMany({
      where: {
        shopifyDomain: {
          in: ['otp-production-test.myshopify.com', 'otp-badguy.myshopify.com']
        }
      }
    });
  } catch (e) {}

  await redis.quit();

  return { passed, failed };
}
