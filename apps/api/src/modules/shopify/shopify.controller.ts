import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { config as appConfig } from '@trail/config';
import { ShopifyService } from './shopify.service';
import { ShopifyWebhooks } from './shopify.webhooks';
import { isValidShopDomain, generateOAuthState, verifyOAuthHmac, verifyWebhookHmac } from './shopify.utils';

@Controller('shopify')
export class ShopifyController {
  private readonly logger = new Logger(ShopifyController.name);
  private readonly redis: Redis;

  constructor(
    private readonly shopifyService: ShopifyService,
    private readonly shopifyWebhooks: ShopifyWebhooks
  ) {
    this.redis = new Redis(appConfig.redis.url, { maxRetriesPerRequest: null });
  }

  /**
   * GET /shopify/install
   * Initiates the Shopify OAuth flow.
   */
  @Get('install')
  async install(
    @Query('shop') shop: string,
    @Res() res: Response
  ) {
    if (!shop || !isValidShopDomain(shop)) {
      throw new BadRequestException('Invalid or missing shop domain');
    }

    const state = generateOAuthState();
    const stateKey = `shopify:state:${state}`;

    // Store state in Redis for 10 minutes to protect against CSRF/replay
    await this.redis.set(stateKey, 'active', 'EX', 600);

    const redirectUri = `${appConfig.shopify.appUrl}/shopify/callback`;
    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${
      appConfig.shopify.apiKey
    }&scope=${encodeURIComponent(appConfig.shopify.scopes)}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&state=${state}`;

    this.logger.log(`Redirecting shop ${shop} to OAuth authorization URL`);
    return res.redirect(installUrl);
  }

  /**
   * GET /shopify/callback
   * Processes the Shopify OAuth callback, completes token exchange, and bootstraps tenant.
   */
  @Get('callback')
  async callback(
    @Query() query: Record<string, any>,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const { shop, code, state, hmac } = query;

    if (!shop || !isValidShopDomain(shop)) {
      throw new BadRequestException('Invalid shop domain');
    }

    if (!code || !state || !hmac) {
      throw new BadRequestException('Missing required OAuth parameters');
    }

    // 1. Verify OAuth State (CSRF & Replay mitigation)
    const stateKey = `shopify:state:${state}`;
    const stateExists = await this.redis.get(stateKey);
    if (!stateExists) {
      throw new UnauthorizedException('OAuth state is invalid or has expired');
    }
    await this.redis.del(stateKey); // Single-use token enforcement

    // 2. Verify HMAC Signature
    const isHmacValid = verifyOAuthHmac(query, appConfig.shopify.apiSecret);
    if (!isHmacValid && !this.shopifyService.isMockMode()) {
      throw new UnauthorizedException('HMAC signature verification failed');
    }

    this.logger.log(`HMAC signature verified for shop: ${shop}`);

    // 3. Exchange authorization code for access token
    const token = await this.shopifyService.exchangeOAuthCode(shop, code);
    await this.shopifyService.saveAccessToken(shop, token);

    // 4. Auto-onboard Tenant and TenantConfig
    const tenant = await this.shopifyService.onboardTenant(shop);

    // 5. Inject ScriptTag automatically to load widget.js
    await this.shopifyService.injectScriptTag(shop, token);

    // 5.5 Inject Metafield
    await this.shopifyService.createTenantMetafield(shop, token, tenant.id);

    // 6. Register Webhooks for app uninstalled and product updates
    await this.shopifyService.registerWebhooks(shop, token);

    // 7. Trigger product synchronization asynchronously (non-blocking)
    this.shopifyService.syncProducts(tenant.id, shop, token).catch((err) => {
      this.logger.error(`Asynchronous product sync failed for ${shop}: ${err.message}`);
    });

    // Render a friendly onboarding success page
    res.setHeader('Content-Type', 'text/html');
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Virtual-Trail Onboarding Successful</title>
          <style>
            body {
              font-family: 'Inter', system-ui, -apple-system, sans-serif;
              background-color: #0d0e15;
              color: #f3f4f6;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: rgba(255, 255, 255, 0.03);
              border: 1px solid rgba(255, 255, 255, 0.08);
              backdrop-filter: blur(16px);
              padding: 40px;
              border-radius: 20px;
              max-width: 480px;
              text-align: center;
              box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }
            h1 {
              background: linear-gradient(135deg, #ff5a5f 0%, #7c3aed 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              margin-top: 0;
              font-size: 28px;
              font-weight: 800;
            }
            p {
              color: #9ca3af;
              line-height: 1.6;
              font-size: 15px;
            }
            .badge {
              display: inline-block;
              background: rgba(124, 58, 237, 0.15);
              color: #a78bfa;
              border: 1px solid rgba(124, 58, 237, 0.3);
              padding: 6px 12px;
              border-radius: 9999px;
              font-size: 13px;
              font-weight: 600;
              margin-top: 15px;
            }
            .footer {
              margin-top: 25px;
              font-size: 12px;
              color: #4b5563;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Onboarding Complete!</h1>
            <p>Virtual-Trail has been successfully integrated with your Shopify store. The storefront widget is now active and your product catalog is syncing in the background.</p>
            <div class="badge">Tenant ID: ${tenant.id}</div>
            <div class="footer">You can now close this window and view the app in your Shopify admin panel.</div>
          </div>
        </body>
      </html>
    `);
  }

  /**
   * POST /shopify/webhooks
   * Handles incoming webhook event payloads from Shopify.
   */
  @Post('webhooks')
  @HttpCode(HttpStatus.OK)
  async webhooks(@Req() req: Request) {
    const signature = req.headers['x-shopify-hmac-sha256'] as string;
    const topic = req.headers['x-shopify-topic'] as string;
    const shop = req.headers['x-shopify-shop-domain'] as string;

    if (!signature || !topic || !shop) {
      throw new BadRequestException('Missing required webhook headers');
    }

    // Retrieve raw body buffer attached to the request
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw request body is required for verification');
    }

    // Verify webhook signature authenticity
    const isWebhookValid = verifyWebhookHmac(rawBody, signature, appConfig.shopify.apiSecret);
    if (!isWebhookValid && !this.shopifyService.isMockMode()) {
      throw new UnauthorizedException('Webhook HMAC verification failed');
    }

    // Parse payload safely
    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      throw new BadRequestException('Invalid JSON payload');
    }

    this.logger.log(`Processing Shopify Webhook: ${topic} for ${shop}`);

    // Delegate processing to Webhooks runner service
    await this.shopifyWebhooks.handleWebhook(topic, shop, payload);

    return { received: true };
  }
}
