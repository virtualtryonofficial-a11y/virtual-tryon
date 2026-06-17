import { apiClient, logResult } from './utils';

export async function runFailureHandlingTests() {
  console.log('\n--- Running Failure Handling Tests ---');
  let passed = 0;
  let failed = 0;

  try {
    // 1. Invalid Image
    const resImg = await apiClient.post('/v1/tryon', {
      tenantId: 'some-tenant',
      productId: 'some-prod',
      userImage: 'data:image/png;base64,invalid_base64_string_that_fails_parsing'
    });
    
    if (resImg.status === 400) {
      logResult('Invalid Image handling', true);
      passed++;
    } else {
      logResult('Invalid Image handling', false, `Expected 400, got ${resImg.status}`);
      failed++;
    }

    // 2. Missing Tenant
    const resTenant = await apiClient.get('/v1/tenant/non-existent-tenant-id/config');
    // Tenants controller might not throw 404 for config if handled gracefully, or might. Let's check status.
    if (resTenant.status === 403 || resTenant.status === 404) {
      logResult('Missing Tenant handling', true);
      passed++;
    } else {
      logResult('Missing Tenant handling', false, `Expected 403/404, got ${resTenant.status}`);
      failed++;
    }

  } catch (err: any) {
    console.error('Failure handling test error:', err.message);
    failed++;
  }

  return { passed, failed };
}
