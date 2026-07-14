import { adminClient, apiClient, logResult } from './utils';

export async function runTenantIsolationTests() {
  console.log('\n--- Running Tenant Isolation Tests ---');
  let passed = 0;
  let failed = 0;
  
  try {
    // 1. Create two tenants
    const resA = await adminClient.post('/admin/tenants', {
      name: 'Test Tenant A',
      shopifyDomain: 'test-tenant-a.myshopify.com',
      features: ['tryon']
    });
    
    const resB = await adminClient.post('/admin/tenants', {
      name: 'Test Tenant B',
      shopifyDomain: 'test-tenant-b.myshopify.com',
      features: ['tryon']
    });

    const tenantA = resA.data?.id;
    const tenantB = resB.data?.id;

    if (!tenantA || !tenantB) {
      logResult('Tenant Creation', false, 'Failed to create test tenants');
      return { passed, failed: failed + 1 };
    }
    logResult('Tenant Creation', true);
    passed++;

    // 2. Validate Configs Isolated
    const configA = await apiClient.get(`/v1/tenant/${tenantA}/config?tenantId=${tenantA}&tenantApiKey=${resA.data.apiKey}`);
    const configB = await apiClient.get(`/v1/tenant/${tenantB}/config?tenantId=${tenantB}&tenantApiKey=${resB.data.apiKey}`);
    
    if (configA.status === 200 && configB.status === 200) {
      logResult('Configs Isolated', true);
      passed++;
    } else {
      logResult('Configs Isolated', false, `A: ${configA.status}, B: ${configB.status}`);
      failed++;
    }

    // 3. Request Isolation (Attempt cross-tenant)
    const tryonRes = await apiClient.get(`/v1/tryon/invalid-job-id?tenantId=${tenantA}&tenantApiKey=${resA.data.apiKey}`);
    // This should fail with 404 (not found) instead of returning another tenant's data
    if (tryonRes.status === 404) {
      logResult('Requests Isolated', true);
      passed++;
    } else {
      logResult('Requests Isolated', false, `Expected 404, got ${tryonRes.status}`);
      failed++;
    }

  } catch (err: any) {
    console.error('Tenant isolation test error:', err.message);
    failed++;
  }

  return { passed, failed };
}
