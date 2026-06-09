import { PrismaClient, Prisma } from '@prisma/client';
import { config } from '@trail/config';

export * from '@prisma/client';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.database.url,
    },
  },
});

// Repository functions

export async function createTenant(data: Prisma.TenantCreateInput) {
  return prisma.tenant.create({ data });
}

export async function getTenantById(id: string) {
  return prisma.tenant.findUnique({
    where: { id },
    include: { config: true },
  });
}

export async function getTenantByDomain(shopifyDomain: string) {
  return prisma.tenant.findUnique({
    where: { shopifyDomain },
    include: { config: true },
  });
}

export async function getTenantConfig(tenantId: string) {
  return prisma.tenantConfig.findUnique({
    where: { tenantId },
  });
}

export async function createTryonRequest(data: Prisma.TryonRequestUncheckedCreateInput) {
  return prisma.tryonRequest.create({ data });
}

export async function updateTryonRequest(id: string, data: Prisma.TryonRequestUpdateInput) {
  return prisma.tryonRequest.update({
    where: { id },
    data,
  });
}

export async function getTryonRequest(id: string) {
  return prisma.tryonRequest.findUnique({
    where: { id },
    include: { product: true },
  });
}

export async function getTenantWithConfig(id: string) {
  return prisma.tenant.findUnique({
    where: { id },
    include: { config: true },
  });
}

export async function getProductByTenantAndShopifyId(tenantId: string, shopifyProductId: string) {
  return prisma.product.findUnique({
    where: {
      tenantId_shopifyProductId: {
        tenantId,
        shopifyProductId,
      },
    },
  });
}

export async function createProduct(data: Prisma.ProductUncheckedCreateInput) {
  return prisma.product.create({ data });
}

export async function updateProductGarmentImageOverride(tenantId: string, shopifyProductId: string, imageUrl: string | null) {
  return prisma.product.update({
    where: {
      tenantId_shopifyProductId: {
        tenantId,
        shopifyProductId,
      },
    },
    data: {
      preferredGarmentImage: imageUrl,
    },
  });
}

export async function updateProductSyncedImages(tenantId: string, shopifyProductId: string, images: any[]) {
  return prisma.product.update({
    where: {
      tenantId_shopifyProductId: {
        tenantId,
        shopifyProductId,
      },
    },
    data: {
      images: images as any,
    },
  });
}

export async function createAuditLog(data: Prisma.AuditLogUncheckedCreateInput) {
  return prisma.auditLog.create({ data });
}

export async function getTryonRequestsForCleanup(userImageOlderThanMs: number, generatedImageOlderThanMs: number) {
  const now = new Date();
  const userCutoff = new Date(now.getTime() - userImageOlderThanMs);
  const generatedCutoff = new Date(now.getTime() - generatedImageOlderThanMs);

  return prisma.tryonRequest.findMany({
    where: {
      OR: [
        {
          userImageKey: { not: null },
          createdAt: { lt: userCutoff },
        },
        {
          generatedImageKey: { not: null },
          createdAt: { lt: generatedCutoff },
        },
      ],
    },
  });
}

export async function getTryonRequestsForTenant(tenantId: string) {
  return prisma.tryonRequest.findMany({
    where: { tenantId },
  });
}

export async function purgeTenantFromDb(id: string) {
  return prisma.tenant.delete({
    where: { id },
  });
}
