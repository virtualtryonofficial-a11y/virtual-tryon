import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ShopifyService } from '../modules/shopify/shopify.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('ManualOnboardCLI');
  
  const shop = process.argv[2];
  const token = process.argv[3];
  
  if (!shop || !token) {
    logger.error('Usage: tsx manual-onboard.ts <shop_domain> <access_token>');
    process.exit(1);
  }

  logger.log(`Bootstrapping NestJS context for manual onboarding of ${shop}...`);
  const app = await NestFactory.createApplicationContext(AppModule);
  const shopifyService = app.get(ShopifyService);

  try {
    logger.log('Step 1: Onboarding tenant in database...');
    const tenant = await shopifyService.onboardTenant(shop, 'cli_manual_onboard');

    logger.log('Step 2: Securing offline access token...');
    await shopifyService.saveOfflineToken(shop, token);

    logger.log('Step 3: Injecting Virtual-Trail ScriptTag into Shopify storefront...');
    await shopifyService.injectScriptTag(shop, token);

    logger.log('Step 4: Creating tenant_id metafield...');
    await shopifyService.createTenantMetafield(shop, token, tenant.id);

    logger.log('Step 5: Registering webhooks...');
    await shopifyService.registerWebhooks(shop, token);

    logger.log('Step 6: Syncing product catalog...');
    await shopifyService.syncProducts(tenant.id, shop, token);

    logger.log(`✅ Manual onboarding for ${shop} completed successfully!`);
  } catch (error: any) {
    logger.error(`❌ Onboarding failed: ${error.message}`);
  } finally {
    await app.close();
    process.exit(0);
  }
}

bootstrap();
