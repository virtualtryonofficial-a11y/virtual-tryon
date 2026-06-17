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
    const tryonRes = await apiClient.post('/v1/tryon', {
      tenantId: tenantId,
      productId: 'mock_prod_123',
      userImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABAAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAABQAAf/2Q==' // tiny valid 1x1 base64 jpeg
    });

    // Since product doesn't exist, it should return 404.
    // If it returns 404, the API and validations are reachable and functioning.
    if (tryonRes.status === 404) {
      logResult('Pipeline API validation (Missing Product)', true);
      passed++;
    } else {
      logResult('Pipeline API validation (Missing Product)', false, `Expected 404, got ${tryonRes.status}`);
      failed++;
    }

  } catch (err: any) {
    console.error('Tryon pipeline test error:', err.message);
    failed++;
  }

  return { passed, failed };
}
