import { Injectable } from '@nestjs/common';
import { prisma } from '@trail/db';

@Injectable()
export class AdminService {
  async getTenants() {
    return prisma.tenant.findMany({
      include: { config: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTenant(dto: {
    name: string;
    shopifyDomain: string;
    features?: string[];
    primaryColor?: string;
    complimentTone?: string;
    segmindModel?: string;
    logoUrl?: string;
  }) {
    return prisma.tenant.create({
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
          },
        },
      },
      include: { config: true },
    });
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
        tenant: { select: { name: true } },
      },
    });

    const costByTenant: Record<string, {
      tenantName: string;
      totalRequests: number;
      completedRequests: number;
      failedRequests: number;
      segmindCost: number;
      geminiCost: number;
      redisSavings: number;
      totalCost: number;
    }> = {};

    let globalSegmindCost = 0;
    let globalGeminiCost = 0;
    let globalRedisSavings = 0;

    for (const req of requests) {
      if (!costByTenant[req.tenantId]) {
        costByTenant[req.tenantId] = {
          tenantName: req.tenant.name,
          totalRequests: 0,
          completedRequests: 0,
          failedRequests: 0,
          segmindCost: 0,
          geminiCost: 0,
          redisSavings: 0,
          totalCost: 0,
        };
      }

      const t = costByTenant[req.tenantId];
      t.totalRequests++;
      if (req.status === 'completed') t.completedRequests++;
      if (req.status === 'failed') t.failedRequests++;

      let segmindCost = 0;
      if (req.status === 'completed') {
        segmindCost = 0.03;
      }

      let geminiCost = 0;
      let redisSavings = 0;
      if (req.status === 'completed') {
        if (req.complimentCached) {
          redisSavings = 0.00015;
        } else {
          geminiCost = 0.00015;
        }
      }

      t.segmindCost += segmindCost;
      t.geminiCost += geminiCost;
      t.redisSavings += redisSavings;

      globalSegmindCost += segmindCost;
      globalGeminiCost += geminiCost;
      globalRedisSavings += redisSavings;
    }

    const tenantsList = Object.keys(costByTenant).map(tenantId => {
      const t = costByTenant[tenantId];
      t.segmindCost = parseFloat(t.segmindCost.toFixed(4));
      t.geminiCost = parseFloat(t.geminiCost.toFixed(4));
      t.redisSavings = parseFloat(t.redisSavings.toFixed(4));
      t.totalCost = parseFloat((t.segmindCost + t.geminiCost).toFixed(4));
      return { tenantId, ...t };
    });

    return {
      summary: {
        totalSegmindCost: parseFloat(globalSegmindCost.toFixed(4)),
        totalGeminiCost: parseFloat(globalGeminiCost.toFixed(4)),
        totalRedisSavings: parseFloat(globalRedisSavings.toFixed(4)),
        totalCost: parseFloat((globalSegmindCost + globalGeminiCost).toFixed(4)),
      },
      tenants: tenantsList,
    };
  }
}
