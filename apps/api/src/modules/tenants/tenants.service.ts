import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@trail/db';

@Injectable()
export class TenantsService {
  async getPublicTenantAnalytics(tenantId: string) {
    // Ensure tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

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
        select: { processingTimeMs: true, complimentCached: true, createdAt: true },
      }),
    ]);

    const statusBreakdown = statusGroups.reduce((acc, curr) => {
      acc[curr.status] = curr._count;
      return acc;
    }, {} as Record<string, number>);

    const completedCount = statusBreakdown['completed'] || 0;
    const failedCount = statusBreakdown['failed'] || 0;
    const queuedCount = statusBreakdown['queued'] || 0;
    const processingCount = statusBreakdown['processing'] || 0;
    
    // Success rate
    const successRate = requestsCount > 0 ? (completedCount / (completedCount + failedCount || 1)) * 100 : 100;

    // Average processing time
    const validProcessingTimes = successfulRequests.filter(req => req.processingTimeMs !== null);
    const totalProcessingTime = validProcessingTimes.reduce((sum, req) => sum + (req.processingTimeMs || 0), 0);
    const avgProcessingTimeMs = validProcessingTimes.length > 0 ? totalProcessingTime / validProcessingTimes.length : 0;

    // Get requests for the last 7 days for a chart
    const last7Days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      last7Days[dateStr] = 0;
    }

    successfulRequests.forEach(req => {
      const dateStr = req.createdAt.toISOString().split('T')[0];
      if (last7Days[dateStr] !== undefined) {
        last7Days[dateStr]++;
      }
    });

    return {
      tenantName: tenant.name,
      shopifyDomain: tenant.shopifyDomain,
      totalTryons: requestsCount,
      completedCount,
      failedCount,
      queuedCount,
      processingCount,
      successRate: parseFloat(successRate.toFixed(2)),
      avgProcessingTimeMs: Math.round(avgProcessingTimeMs),
      activeProducts: productsCount,
      last7Days: Object.keys(last7Days).map(date => ({ date, count: last7Days[date] })),
    };
  }
}
