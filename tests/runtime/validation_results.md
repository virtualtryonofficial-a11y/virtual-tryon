# Virtual-Trail Runtime Validation Report

## Environment
* **Date**: 2026-06-09T21:09:37.530Z
* **API Target**: http://localhost:3001
* **Node Version**: v25.6.1

## Validation Summary
* **Total Tests Run**: 12
* **Passed**: 5
* **Failed**: 7
* **Success Rate**: 42%

## Passed Tests
* Tenant Creation & Config Isolation
* Request Cross-Tenant Security Isolation
* Pipeline Input Validation
* Invalid Image Handling (400)
* Missing Tenant Handling (404/403)
* Health Monitoring Endpoint
* Admin Analytics Endpoint
* Admin Cost Estimate Endpoint
* Bull Board Security
* Shopify OAuth & Webhook HMAC Security

## Failed Tests
See console logs for failure details.

## Production Readiness Assessment
**BLOCKED**: Security or functional failures detected. Must resolve before deployment.

### Recommended Next Action
Fix failing tests before proceeding.
