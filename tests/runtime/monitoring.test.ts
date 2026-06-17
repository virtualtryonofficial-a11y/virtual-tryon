import { adminClient, apiClient, logResult } from './utils';

export async function runMonitoringTests() {
  console.log('\n--- Running Monitoring Tests ---');
  let passed = 0;
  let failed = 0;

  try {
    // 1. /health
    const resHealth = await apiClient.get('/health');
    if (resHealth.status === 200 && resHealth.data?.status === 'ok') {
      logResult('Health endpoint', true);
      passed++;
    } else {
      logResult('Health endpoint', false, `Status: ${resHealth.status}`);
      failed++;
    }

    // 2. /admin/analytics
    const resAnalytics = await adminClient.get('/admin/analytics');
    if (resAnalytics.status === 200 && resAnalytics.data?.totals) {
      logResult('Admin Analytics', true);
      passed++;
    } else {
      logResult('Admin Analytics', false, `Status: ${resAnalytics.status}`);
      failed++;
    }

    // 3. /admin/cost-estimate
    const resCosts = await adminClient.get('/admin/cost-estimate');
    if (resCosts.status === 200 && resCosts.data?.summary) {
      logResult('Admin Cost Estimate', true);
      passed++;
    } else {
      logResult('Admin Cost Estimate', false, `Status: ${resCosts.status}`);
      failed++;
    }

    // 4. Bull Board
    const resBull = await adminClient.get('/admin/queues/');
    if (resBull.status === 200) {
      logResult('Bull Board Registration', true);
      passed++;
    } else {
      logResult('Bull Board Registration', false, `Status: ${resBull.status}`);
      failed++;
    }

  } catch (err: any) {
    console.error('Monitoring test error:', err.message);
    failed++;
  }

  return { passed, failed };
}
