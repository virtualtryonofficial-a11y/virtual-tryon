import { adminClient, apiClient, logResult } from './utils';

export async function runTryonPipelineTests() {
  console.log('\n--- Running Try-On Pipeline Tests ---');
  let passed = 0;
  let failed = 0;
  
  try {
    // We cannot fully execute Segmind/Gemini locally without valid mocked payloads for the R2 image,
    // but we can verify the API properly validates the payload and enqueues the job or catches failures.
    
    // Create a mock tenant and product for testing
    const tenantRes = await adminClient.post('/admin/tenants', {
      name: 'Pipeline Tenant',
      shopifyDomain: 'pipeline-test.myshopify.com'
    });
    const tenantId = tenantRes.data?.id;

    // We don't have an endpoint to mock a product creation easily via REST, 
    // but we can test the failure handling for "missing product"
    // Since product doesn't exist, the JIT auto-provisioning should automatically create it,
    // and the request should succeed with 201 Created.
    const tryonRes = await apiClient.post('/v1/tryon', {
      tenantId: tenantId,
      tenantApiKey: tenantRes.data?.apiKey,
      productId: 'mock_prod_123',
      userImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' // valid 1x1 transparent PNG base64
    });

    if (tryonRes.status === 201) {
      logResult('Pipeline API validation (Auto-Provisioning JIT)', true);
      passed++;
    } else {
      logResult('Pipeline API validation (Auto-Provisioning JIT)', false, `Expected 201, got ${tryonRes.status} - ${JSON.stringify(tryonRes.data)}`);
      failed++;
    }

  } catch (err: any) {
    console.error('Tryon pipeline test error:', err.message);
    failed++;
  }

  return { passed, failed };
}
