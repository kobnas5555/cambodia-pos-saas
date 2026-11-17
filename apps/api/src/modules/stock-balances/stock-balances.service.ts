import type { ListStockBalancesQueryInput } from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';

export async function listStockBalances(
  tenantId: string,
  filters: Partial<ListStockBalancesQueryInput> | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    tenantId,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.search?.trim()
      ? {
          product: {
            OR: [
              { name: { contains: query.search.trim(), mode: 'insensitive' } },
              { sku: { contains: query.search.trim(), mode: 'insensitive' } },
              { barcode: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };

  const total = await prisma.stockBalance.count({ where });
  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const rows = await prisma.stockBalance.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      product: {
        select: {
          id: true,
          sku: true,
          barcode: true,
          name: true,
          lowStockAlert: true,
          costPrice: true,
          sellingPrice: true,
          unit: { select: { abbreviation: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  });

  const mapped = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    branchId: r.branchId,
    branch: r.branch,
    productId: r.productId,
    product: {
      ...r.product,
      lowStockAlert: r.product.lowStockAlert.toString(),
      costPrice: r.product.costPrice.toString(),
      sellingPrice: r.product.sellingPrice.toString(),
    },
    quantity: r.quantity.toString(),
    isLowStock: Number(r.quantity) <= Number(r.product.lowStockAlert),
    updatedAt: r.updatedAt,
  }));

  const items = query.lowStockOnly ? mapped.filter((m) => m.isLowStock) : mapped;
  const totalCount = query.lowStockOnly ? items.length : total;
  const totalPages = Math.ceil(totalCount / (limit || 1)) || 1;

  return Object.assign(items, {
    items,
    total: totalCount,
    page,
    limit,
    totalPages,
  });
}

export async function getStockBalanceById(tenantId: string, balanceId: string) {
  const balance = await prisma.stockBalance.findFirst({
    where: { id: balanceId, tenantId },
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      product: {
        select: {
          id: true,
          sku: true,
          barcode: true,
          name: true,
          lowStockAlert: true,
          costPrice: true,
          sellingPrice: true,
          unit: { select: { abbreviation: true } },
        },
      },
    },
  });

  if (!balance) {
    throw AppError.notFound('Stock balance not found', 'STOCK_BALANCE_NOT_FOUND');
  }

  return {
    id: balance.id,
    tenantId: balance.tenantId,
    branchId: balance.branchId,
    branch: balance.branch,
    productId: balance.productId,
    product: {
      ...balance.product,
      lowStockAlert: balance.product.lowStockAlert.toString(),
      costPrice: balance.product.costPrice.toString(),
      sellingPrice: balance.product.sellingPrice.toString(),
    },
    quantity: balance.quantity.toString(),
    isLowStock: Number(balance.quantity) <= Number(balance.product.lowStockAlert),
    updatedAt: balance.updatedAt,
  };
}

