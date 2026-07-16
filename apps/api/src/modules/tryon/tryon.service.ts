import { Injectable, BadRequestException, NotFoundException, Logger, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { config as appConfig } from '@trail/config';
import { 
  getProductByTenantAndShopifyId, 
  createProduct,
  createTryonRequest, 
  getTryonRequest,
  getLeadByTryonRequestId,
  prisma
} from '@trail/db';
import { QUEUE_NAMES, JOB_OPTIONS, TryonJobPayload } from '@trail/queue';
import { upload, getSignedReadUrl } from '@trail/storage';
import { compressForTryOn } from '@trail/ai';
import { resolveTenantConfig } from '@trail/tenant';
import { CreateTryonDto, TryonStatusResponse } from './tryon.dto';
import { validateUserImage } from './image.validation';
import { ImageValidationError } from './tryon.errors';
import { LeadService } from '../lead/lead.service';

@Injectable()
export class TryonService {
  private readonly logger: Logger;
  private queue: Queue;
  private redis: Redis;
  private leadService: LeadService;

  constructor(@Inject(LeadService) leadService?: LeadService) {
    this.logger = new Logger(TryonService.name);
    const connection = new Redis(appConfig.redis.url, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE_NAMES.TRYON, { connection });
    this.redis = connection;
    this.leadService = leadService || new LeadService();
  }


  async create(dto: CreateTryonDto, requestId: string, sessionToken?: string): Promise<{ jobId: string }> {
    const crypto = require('crypto');
    // 0. Verify cryptographic request signature if provided (secures API from public automated scrape vectors)
    if (dto.signature) {
      const tenant = await resolveTenantConfig(dto.tenantId);
      
      const message = `${dto.tenantId}:${dto.productId}:${dto.timestamp || ''}`;
      const expectedSignature = crypto
        .createHmac('sha256', tenant.apiKey)
        .update(message)
        .digest('hex');

      const signatureBuffer = Buffer.from(dto.signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      
      let isSignatureValid = false;
      try {
        if (signatureBuffer.length === expectedBuffer.length) {
          isSignatureValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
        }
      } catch (err) {}

      if (!isSignatureValid) {
        throw new BadRequestException('Invalid request cryptographic signature');
      }

      // Check request timestamp validity to prevent replay attacks (15-min window drift)
      if (dto.timestamp) {
        const now = Date.now();
        const drift = Math.abs(now - dto.timestamp);
        if (drift > 15 * 60 * 1000) {
          throw new BadRequestException('Request timestamp expired (replay protection)');
        }
      }
    }

    // 1. Validate image
    let buffer: Buffer;
    try {
      buffer = validateUserImage(dto.userImage);
    } catch (e) {
      if (e instanceof ImageValidationError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    // 2. Compress image
    const compressed = await compressForTryOn(buffer);

    // 3. Resolve product (with secure Redis cache to minimize Neon database reads)
    const productCacheKey = `product:${dto.tenantId}:${dto.productId}`;
    let product: any = null;
    
    const cachedProduct = await this.redis.get(productCacheKey);
    if (cachedProduct) {
      product = JSON.parse(cachedProduct);
      this.logger.log(`[Cache Hit] Product metadata: ${productCacheKey}`);
    } else {
      product = await getProductByTenantAndShopifyId(dto.tenantId, dto.productId);
      if (product) {
        // Cache static product metadata for 10 minutes (600 seconds)
        await this.redis.set(productCacheKey, JSON.stringify(product), 'EX', 600);
        this.logger.log(`[Cache Miss] Product metadata stored: ${productCacheKey}`);
      }
    }

    if (!product) {
      this.logger.log(`[Auto-Provision] Product ${dto.productId} not found in DB for tenant ${dto.tenantId}. Auto-creating JIT record...`);
      try {
        product = await createProduct({
          tenantId: dto.tenantId,
          shopifyProductId: dto.productId,
          imageUrl: dto.productImageUrl || '',
        });
        await this.redis.set(productCacheKey, JSON.stringify(product), 'EX', 600);
      } catch (err: any) {
        // Handle potential race condition or concurrent insert gracefully
        product = await getProductByTenantAndShopifyId(dto.tenantId, dto.productId);
      }
    }

    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} could not be resolved or created for tenant ${dto.tenantId}`);
    }

    // Dynamic self-healing: update DB and cache if product image URL changed
    if (dto.productImageUrl && product.imageUrl !== dto.productImageUrl) {
      this.logger.log(`[Self-Healing] Stale image URL detected for product ${dto.productId}. Updating from ${product.imageUrl} to ${dto.productImageUrl}`);
      try {
        product = await prisma.product.update({
          where: { id: product.id },
          data: { imageUrl: dto.productImageUrl },
        });
        await this.redis.set(productCacheKey, JSON.stringify(product), 'EX', 600);
      } catch (updateErr: any) {
        this.logger.warn(`Failed to update stale product imageUrl in DB: ${updateErr.message}`);
      }
    }

    // 4. Create request in DB
    const tryonRequest = await createTryonRequest({
      id: requestId,
      tenantId: dto.tenantId,
      productId: product.id,
      status: 'queued',
    });

    if (sessionToken) {
      const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
      const customerSession = await prisma.customerSession.findFirst({
        where: { sessionTokenHash, isActive: true, customer: { tenantId: dto.tenantId } },
        include: { customer: true }
      });
      if (customerSession) {
        // Automatically bypass OTP by creating a lead linked to this trusted customer
        await prisma.lead.create({
          data: {
            tenantId: dto.tenantId,
            tryonRequestId: requestId,
            customerId: customerSession.customerId,
            customerName: '', // Could be filled from customer profile in future
            phoneNumber: customerSession.customer.phone,
            countryCode: customerSession.customer.countryCode,
            status: 'NEW',
          }
        });
        
        // Update lastSeenAt
        await prisma.customerSession.update({ where: { id: customerSession.id }, data: { lastSeenAt: new Date() } });
        await prisma.customer.update({ where: { id: customerSession.customerId }, data: { lastSeenAt: new Date() } });
      }
    }

    // 5. Upload to R2
    const userImageKey = `${dto.tenantId}/uploads/${requestId}`;
    await upload(userImageKey, compressed, 'image/jpeg');

    // 6. Enqueue job
    const resolvedTenant = await resolveTenantConfig(dto.tenantId); // Get config for payload

    const payload: TryonJobPayload = {
      requestId: tryonRequest.id,
      tenantId: dto.tenantId,
      productId: product.id,
      productImageUrl: product.imageUrl,
      userImageKey: userImageKey,
      category: product.category,
      config: {
        segmindModel: resolvedTenant.segmindModel,
        complimentTone: resolvedTenant.complimentTone as any,
        watermark: {
          type: 'pattern-logo',
          keyOrUrl: resolvedTenant.watermarkKey || resolvedTenant.logoUrl || 'MomzCradle_Water_mark.png',
          text: resolvedTenant.watermarkText || resolvedTenant.name,
          scale: resolvedTenant.watermarkScale ?? 0.21,
          position: resolvedTenant.watermarkPosition ?? 'bottom-right',
          opacity: resolvedTenant.watermarkType === 'pattern-text' ? 0.10 : (resolvedTenant.watermarkOpacity ?? 0.68),
          rotation: resolvedTenant.watermarkRotation ?? -30,
          spacing: resolvedTenant.watermarkSpacing ?? 345,
          tenantId: resolvedTenant.id,
        },
      },
    };

    await this.queue.add(QUEUE_NAMES.TRYON, payload, JOB_OPTIONS.TRYON);

    return { jobId: tryonRequest.id };
  }

  async getStatus(jobId: string, tenantId: string): Promise<TryonStatusResponse> {
    // Resolve tenant config to check if Lead Capture is enabled
    const tenantConfig = await resolveTenantConfig(tenantId);
    const leadCaptureEnabled = tenantConfig?.leadCaptureEnabled === true;

    if (leadCaptureEnabled) {
      const lead = await getLeadByTryonRequestId(jobId);
      if (!lead) {
        // Lead capture required, bypass full response cache and fetch from DB to return preview
        const record = await getTryonRequest(jobId);
        if (!record || record.tenantId !== tenantId) {
          throw new NotFoundException(`Job ${jobId} not found`);
        }
        return this.mapToResponse(record);
      }
    }

    // 1. Check full response cache first (fully eliminates database reads during widget polling)
    const responseCacheKey = `tryon:${jobId}:response`;
    const cachedResponse = await this.redis.get(responseCacheKey);
    if (cachedResponse) {
      this.logger.debug(`[Cache Hit] Polling response: ${responseCacheKey}`);
      return JSON.parse(cachedResponse);
    }

    this.logger.debug(`[Cache Miss] Polling response: ${responseCacheKey}`);

    // 2. Fallback: Check status cache (for backward compatibility / cold start)
    const statusCacheKey = `tryon:${jobId}:status`;
    const cachedStatus = await this.redis.get(statusCacheKey);

    if (cachedStatus === 'completed' || cachedStatus === 'failed') {
      const record = await getTryonRequest(jobId);
      if (!record || record.tenantId !== tenantId) {
        throw new NotFoundException(`Job ${jobId} not found`);
      }
      const response = await this.mapToResponse(record);
      // Cache completed response in Redis for 3 minutes (180 seconds)
      await this.redis.set(responseCacheKey, JSON.stringify(response), 'EX', 180);
      return response;
    }

    // 3. Fallback: Query database
    const record = await getTryonRequest(jobId);
    if (!record || record.tenantId !== tenantId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const response = await this.mapToResponse(record);
    if (response.status === 'completed' || response.status === 'failed') {
      // Cache completed response in Redis for 3 minutes (180 seconds)
      await this.redis.set(responseCacheKey, JSON.stringify(response), 'EX', 180);
    }
    return response;
  }

  private async mapToResponse(record: any): Promise<TryonStatusResponse> {
    if (record.status !== 'completed' && record.status !== 'failed') {
      return { status: record.status };
    }

    if (record.status === 'failed') {
      return { status: 'failed' };
    }

    // Step 5 Backward Compatibility: Check tenant leadCaptureEnabled flag
    let leadCaptureEnabled = false;
    try {
      const config = await resolveTenantConfig(record.tenantId);
      leadCaptureEnabled = config?.leadCaptureEnabled === true;
    } catch (e) {
      this.logger.warn(`Failed to resolve tenant config for ${record.tenantId} in mapToResponse: ${e}`);
    }

    if (leadCaptureEnabled && record.generatedImageKey) {
      const lead = await getLeadByTryonRequestId(record.id);
      if (!lead) {
        this.logger.debug(`[Lead Capture Required] Job ${record.id} completed, awaiting contact submission`);
        const previewKey = record.previewImageKey || record.generatedImageKey;
        const previewImageUrl = await getSignedReadUrl(previewKey);
        const unlockToken = await this.leadService.generateUnlockToken(record.tenantId, record.id);
        const expiresAt = new Date(Date.now() + 600 * 1000).toISOString(); // 10-minute expiry
        return {
          status: 'awaiting_lead',
          requiresLeadCapture: true,
          previewImageUrl,
          previewImage: previewImageUrl,
          unlockRequired: true,
          unlockToken,
          expiresAt,
          compliment: record.compliment ?? undefined,
        };
      }
    }

    let imageUrl: string | undefined;
    if (record.generatedImageKey) {
      imageUrl = await getSignedReadUrl(record.generatedImageKey);
    }

    return {
      status: 'unlocked',
      requiresLeadCapture: false,
      imageUrl,
      compliment: record.compliment,
      styleScore: record.styleScore,
      complimentCached: record.complimentCached,
    };
  }
}

