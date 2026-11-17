import type { ListPurchaseItemsQueryInput } from '@cambodia-pos/shared';
import { prisma } from '../../db/prisma';

export async function listPurchaseItems(
  tenantId: string,
  filters: Partial<ListPurchaseItemsQueryInput> | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    purchase: {
      tenantId,
      ...(query.purchaseId ? { id: query.purchaseId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.startDate || query.endDate
        ? {
            purchaseDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    },
    ...(query.purchaseId ? { purchaseId: query.purchaseId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.search
      ? {
          OR: [
            { productNameSnapshot: { contains: query.search, mode: 'insensitive' } },
            { purchase: { purchaseNumber: { contains: query.search, mode: 'insensitive' } } },
            { purchase: { supplier: { name: { contains: query.search, mode: 'insensitive' } } } },
            { product: { sku: { contains: query.search, mode: 'insensitive' } } },
            { product: { barcode: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const total = await prisma.purchaseItem.count({ where });

  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const items = await prisma.purchaseItem.findMany({
    where,
    include: {
      purchase: {
        select: {
          id: true,
          purchaseNumber: true,
          currencyCode: true,
          exchangeRate: true,
          status: true,
          purchaseDate: true,
          receivedAt: true,
          branch: { select: { id: true, name: true, branchCode: true } },
          supplier: { select: { id: true, name: true, contactPerson: true, phone: true } },
          employee: { select: { id: true, name: true, employeeCode: true } },
        },
      },
      product: {
        select: { id: true, name: true, sku: true, barcode: true, trackInventory: true },
      },
    },
    orderBy: { purchase: { purchaseDate: 'desc' } },
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

