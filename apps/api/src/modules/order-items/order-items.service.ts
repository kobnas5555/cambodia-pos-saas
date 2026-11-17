import { prisma } from '../../db/prisma';

export async function listOrderItems(
  tenantId: string,
  filters: {
    orderId?: string;
    productId?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number | string;
    limit?: number | string;
  } | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    order: {
      tenantId,
      ...(query.orderId ? { id: query.orderId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    },
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.search
      ? {
          OR: [
            { productNameSnapshot: { contains: query.search, mode: 'insensitive' } },
            { skuSnapshot: { contains: query.search, mode: 'insensitive' } },
            { order: { orderNumber: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const total = await prisma.orderItem.count({ where });

  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const items = await prisma.orderItem.findMany({
    where,
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          currencyCode: true,
          status: true,
          createdAt: true,
          branch: { select: { id: true, name: true, branchCode: true } },
          customer: { select: { id: true, name: true, customerCode: true } },
        },
      },
      product: {
        select: { id: true, name: true, sku: true, barcode: true, trackInventory: true },
      },
    },
    orderBy: { order: { createdAt: 'desc' } },
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  });

  const totalPages = Math.ceil(total / (limit || 1)) || 1;

  return Object.assign(items, {
    items,
    total,
    page,
    limit,
    totalPages,
  });
}

