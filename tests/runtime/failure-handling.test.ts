import { adminClient, apiClient, logResult } from './utils';

export async function runFailureHandlingTests() {
  console.log('\n--- Running Failure Handling Tests ---');
  let passed = 0;
  let failed = 0;

  try {
    // Create a mock tenant for testing invalid image
    const tenantRes = await adminClient.post('/admin/tenants', {
      name: 'Failure Test Tenant',
      shopifyDomain: 'failure-test.myshopify.com',
      features: ['tryon']
    });
    const tenantId = tenantRes.data?.id;
    const apiKey = tenantRes.data?.apiKey;

    // 1. Invalid Image
    const resImg = await apiClient.post('/v1/tryon', {
      tenantId: tenantId,
      tenantApiKey: apiKey,
      productId: 'some-prod',
      userImage: 'data:image/png;base64,invalid_base64_string_that_fails_parsing'
    });
    
    if (resImg.status === 400) {
      logResult('Invalid Image handling', true);
      passed++;
    } else {
      logResult('Invalid Image handling', false, `Expected 400, got ${resImg.status} - ${JSON.stringify(resImg.data)}`);
      failed++;
    }

    // 2. Missing Tenant
    const resTenant = await apiClient.get('/v1/tenant/non-existent-tenant-id/config?tenantApiKey=invalid_key');
    // Tenants controller/guard throws 401 for invalid tenant
    if (resTenant.status === 401 || resTenant.status === 403 || resTenant.status === 404) {
      logResult('Missing Tenant handling', true);
      passed++;
    } else {
      logResult('Missing Tenant handling', false, `Expected 401/403/404, got ${resTenant.status}`);
      failed++;
    }

  } catch (err: any) {
    console.error('Failure handling test error:', err.message);
    failed++;
  }

  return { passed, failed };
}
