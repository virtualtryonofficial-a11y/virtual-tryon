import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config as appConfig } from '@trail/config';
import { QUEUE_NAMES } from '@trail/queue';
import { prisma, createAuditLog } from '@trail/db';


@Injectable()
export class AdminService {
  async getTenants() {
    return prisma.tenant.findMany({
      include: { config: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTenant(
    dto: {
      name: string;
      shopifyDomain: string;
      features?: string[];
      primaryColor?: string;
      complimentTone?: string;
      segmindModel?: string;
      logoUrl?: string;
      buttonStyle?: string;
      widgetTheme?: string;
    },
    actor = 'admin',
    ipAddress?: string,
  ) {
    const tenant = await prisma.tenant.create({
      data: {
        name: dto.name,
        shopifyDomain: dto.shopifyDomain,
        features: dto.features || ['tryon'],
        config: {
          create: {
            primaryColor: dto.primaryColor || '#000000',
            complimentTone: dto.complimentTone || 'friendly',
            segmindModel: dto.segmindModel || 'fashion-tryon-v1',
            logoUrl: dto.logoUrl || null,
            buttonStyle: dto.buttonStyle || 'rounded',
            widgetTheme: dto.widgetTheme || 'light',
          },
        },
      },
      include: { config: true },
    });

    await createAuditLog({
      tenantId: tenant.id,
      action: 'tenant_created',
      actor,
      ipAddress,
      metadata: { name: tenant.name, shopifyDomain: tenant.shopifyDomain, features: tenant.features },
    }).catch(() => { /* audit failure must not block operation */ });

    return tenant;
  }

  async getRequests(filters: { tenantId?: string; status?: string }) {
    const where: any = {};
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.status) where.status = filters.status;

    return prisma.tryonRequest.findMany({
      where,
      include: {
        tenant: { select: { name: true, shopifyDomain: true } },
        product: { select: { shopifyProductId: true, imageUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getAnalytics() {
    const [tenantsCount, productsCount, requestsCount, statusGroups, successfulRequests] = await Promise.all([
      prisma.tenant.count(),
      prisma.product.count(),
      prisma.tryonRequest.count(),
      prisma.tryonRequest.groupBy({
        by: ['status'],
        _count: true,
      }),
      prisma.tryonRequest.findMany({
        where: { status: 'completed' },
        select: { processingTimeMs: true, complimentCached: true },
      }),
    ]);

    const statusBreakdown = statusGroups.reduce((acc, curr) => {
      acc[curr.status] = curr._count;
      return acc;
    }, {} as Record<string, number>);

    const completedCount = statusBreakdown['completed'] || 0;
    const failedCount = statusBreakdown['failed'] || 0;
    const successRate = requestsCount > 0 ? (completedCount / (completedCount + failedCount || 1)) * 100 : 100;

    // Average processing time
    const validProcessingTimes = successfulRequests.filter(req => req.processingTimeMs !== null);
    const totalProcessingTime = validProcessingTimes.reduce((sum, req) => sum + (req.processingTimeMs || 0), 0);
    const avgProcessingTimeMs = validProcessingTimes.length > 0 ? totalProcessingTime / validProcessingTimes.length : 0;

    // Cache hit ratio
    const cachedCount = successfulRequests.filter(req => req.complimentCached).length;
    const cacheHitRatio = successfulRequests.length > 0 ? (cachedCount / successfulRequests.length) * 100 : 0;

    return {
      totals: {
        tenants: tenantsCount,
        products: productsCount,
        requests: requestsCount,
      },
      successRate: parseFloat(successRate.toFixed(2)),
      avgProcessingTimeMs: Math.round(avgProcessingTimeMs),
      cacheHitRatio: parseFloat(cacheHitRatio.toFixed(2)),
      statusBreakdown: {
        queued: statusBreakdown['queued'] || 0,
        processing: statusBreakdown['processing'] || 0,
        completed: completedCount,
        failed: failedCount,
      },
    };
  }

  async getCosts() {
    const requests = await prisma.tryonRequest.findMany({
      select: {
        tenantId: true,
        status: true,
        complimentCached: true,
        createdAt: true,
        tenant: { select: { name: true, shopifyDomain: true } },
      },
    });

    const costByTenant: Record<string, {
      tenantName: string;
      shopifyDomain: string;
      totalRequests: number;
      completedRequests: number;
      failedRequests: number;
      thisMonthRequests: number;
      segmindCost: number;
      geminiCost: number;
      redisSavings: number;
      totalCost: number;
      thisMonthCost: number;
    }> = {};

    let globalSegmindCost = 0;
    let globalGeminiCost = 0;
    let globalRedisSavings = 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    for (const req of requests) {
      if (!costByTenant[req.tenantId]) {
        costByTenant[req.tenantId] = {
          tenantName: req.tenant.name,
          shopifyDomain: req.tenant.shopifyDomain,
          totalRequests: 0,
          completedRequests: 0,
          failedRequests: 0,
          thisMonthRequests: 0,
          segmindCost: 0,
          geminiCost: 0,
          redisSavings: 0,
          totalCost: 0,
          thisMonthCost: 0,
        };
      }

      const t = costByTenant[req.tenantId];
      t.totalRequests++;
      if (req.status === 'completed') t.completedRequests++;
      if (req.status === 'failed') t.failedRequests++;

      const isThisMonth = req.createdAt.getMonth() === currentMonth && req.createdAt.getFullYear() === currentYear;
      if (isThisMonth) {
        t.thisMonthRequests++;
      }

      // Convert USD to INR (approx 83.5 INR = 1 USD)
      let segmindCost = 0;
      if (req.status === 'completed') {
        segmindCost = 2.505; // 0.03 USD
      }

      let geminiCost = 0;
      let redisSavings = 0;
      if (req.status === 'completed') {
        if (req.complimentCached) {
          redisSavings = 0.0125; // 0.00015 USD
        } else {
          geminiCost = 0.0125;
        }
      }

      t.segmindCost += segmindCost;
      t.geminiCost += geminiCost;
      t.redisSavings += redisSavings;

      if (isThisMonth) {
        t.thisMonthCost += (segmindCost + geminiCost);
      }

      globalSegmindCost += segmindCost;
      globalGeminiCost += geminiCost;
      globalRedisSavings += redisSavings;
    }

    const tenantsList = Object.keys(costByTenant).map(tenantId => {
      const t = costByTenant[tenantId];
      t.segmindCost = parseFloat(t.segmindCost.toFixed(2));
      t.geminiCost = parseFloat(t.geminiCost.toFixed(2));
      t.redisSavings = parseFloat(t.redisSavings.toFixed(2));
      t.totalCost = parseFloat((t.segmindCost + t.geminiCost).toFixed(2));
      t.thisMonthCost = parseFloat(t.thisMonthCost.toFixed(2));
      return { tenantId, ...t };
    });

    return {
      summary: {
        totalSegmindCost: parseFloat(globalSegmindCost.toFixed(2)),
        totalGeminiCost: parseFloat(globalGeminiCost.toFixed(2)),
        totalRedisSavings: parseFloat(globalRedisSavings.toFixed(2)),
        totalCost: parseFloat((globalSegmindCost + globalGeminiCost).toFixed(2)),
      },
      tenants: tenantsList,
    };
  }

  async getTenantById(id: string) {
    return prisma.tenant.findUnique({
      where: { id },
      include: { config: true },
    });
  }

  async updateTenant(
    id: string,
    data: { name?: string; shopifyDomain?: string; features?: string[] },
    actor = 'admin',
    ipAddress?: string,
  ) {
    const tenant = await prisma.tenant.update({
      where: { id },
      data,
      include: { config: true },
    });

    await createAuditLog({
      tenantId: id,
      action: 'tenant_updated',
      actor,
      ipAddress,
      metadata: { updatedFields: Object.keys(data), changes: data },
    }).catch(() => {});

    return tenant;
  }

  async setPreferredGarmentImage(productId: string, imageUrl: string) {
    return prisma.product.update({
      where: { id: productId },
      data: { preferredGarmentImage: imageUrl },
    });
  }

  async getImageSelectionGuidance() {
    return {
      message: 'For best AI try-on results, upload at least one product image with only the garment on a plain background.',
    };
  }

  async upsertTenantConfig(tenantId: string, data: any, actor = 'admin', ipAddress?: string) {
    const result = await prisma.tenantConfig.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });

    await createAuditLog({
      tenantId,
      action: 'tenant_config_upserted',
      actor,
      ipAddress,
      metadata: { updatedFields: Object.keys(data) },
    }).catch(() => {});

    return result;
  }

  async updateTenantConfig(tenantId: string, data: any, actor = 'admin', ipAddress?: string) {
    const result = await prisma.tenantConfig.update({
      where: { tenantId },
      data,
    });

    await createAuditLog({
      tenantId,
      action: 'tenant_config_updated',
      actor,
      ipAddress,
      metadata: { updatedFields: Object.keys(data) },
    }).catch(() => {});

    return result;
  }

  async getTenantAnalytics(tenantId: string) {
    const [productsCount, requestsCount, statusGroups, successfulRequests] = await Promise.all([
      prisma.product.count({ where: { tenantId } }),
      prisma.tryonRequest.count({ where: { tenantId } }),
      prisma.tryonRequest.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      prisma.tryonRequest.findMany({
        where: { tenantId, status: 'completed' },
        select: { processingTimeMs: true, complimentCached: true },
      }),
    ]);

    const statusBreakdown = statusGroups.reduce((acc, curr) => {
      acc[curr.status] = curr._count;
      return acc;
    }, {} as Record<string, number>);

    const completedCount = statusBreakdown['completed'] || 0;
    const failedCount = statusBreakdown['failed'] || 0;
    
    // Total tryons
    const totalTryons = requestsCount;

    // Average processing time
    const validProcessingTimes = successfulRequests.filter(req => req.processingTimeMs !== null);
    const totalProcessingTime = validProcessingTimes.reduce((sum, req) => sum + (req.processingTimeMs || 0), 0);
    const avgProcessingTimeMs = validProcessingTimes.length > 0 ? totalProcessingTime / validProcessingTimes.length : 0;

    // Cache hit ratio
    const cachedCount = successfulRequests.filter(req => req.complimentCached).length;
    const cacheHitRatio = successfulRequests.length > 0 ? (cachedCount / successfulRequests.length) * 100 : 0;

    return {
      totalTryons,
      completedCount,
      failedCount,
      avgProcessingTimeMs: Math.round(avgProcessingTimeMs),
      complimentCacheHitRate: parseFloat(cacheHitRatio.toFixed(2)),
      activeProducts: productsCount,
    };
  }

  async clearQueues() {
    const connection = new Redis(appConfig.redis.url, { maxRetriesPerRequest: null });
    try {
      const tryonQueue = new Queue(QUEUE_NAMES.TRYON, { connection });
      const dlqQueue = new Queue('tryon-dlq', { connection });

      // Clean all jobs from tryon-queue
      await tryonQueue.drain();
      await tryonQueue.clean(0, 1000, 'failed');
      await tryonQueue.clean(0, 1000, 'completed');

      // Clean all jobs from tryon-dlq instead of obliterating
      // (obliterate uses the KEYS command which is blocked on managed Render Redis)
      await dlqQueue.drain();
      await dlqQueue.clean(0, 1000, 'failed');
      await dlqQueue.clean(0, 1000, 'completed');

      return { success: true };
    } finally {
      await connection.quit();
    }
  }
}
