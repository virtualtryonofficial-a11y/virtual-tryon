import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import axios from 'axios';
import { config as appConfig } from '@trail/config';
import { prisma, createAuditLog } from '@trail/db';
import { selectBestGarmentImage, ProductImage } from '@trail/ai';
import { encryptToken, decryptToken } from '@trail/security';

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(appConfig.redis.url, { maxRetriesPerRequest: null });
  }

  /**
   * Checks if we are running in local mock mode.
   */
  isMockMode(): boolean {
    return (
      appConfig.shopify.apiKey === 'mock_client_id_placeholder' ||
      appConfig.shopify.apiSecret === 'mock_client_secret_placeholder' ||
      process.env.MOCK_SHOPIFY === 'true'
    );
  }

  /**
   * Auto-onboard tenant and tenant config in Neon database.
   */
  async onboardTenant(shop: string, ipAddress?: string) {
    // Sanitize shop domain to create a tenant ID (e.g. store-name)
    const tenantId = shop.replace('.myshopify.com', '').toLowerCase();

    this.logger.log(`Onboarding tenant: ${tenantId} for shop: ${shop}`);

    // Determine if this is a new install or a reinstall
    const existing = await prisma.tenant.findUnique({ where: { shopifyDomain: shop } });
    const isReinstall = existing !== null;

    const tenant = await prisma.tenant.upsert({
      where: { shopifyDomain: shop },
      update: { features: ['tryon'] },
      create: {
        id: tenantId,
        name: shop,
        shopifyDomain: shop,
        features: ['tryon'],
      },
    });

    await prisma.tenantConfig.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        primaryColor: '#000000',
        complimentTone: 'friendly',
        segmindModel: 'fashion-tryon-v1',
        buttonStyle: 'rounded',
        widgetTheme: 'light',
      },
    });

    await createAuditLog({
      tenantId: tenant.id,
      action: isReinstall ? 'shopify_reinstalled' : 'shopify_installed',
      actor: 'shopify_oauth',
      ipAddress,
      metadata: { shop, isReinstall },
    }).catch(() => {});

    return tenant;
  }

  /**
   * Exchanges OAuth authorization code for Shopify access token.
   */
  async exchangeOAuthCode(shop: string, code: string): Promise<string> {
    if (this.isMockMode()) {
      this.logger.log(`[MOCK] Exchanging code: ${code} for shop: ${shop}`);
      return 'shpat_mock_access_token_12345';
    }

    const url = `https://${shop}/admin/oauth/access_token`;
    const payload = {
      client_id: appConfig.shopify.apiKey,
      client_secret: appConfig.shopify.apiSecret,
      code,
    };

    try {
      const response = await axios.post(url, payload, { timeout: 10000 });
      if (response.data && response.data.access_token) {
        return response.data.access_token;
      }
      throw new Error('Access token missing from Shopify response');
    } catch (err: any) {
      this.logger.error(`OAuth exchange failed for ${shop}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Persists the access token to Redis with 24h expiry (for OAuth online sessions).
   */
  async saveAccessToken(shop: string, token: string): Promise<void> {
    const redisKey = `shopify:${shop}:token`;
    await this.redis.set(redisKey, token, 'EX', 86400);
  }

  /**
   * Encrypts and permanently saves an offline access token in the database.
   */
  async saveOfflineToken(shop: string, token: string): Promise<void> {
    const encryptedToken = encryptToken(token);
    await prisma.tenant.update({
      where: { shopifyDomain: shop },
      data: { encryptedShopifyToken: encryptedToken },
    });
    
    // Also save it to Redis cache for immediate use
    const redisKey = `shopify:${shop}:token`;
    await this.redis.set(redisKey, token, 'EX', 86400);
  }

  /**
   * Gets the active access token for a store from Redis or DB fallback.
   */
  async getAccessToken(shop: string): Promise<string | null> {
    const redisKey = `shopify:${shop}:token`;
    let token = await this.redis.get(redisKey);
    
    if (!token) {
      // Fallback to database for offline tokens
      const tenant = await prisma.tenant.findUnique({
        where: { shopifyDomain: shop },
        select: { encryptedShopifyToken: true }
      });
      
      if (tenant && tenant.encryptedShopifyToken) {
        token = decryptToken(tenant.encryptedShopifyToken);
        // Refresh cache
        await this.redis.set(redisKey, token, 'EX', 86400);
      }
    }
    
    if (!token && this.isMockMode()) {
      return 'shpat_mock_access_token_12345';
    }
    return token;
  }

  /**
   * Inject or update storefront widget.js ScriptTag on Shopify store.
   */
  async injectScriptTag(shop: string, token: string): Promise<void> {
    const tenant = await prisma.tenant.findUnique({
      where: { shopifyDomain: shop },
      select: { apiKey: true },
    });

    if (!tenant) {
      throw new Error(`Tenant not found for shop: ${shop}`);
    }

    const widgetUrl = `${appConfig.widget.publicUrl}?tk=${tenant.apiKey}`;

    if (this.isMockMode()) {
      this.logger.log(`[MOCK] Injecting ScriptTag: ${widgetUrl} into ${shop}`);
      return;
    }

    const getUrl = `https://${shop}/admin/api/2024-01/script_tags.json`;
    const headers = { 'X-Shopify-Access-Token': token };

    try {
      const existingRes = await axios.get(getUrl, { headers, timeout: 10000 });
      const scriptTags = existingRes.data.script_tags || [];
      
      let alreadyInjected = false;
      for (const tag of scriptTags) {
        if (tag.src === widgetUrl) {
          alreadyInjected = true;
        } else if (
          tag.src.startsWith(appConfig.widget.publicUrl) ||
          tag.src.includes('virtual-trail-widget.onrender.com')
        ) {
          this.logger.log(`Found outdated/mismatched ScriptTag ${tag.id} (${tag.src}), removing it...`);
          const deleteUrl = `https://${shop}/admin/api/2024-01/script_tags/${tag.id}.json`;
          await axios.delete(deleteUrl, { headers, timeout: 10000 });
        }
      }

      if (alreadyInjected) {
        this.logger.log(`ScriptTag already present on ${shop}`);
        return;
      }

      const postUrl = `https://${shop}/admin/api/2024-01/script_tags.json`;
      const payload = {
        script_tag: {
          event: 'onload',
          src: widgetUrl,
        },
      };

      await axios.post(postUrl, payload, { headers, timeout: 10000 });
      this.logger.log(`Successfully injected ScriptTag into ${shop}`);
    } catch (err: any) {
      this.logger.error(`ScriptTag injection failed for ${shop}: ${err.message}`);
    }
  }

  /**
   * Removes widget.js ScriptTag from Shopify store.
   */
  async removeScriptTag(shop: string, token: string): Promise<void> {
    const widgetUrl = appConfig.widget.publicUrl;

    if (this.isMockMode()) {
      this.logger.log(`[MOCK] Removing ScriptTag from ${shop}`);
      return;
    }

    const getUrl = `https://${shop}/admin/api/2024-01/script_tags.json`;
    const headers = { 'X-Shopify-Access-Token': token };

    try {
      const existingRes = await axios.get(getUrl, { headers, timeout: 10000 });
      const scriptTags = existingRes.data.script_tags || [];
      const targetTags = scriptTags.filter((tag: any) => tag.src === widgetUrl);

      for (const tag of targetTags) {
        const deleteUrl = `https://${shop}/admin/api/2024-01/script_tags/${tag.id}.json`;
        await axios.delete(deleteUrl, { headers, timeout: 10000 });
      }
      this.logger.log(`Successfully removed ScriptTag(s) from ${shop}`);
    } catch (err: any) {
      this.logger.error(`ScriptTag removal failed for ${shop}: ${err.message}`);
    }
  }

  /**
   * Creates or ensures the tryon tenant_id metafield exists.
   */
  async createTenantMetafield(shop: string, token: string, tenantId: string): Promise<void> {
    if (this.isMockMode()) {
      this.logger.log(`[MOCK] Creating metafield tryon.tenant_id = ${tenantId} for ${shop}`);
      return;
    }

    const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
    const getUrl = `https://${shop}/admin/api/2024-01/metafields.json?namespace=tryon&key=tenant_id`;

    try {
      // Idempotency check: see if it already exists
      const existingRes = await axios.get(getUrl, { headers, timeout: 10000 });
      const metafields = existingRes.data.metafields || [];

      if (metafields.length > 0) {
        this.logger.log(`Tenant metafield already exists on ${shop}`);
        return;
      }

      const postUrl = `https://${shop}/admin/api/2024-01/metafields.json`;
      const payload = {
        metafield: {
          namespace: 'tryon',
          key: 'tenant_id',
          value: tenantId,
          type: 'single_line_text_field',
        },
      };

      await axios.post(postUrl, payload, { headers, timeout: 10000 });
      this.logger.log(`Successfully created tenant_id metafield for ${shop}`);
    } catch (err: any) {
      this.logger.error(`Metafield creation failed for ${shop}: ${err.message}`);
    }
  }

  /**
   * Registers webhook endpoints for essential event topics.
   */
  async registerWebhooks(shop: string, token: string): Promise<void> {
    const webhookUrl = `${appConfig.shopify.appUrl}/shopify/webhooks`;
    const topics = [
      'app/uninstalled',
      'products/create',
      'products/update',
      'products/delete',
    ];

    if (this.isMockMode()) {
      this.logger.log(`[MOCK] Registering webhooks: [${topics.join(', ')}] at ${webhookUrl} for ${shop}`);
      return;
    }

    const headers = { 'X-Shopify-Access-Token': token };
    const getUrl = `https://${shop}/admin/api/2024-01/webhooks.json`;

    try {
      const existingRes = await axios.get(getUrl, { headers, timeout: 10000 });
      const webhooks = existingRes.data.webhooks || [];

      for (const topic of topics) {
        const alreadyRegistered = webhooks.some(
          (wh: any) => wh.topic === topic && wh.address === webhookUrl
        );

        if (alreadyRegistered) {
          continue;
        }

        const postUrl = `https://${shop}/admin/api/2024-01/webhooks.json`;
        const payload = {
          webhook: {
            topic,
            address: webhookUrl,
            format: 'json',
          },
        };

        await axios.post(postUrl, payload, { headers, timeout: 10000 });
      }
      this.logger.log(`Successfully registered webhooks for ${shop}`);
    } catch (err: any) {
      this.logger.error(`Webhook registration failed for ${shop}: ${err.message}`);
    }
  }

  /**
   * Fetches product catalog from Shopify and syncs it locally.
   */
  async syncProducts(tenantId: string, shop: string, token: string): Promise<void> {
    this.logger.log(`Starting product sync for tenant: ${tenantId}`);
    const startTime = Date.now();

    if (this.isMockMode()) {
      const products = this.generateMockProducts();
      for (const prod of products) {
        await this.syncSingleProduct(tenantId, prod);
      }
      this.logger.log(`Mock product sync completed. Synced ${products.length} products.`);
      return;
    }

    const headers = { 'X-Shopify-Access-Token': token };
    let url: string | null = `https://${shop}/admin/api/2024-01/products.json?limit=50`;
    let pagesProcessed = 0;
    let productsProcessed = 0;

    try {
      while (url) {
        pagesProcessed++;
        const response: any = await axios.get(url, { headers, timeout: 30000 });
        const products: any[] = response.data.products || [];
        this.logger.log(`Fetched page ${pagesProcessed} with ${products.length} products`);

        for (const prod of products) {
          await this.syncSingleProduct(tenantId, prod);
          productsProcessed++;
        }
        this.logger.log(`Finished processing page ${pagesProcessed}`);

        url = null;
        const linkHeader: string | undefined = response.headers['link'];
        if (linkHeader) {
          const links = linkHeader.split(',');
          for (const link of links) {
            if (link.includes('rel="next"')) {
              const match = link.match(/<([^>]+)>/);
              if (match) {
                url = match[1];
              }
            }
          }
        }
      }
      const durationSecs = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(`Imported ${productsProcessed} products\nPages: ${pagesProcessed}\nDuration: ${durationSecs}s`);
    } catch (err: any) {
      this.logger.error(`Failed to fetch Shopify products for sync: ${err.message}`);
      throw err;
    }
  }

  /**
   * Synchronizes or updates a single product record using selection heuristics.
   */
  async syncSingleProduct(tenantId: string, shopifyProduct: any): Promise<void> {
    const shopifyProductId = String(shopifyProduct.id);

    // Map shopify images to ProductImage structure
    const rawImages = shopifyProduct.images || [];
    const images: ProductImage[] = rawImages.map((img: any) => ({
      position: img.position,
      url: img.src || img.url,
      altText: img.alt || '',
      id: img.id,
      metadata: img.metadata,
    }));

    let bestImageUrl = '';

    if (images.length > 0) {
      // Execute smart garment image selection heuristics
      const bestImageSelection = selectBestGarmentImage(images);
      if (bestImageSelection && bestImageSelection.image) {
        bestImageUrl = bestImageSelection.image.url || bestImageSelection.image.src || '';
        this.logger.debug(
          `Selected best image for product ${shopifyProductId}: ${bestImageUrl} (Score: ${bestImageSelection.score})`
        );
      } else {
        bestImageUrl = shopifyProduct.image?.src || '';
      }
    } else {
      bestImageUrl = shopifyProduct.image?.src || '';
    }

    // Upsert product in database
    await prisma.product.upsert({
      where: {
        tenantId_shopifyProductId: {
          tenantId,
          shopifyProductId,
        },
      },
      update: {
        imageUrl: bestImageUrl,
        images: images as any,
      },
      create: {
        tenantId,
        shopifyProductId,
        imageUrl: bestImageUrl,
        images: images as any,
      },
    });
  }

  /**
   * Generates sample product objects representing various selection scenarios.
   */
  private generateMockProducts(): any[] {
    return [
      {
        id: 1001,
        title: 'Mock Denim Jacket',
        image: { src: 'https://example.com/denim_lifestyle.jpg' },
        images: [
          {
            id: 1101,
            position: 1,
            src: 'https://example.com/denim_lifestyle.jpg',
            alt: 'Lifestyle model wearing denim jacket',
          },
          {
            id: 1102,
            position: 2,
            src: 'https://example.com/denim_flatlay.jpg',
            alt: 'Flat lay denim jacket on plain background',
          },
        ],
      },
      {
        id: 1002,
        title: 'Mock Classic Tee',
        image: { src: 'https://example.com/tee_model.jpg' },
        images: [
          {
            id: 1201,
            position: 1,
            src: 'https://example.com/tee_model.jpg',
            alt: 'Model wearing tee shirt',
          },
          {
            id: 1202,
            position: 2,
            src: 'https://example.com/tee_isolated.jpg',
            alt: 'Isolated tee shirt',
          },
        ],
      },
      {
        id: 1003,
        title: 'Mock Ghost Mannequin Dress',
        image: { src: 'https://example.com/dress_closeup.jpg' },
        images: [
          {
            id: 1301,
            position: 1,
            src: 'https://example.com/dress_closeup.jpg',
            alt: 'Dress fabric detail',
          },
          {
            id: 1302,
            position: 2,
            src: 'https://example.com/dress_mannequin.jpg',
            alt: 'Ghost mannequin front view',
          },
        ],
      },
    ];
  }
}
