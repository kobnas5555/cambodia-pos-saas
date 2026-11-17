import type { ListStockMovementsQueryInput } from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';

export async function listStockMovements(
  tenantId: string,
  filters: Partial<ListStockMovementsQueryInput> | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    tenantId,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.movementType && query.movementType !== 'ALL' ? { movementType: query.movementType } : {}),
    ...(query.referenceType ? { referenceType: query.referenceType } : {}),
    ...(query.referenceId ? { referenceId: query.referenceId } : {}),
    ...(query.createdBy ? { createdBy: query.createdBy } : {}),
    ...(query.startDate || query.endDate
      ? {
          createdAt: {
            ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
            ...(query.endDate ? { lte: new Date(query.endDate + 'T23:59:59.999Z') } : {}),
          },
        }
      : {}),
  };

  if (query.search?.trim()) {
    const q = query.search.trim();
    where.OR = [
      { notes: { contains: q, mode: 'insensitive' } },
      { id: { contains: q, mode: 'insensitive' } },
      {
        product: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
            { barcode: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  const total = await prisma.stockMovement.count({ where });
  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const movements = await prisma.stockMovement.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      product: { select: { id: true, sku: true, barcode: true, name: true } },
      employee: { select: { id: true, name: true, employeeCode: true } },
    },
    orderBy: { createdAt: 'desc' },
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  });

  const totalPages = Math.ceil(total / (limit || 1)) || 1;

  return Object.assign(movements, {
    items: movements,
    total,
    page,
    limit,
    totalPages,
  });
}

export async function getStockMovementById(tenantId: string, movementId: string) {
  const movement = await prisma.stockMovement.findFirst({
    where: { id: movementId, tenantId },
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      product: { select: { id: true, sku: true, barcode: true, name: true } },
      employee: { select: { id: true, name: true, employeeCode: true } },
    },
  });
  if (!movement) {
    throw AppError.notFound('Stock movement not found', 'STOCK_MOVEMENT_NOT_FOUND');
  }
  return movement;
}

