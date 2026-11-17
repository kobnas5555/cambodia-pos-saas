import type { ListSaleReturnItemsQueryInput } from '@cambodia-pos/shared';
import { prisma } from '../../db/prisma';

export async function listSaleReturnItems(
  tenantId: string,
  options?: Partial<ListSaleReturnItemsQueryInput> & {
    saleReturnId?: string;
    orderItemId?: string;
    productId?: string;
    branchId?: string;
    orderId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number | string;
    limit?: number | string;
  },
) {
  const query = options || {};
  const page = Math.max(1, Number(query.page) || 1);
  const take = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * take;

  const where: any = {
    saleReturn: {
      tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
    },
    ...(query.saleReturnId ? { saleReturnId: query.saleReturnId } : {}),
    ...(query.orderItemId ? { orderItemId: query.orderItemId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
  };

  if (query.startDate || query.endDate) {
    where.saleReturn.returnedAt = {};
    if (query.startDate) where.saleReturn.returnedAt.gte = new Date(query.startDate);
    if (query.endDate) where.saleReturn.returnedAt.lte = new Date(query.endDate);
  }

  if (query.search?.trim()) {
    const s = query.search.trim();
    where.OR = [
      { product: { name: { contains: s, mode: 'insensitive' } } },
      { product: { sku: { contains: s, mode: 'insensitive' } } },
      { product: { barcode: { contains: s, mode: 'insensitive' } } },
      { orderItem: { productNameSnapshot: { contains: s, mode: 'insensitive' } } },
      { orderItem: { skuSnapshot: { contains: s, mode: 'insensitive' } } },
      { saleReturn: { returnNumber: { contains: s, mode: 'insensitive' } } },
      { saleReturn: { returnReason: { contains: s, mode: 'insensitive' } } },
      { saleReturn: { order: { orderNumber: { contains: s, mode: 'insensitive' } } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.saleReturnItem.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            trackInventory: true,
          },
        },
        orderItem: {
          select: {
            id: true,
            productNameSnapshot: true,
            skuSnapshot: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
        },
        saleReturn: {
          select: {
            id: true,
            returnNumber: true,
            returnReason: true,
            refundMethod: true,
            restockStatus: true,
            status: true,
            returnedAt: true,
            orderId: true,
            order: {
              select: {
                id: true,
                orderNumber: true,
                currencyCode: true,
                status: true,
              },
            },
            branch: {
              select: {
                id: true,
                name: true,
                branchCode: true,
              },
            },
            employee: {
              select: {
                id: true,
                name: true,
                employeeCode: true,
              },
            },
          },
        },
      },
      orderBy: { saleReturn: { returnedAt: 'desc' } },
      skip,
      take,
    }),
    prisma.saleReturnItem.count({ where }),
  ]);

  const totalPages = Math.ceil(total / take) || 1;
  return Object.assign(items, {
    items,
    total,
    page,
    limit: take,
    totalPages,
  });
}

