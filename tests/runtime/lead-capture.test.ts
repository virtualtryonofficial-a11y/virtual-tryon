import { adminClient, apiClient, logResult } from './utils';
import { prisma } from '@trail/db';
import { clearTenantCache } from '@trail/tenant';

export async function runLeadCaptureTests() {
  console.log('\n--- Running Lead Capture & Image Unlock Tests ---');
  let passed = 0;
  let failed = 0;

  try {
    // 1. Create two test tenants
    const tenantResA = await adminClient.post('/admin/tenants', {
      name: 'Tenant LeadCapture Enabled',
      shopifyDomain: 'leadcapture-enabled.myshopify.com',
      features: ['tryon']
    });

    const tenantResB = await adminClient.post('/admin/tenants', {
      name: 'Tenant LeadCapture Disabled',
      shopifyDomain: 'leadcapture-disabled.myshopify.com',
      features: ['tryon']
    });

    const tenantA = tenantResA.data?.id;
    const apiKeyA = tenantResA.data?.apiKey;
    const tenantB = tenantResB.data?.id;
    const apiKeyB = tenantResB.data?.apiKey;

    if (!tenantA || !tenantB || !apiKeyA || !apiKeyB) {
      logResult('Lead Capture: Test Tenant Creation', false, 'Failed to create tenants');
      return { passed, failed: failed + 1 };
    }
    logResult('Lead Capture: Test Tenant Creation', true);
    passed++;

    // Configure Tenant A to have leadCaptureEnabled = true
    await adminClient.patch(`/admin/tenants/${tenantA}/config`, {
      leadCaptureEnabled: true
    });

    // Create products for both tenants
    const productA = await prisma.product.create({
      data: {
        tenantId: tenantA,
        shopifyProductId: 'prod_lead_a',
        imageUrl: 'https://example.com/product-a.jpg'
      }
    });

    const productB = await prisma.product.create({
      data: {
        tenantId: tenantB,
        shopifyProductId: 'prod_lead_b',
        imageUrl: 'https://example.com/product-b.jpg'
      }
    });

    // Create a completed TryOnRequest for Tenant B (Lead Capture Disabled)
    const tryonB = await prisma.tryonRequest.create({
      data: {
        tenantId: tenantB,
        productId: productB.id,
        status: 'completed',
        generatedImageKey: `${tenantB}/generated/job_b`,
        previewImageKey: `${tenantB}/previews/job_b`,
        compliment: 'Style score: 9.0!',
        styleScore: 9.0
      }
    });

    // Create a completed TryOnRequest for Tenant A (Lead Capture Enabled)
    const tryonA = await prisma.tryonRequest.create({
      data: {
        tenantId: tenantA,
        productId: productA.id,
        status: 'completed',
        generatedImageKey: `${tenantA}/generated/job_a`,
        previewImageKey: `${tenantA}/previews/job_a`,
        compliment: 'Style score: 9.5!',
        styleScore: 9.5
      }
    });

    // Create a processing TryOnRequest for Tenant A (to test preview before completion)
    const tryonProcessing = await prisma.tryonRequest.create({
      data: {
        tenantId: tenantA,
        productId: productA.id,
        status: 'processing',
        generatedImageKey: null,
        previewImageKey: null
      }
    });

    // ── SCENARIO 1: Standard Flow (Lead Capture Disabled) ────────────────────
    const pollB = await apiClient.get(`/v1/tryon/${tryonB.id}?tenantId=${tenantB}&tenantApiKey=${apiKeyB}`);
    if (pollB.status === 200 && pollB.data?.status === 'unlocked' && pollB.data?.imageUrl && !pollB.data?.requiresLeadCapture) {
      logResult('Standard Flow (Lead Capture Disabled) returns original image directly', true);
      passed++;
    } else {
      logResult('Standard Flow (Lead Capture Disabled) returns original image directly', false, `Expected requiresLeadCapture=false and status=unlocked, got: ${JSON.stringify(pollB.data)}`);
      failed++;
    }

    // ── SCENARIO 2: Lead Capture Enabled (Before Submission) ─────────────────
    const pollA = await apiClient.get(`/v1/tryon/${tryonA.id}?tenantId=${tenantA}&tenantApiKey=${apiKeyA}`);
    if (
      pollA.status === 200 &&
      pollA.data?.status === 'awaiting_lead' &&
      pollA.data?.requiresLeadCapture === true &&
      pollA.data?.unlockRequired === true &&
      pollA.data?.previewImageUrl &&
      pollA.data?.unlockToken &&
      pollA.data?.expiresAt &&
      !pollA.data?.imageUrl
    ) {
      logResult('Lead Capture Flow returns blurred preview URL and unlock token', true);
      passed++;
    } else {
      logResult('Lead Capture Flow returns blurred preview URL and unlock token', false, `Expected requiresLeadCapture=true and status=awaiting_lead, got: ${JSON.stringify(pollA.data)}`);
      failed++;
    }

    const unlockToken = pollA.data?.unlockToken;

    // ── SCENARIO 3: Preview Before Completion ────────────────────────────────
    const pollProcessing = await apiClient.get(`/v1/tryon/${tryonProcessing.id}?tenantId=${tenantA}&tenantApiKey=${apiKeyA}`);
    if (pollProcessing.status === 200 && pollProcessing.data?.status === 'processing' && !pollProcessing.data?.previewImageUrl) {
      logResult('Preview before completion handles status correctly', true);
      passed++;
    } else {
      logResult('Preview before completion handles status correctly', false, `Expected status=processing and no previewImageUrl, got: ${JSON.stringify(pollProcessing.data)}`);
      failed++;
    }

    // ── SCENARIO 4: Lead Submission without Consent (403) ───────────────────
    const leadNoConsent = await apiClient.post(`/v1/leads?tenantId=${tenantA}&tenantApiKey=${apiKeyA}`, {
      tryonRequestId: tryonA.id,
      customerName: 'Alice Smith',
      phoneNumber: '9876543210',
      countryCode: '+91',
      marketingConsent: false
    });
    if (leadNoConsent.status === 403) {
      logResult('Lead Capture: Denies submission without marketing consent (403)', true);
      passed++;
    } else {
      logResult('Lead Capture: Denies submission without marketing consent (403)', false, `Expected status 403, got ${leadNoConsent.status}`);
      failed++;
    }

    // ── SCENARIO 5: Valid Lead Submission ──────────────────────────────────
    const leadSuccess = await apiClient.post(`/v1/leads?tenantId=${tenantA}&tenantApiKey=${apiKeyA}`, {
      tryonRequestId: tryonA.id,
      customerName: 'Alice Smith',
      phoneNumber: '9876543210',
      countryCode: '+91',
      marketingConsent: true
    });
    const newUnlockToken = leadSuccess.data?.unlockToken;
    const leadId = leadSuccess.data?.leadId;

    if (leadSuccess.status === 201 && leadSuccess.data?.success && newUnlockToken && leadId) {
      logResult('Lead Capture: Creates lead and returns stateless unlock token', true);
      passed++;
    } else {
      logResult('Lead Capture: Creates lead and returns stateless unlock token', false, `Expected success response, got: ${JSON.stringify(leadSuccess.data)}`);
      failed++;
    }

    // ── SCENARIO 6: Idempotent Submission ────────────────────────────────────
    const leadIdempotent = await apiClient.post(`/v1/leads?tenantId=${tenantA}&tenantApiKey=${apiKeyA}`, {
      tryonRequestId: tryonA.id,
      customerName: 'Alice Smith',
      phoneNumber: '9876543210',
      countryCode: '+91',
      marketingConsent: true
    });
    if (leadIdempotent.status === 201 && leadIdempotent.data?.leadId === leadId) {
      logResult('Lead Capture: Submitting twice returns the same leadId (idempotent)', true);
      passed++;
    } else {
      logResult('Lead Capture: Submitting twice returns the same leadId (idempotent)', false, `Expected same leadId ${leadId}, got: ${JSON.stringify(leadIdempotent.data)}`);
      failed++;
    }

    // ── SCENARIO 7: Duplicate phone on NEW tryon creates a new Lead ─────────
    const tryonA2 = await prisma.tryonRequest.create({
      data: {
        tenantId: tenantA,
        productId: productA.id,
        status: 'completed',
        generatedImageKey: `${tenantA}/generated/job_a2`,
        previewImageKey: `${tenantA}/previews/job_a2`
      }
    });

    const leadDuplicatePhone = await apiClient.post(`/v1/leads?tenantId=${tenantA}&tenantApiKey=${apiKeyA}`, {
      tryonRequestId: tryonA2.id,
      customerName: 'Alice Smith',
      phoneNumber: '9876543210', // same phone
      countryCode: '+91',
      marketingConsent: true
    });
    if (leadDuplicatePhone.status === 201 && leadDuplicatePhone.data?.leadId !== leadId) {
      logResult('Lead Capture: Reusing phone number on new tryon creates new Lead record (history preserved)', true);
      passed++;
    } else {
      logResult('Lead Capture: Reusing phone number on new tryon creates new Lead record (history preserved)', false, `Expected a new leadId, got: ${JSON.stringify(leadDuplicatePhone.data)}`);
      failed++;
    }

    // ── SCENARIO 8: Successful Unlock ───────────────────────────────────────
    const unlockRes = await apiClient.post(`/v1/tryon/unlock?tenantId=${tenantA}&tenantApiKey=${apiKeyA}`, {
      unlockToken: newUnlockToken
    });
    if (unlockRes.status === 201 && unlockRes.data?.imageUrl && unlockRes.data?.downloadUrl && unlockRes.data?.expiresAt) {
      logResult('Unlock API: Valid token returns signed image URLs', true);
      passed++;
    } else {
      logResult('Unlock API: Valid token returns signed image URLs', false, `Expected signed image URLs, got: ${JSON.stringify(unlockRes.data)}`);
      failed++;
    }

    // ── SCENARIO 9: Cross-Tenant Protection (Tenant B tries to unlock Tenant A's token) ──
    const crossTenantUnlock = await apiClient.post(`/v1/tryon/unlock?tenantId=${tenantB}&tenantApiKey=${apiKeyB}`, {
      unlockToken: newUnlockToken
    });
    if (crossTenantUnlock.status === 401) {
      logResult('Unlock API: Rejects cross-tenant unlock attempt (401)', true);
      passed++;
    } else {
      logResult('Unlock API: Rejects cross-tenant unlock attempt (401)', false, `Expected 401 Unauthorized, got ${crossTenantUnlock.status}`);
      failed++;
    }

    // ── SCENARIO 10: Invalid / Expired Token Unlock ──────────────────────────
    const invalidUnlock = await apiClient.post(`/v1/tryon/unlock?tenantId=${tenantA}&tenantApiKey=${apiKeyA}`, {
      unlockToken: 'invalid.token.here'
    });
    if (invalidUnlock.status === 401) {
      logResult('Unlock API: Rejects invalid unlock token (401)', true);
      passed++;
    } else {
      logResult('Unlock API: Rejects invalid unlock token (401)', false, `Expected 401 Unauthorized, got ${invalidUnlock.status}`);
      failed++;
    }

    // ── SCENARIO 11: Merchant Configured Dynamic Form (Email Only) ───────────
    // Configure Tenant A with a custom config
    await prisma.tenantConfig.update({
      where: { tenantId: tenantA },
      data: {
        leadCaptureConfig: {
          enabled: true,
          title: 'Custom Brand Look',
          fields: [
            { id: 'email', type: 'text', label: 'Email Address', required: true }
          ]
        }
      }
    });
    await clearTenantCache(tenantA);

    const tryonCustom = await prisma.tryonRequest.create({
      data: {
        tenantId: tenantA,
        productId: productA.id,
        status: 'completed',
        generatedImageKey: `${tenantA}/generated/job_custom`,
        previewImageKey: `${tenantA}/previews/job_custom`
      }
    });

    // Submitting without email must fail
    const leadFailEmail = await apiClient.post(`/v1/leads?tenantId=${tenantA}&tenantApiKey=${apiKeyA}`, {
      tryonRequestId: tryonCustom.id,
      marketingConsent: true,
      metadata: {}
    });
    if (leadFailEmail.status === 400) {
      logResult('Lead Capture: Rejects missing custom required fields (400)', true);
      passed++;
    } else {
      logResult('Lead Capture: Rejects missing custom required fields (400)', false, `Expected 400 Bad Request, got ${leadFailEmail.status}`);
      failed++;
    }

    // Submitting with email must succeed
    const leadSuccessEmail = await apiClient.post(`/v1/leads?tenantId=${tenantA}&tenantApiKey=${apiKeyA}`, {
      tryonRequestId: tryonCustom.id,
      marketingConsent: true,
      metadata: { email: 'user@example.com' }
    });
    if (leadSuccessEmail.status === 201) {
      logResult('Lead Capture: Accepts custom dynamic config submission', true);
      passed++;
    } else {
      logResult('Lead Capture: Accepts custom dynamic config submission', false, `Expected 201 Created, got ${leadSuccessEmail.status}. Data: ${JSON.stringify(leadSuccessEmail.data)}`);
      failed++;
    }

    // ── SCENARIO 12: Phone Normalization and Validation ─────────────
    const tryonPhoneTest = await prisma.tryonRequest.create({
      data: {
        tenantId: tenantA,
        productId: productA.id,
        status: 'completed',
        generatedImageKey: `${tenantA}/generated/job_phone_test`,
        previewImageKey: `${tenantA}/previews/job_phone_test`
      }
    });

    // Configure Tenant A back to requiring phone number
    await prisma.tenantConfig.update({
      where: { tenantId: tenantA },
      data: {
        leadCaptureConfig: {
          enabled: true,
          fields: [
            { id: 'phone', type: 'phone', label: 'Mobile Number', required: true }
          ]
        }
      }
    });
    await clearTenantCache(tenantA);

    // Submitting invalid phone format (letters) must fail
    const leadInvalidPhone = await apiClient.post(`/v1/leads?tenantId=${tenantA}&tenantApiKey=${apiKeyA}`, {
      tryonRequestId: tryonPhoneTest.id,
      phoneNumber: 'invalid-phone-number',
      countryCode: '+91',
      marketingConsent: true
    });
    if (leadInvalidPhone.status === 400) {
      logResult('Lead Capture: Validates and rejects incorrect phone formats (400)', true);
      passed++;
    } else {
      logResult('Lead Capture: Validates and rejects incorrect phone formats (400)', false, `Expected 400, got ${leadInvalidPhone.status}`);
      failed++;
    }

  } catch (err: any) {
    console.error('Lead capture E2E test error:', err.message);
    failed++;
  }

  // Clean up test tenants from DB
  try {
    await prisma.tenant.deleteMany({
      where: {
        shopifyDomain: {
          in: ['leadcapture-enabled.myshopify.com', 'leadcapture-disabled.myshopify.com']
        }
      }
    });
  } catch (e) {}

  return { passed, failed };
}
