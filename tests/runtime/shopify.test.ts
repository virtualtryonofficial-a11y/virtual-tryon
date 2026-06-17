import { apiClient, logResult } from './utils';

export async function runShopifyTests() {
  console.log('\n--- Running Shopify OAuth Mock Tests ---');
  let passed = 0;
  let failed = 0;

  try {
    // 1. Callback Endpoint (Mocked)
    const mockHmac = 'invalid_hmac_will_fail_security_check'; // Using invalid HMAC to verify security protection
    const resCallback = await apiClient.get(`/shopify/callback?shop=mock-store.myshopify.com&code=123&hmac=${mockHmac}`);
    
    // Should return 401 Unauthorized because HMAC is invalid, proving security works
    if (resCallback.status === 401) {
      logResult('Shopify OAuth Callback Security', true);
      passed++;
    } else {
      logResult('Shopify OAuth Callback Security', false, `Expected 401 due to invalid HMAC, got ${resCallback.status}`);
      failed++;
    }

    // 2. Webhook Endpoint
    const resWebhook = await apiClient.post('/shopify/webhooks', {
      id: 12345,
      domain: 'mock-store.myshopify.com',
    }, {
      headers: {
        'X-Shopify-Topic': 'app/uninstalled',
        'X-Shopify-Shop-Domain': 'mock-store.myshopify.com',
        'X-Shopify-Hmac-Sha256': 'mock_hmac'
      }
    });

    // Should return 401 Unauthorized for invalid HMAC
    if (resWebhook.status === 401) {
      logResult('Shopify Webhook Security', true);
      passed++;
    } else {
      logResult('Shopify Webhook Security', false, `Expected 401, got ${resWebhook.status}`);
      failed++;
    }

  } catch (err: any) {
    console.error('Shopify test error:', err.message);
    failed++;
  }

  return { passed, failed };
}
