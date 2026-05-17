import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { config as appConfig } from '@trail/config';
import { 
  getProductByTenantAndShopifyId, 
  createTryonRequest, 
  getTryonRequest 
} from '@trail/db';
import { QUEUE_NAMES, JOB_OPTIONS, TryonJobPayload } from '@trail/queue';
import { upload, getSignedReadUrl } from '@trail/storage';
import { compressForTryOn } from '@trail/ai';
import { CreateTryonDto, TryonStatusResponse } from './tryon.dto';
import { validateUserImage } from './image.validation';
import { ImageValidationError } from './tryon.errors';

@Injectable()
export class TryonService {
  private queue: Queue;
  private redis: Redis;

  constructor() {
    const connection = new Redis(appConfig.redis.url, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE_NAMES.TRYON, { connection });
    this.redis = connection;
  }

  async create(dto: CreateTryonDto, requestId: string): Promise<{ jobId: string }> {
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

    // 3. Resolve product
    const product = await getProductByTenantAndShopifyId(dto.tenantId, dto.productId);
    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} not found for tenant ${dto.tenantId}`);
    }

    // 4. Create request in DB
    const tryonRequest = await createTryonRequest({
      id: requestId,
      tenantId: dto.tenantId,
      productId: product.id,
      status: 'queued',
    });

    // 5. Upload to R2
    const userImageKey = `${dto.tenantId}/uploads/${requestId}`;
    await upload(userImageKey, compressed, 'image/jpeg');

    // 6. Enqueue job
    const tenant = (await import('@trail/tenant')).resolveTenantConfig(dto.tenantId); // Get config for payload
    const resolvedTenant = await tenant;

    const payload: TryonJobPayload = {
      requestId: tryonRequest.id,
      tenantId: dto.tenantId,
      productId: product.id,
      productImageUrl: product.imageUrl,
      userImageKey: userImageKey,
      config: {
        segmindModel: resolvedTenant.segmindModel,
        complimentTone: resolvedTenant.complimentTone as any,
      },
    };

    await this.queue.add(QUEUE_NAMES.TRYON, payload, JOB_OPTIONS.TRYON);

    return { jobId: tryonRequest.id };
  }

  async getStatus(jobId: string, tenantId: string): Promise<TryonStatusResponse> {
    // 1. Check Redis cache first
    const cacheKey = `tryon:${jobId}:status`;
    const cachedStatus = await this.redis.get(cacheKey);

    if (cachedStatus === 'completed' || cachedStatus === 'failed') {
      const record = await getTryonRequest(jobId);
      if (!record || record.tenantId !== tenantId) {
        throw new NotFoundException(`Job ${jobId} not found`);
      }
      return this.mapToResponse(record);
    }

    // 2. Fallback to DB
    const record = await getTryonRequest(jobId);
    if (!record || record.tenantId !== tenantId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return this.mapToResponse(record);
  }

  private async mapToResponse(record: any): Promise<TryonStatusResponse> {
    let imageUrl: string | undefined;
    if (record.generatedImageKey) {
      imageUrl = await getSignedReadUrl(record.generatedImageKey);
    }

    return {
      status: record.status,
      imageUrl,
      compliment: record.compliment,
      styleScore: record.styleScore,
      complimentCached: record.complimentCached,
    };
  }
}
