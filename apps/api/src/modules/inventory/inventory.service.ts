import type {
  CreateStockAdjustmentInput,
  ListStockAdjustmentsQueryInput,
  ListStockMovementsQueryInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { resolveActorEmployeeId } from '../../common/utils/actor';
import { generateDocumentNumber, getTenantDocumentPrefix } from '../../common/utils/numbering';
import { applyStockMovement } from '../../common/utils/stock';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listStockBalances(
  tenantId: string,
  filters: { branchId?: string; search?: string; lowStockOnly?: boolean },
) {
  const rows = await prisma.stockBalance.findMany({
    where: {
      tenantId,
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.search
        ? {
            product: {
              OR: [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { sku: { contains: filters.search, mode: 'insensitive' } },
                { barcode: { contains: filters.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    },
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
  });

  const mapped = rows.map((r) => ({
    id: r.id,
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

  return filters.lowStockOnly ? mapped.filter((m) => m.isLowStock) : mapped;
}

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

export async function listStockAdjustments(
  tenantId: string,
  filters: Partial<ListStockAdjustmentsQueryInput> | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    tenantId,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
    ...(query.startDate || query.endDate
      ? {
          adjustmentDate: {
            ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
            ...(query.endDate ? { lte: new Date(query.endDate + 'T23:59:59.999Z') } : {}),
          },
        }
      : {}),
  };

  if (query.search?.trim()) {
    const q = query.search.trim();
    where.OR = [
      { adjustmentNumber: { contains: q, mode: 'insensitive' } },
      { reason: { contains: q, mode: 'insensitive' } },
      { id: { contains: q, mode: 'insensitive' } },
    ];
  }

  const total = await prisma.stockAdjustment.count({ where });
  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : (hasPagination ? 20 : total || 20);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const items = await prisma.stockAdjustment.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      employee: { select: { id: true, name: true } },
      approver: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
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

export async function getAdjustmentById(tenantId: string, adjustmentId: string) {
  const adjustment = await prisma.stockAdjustment.findFirst({
    where: { id: adjustmentId, tenantId },
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      employee: { select: { id: true, name: true } },
      approver: { select: { id: true, name: true } },
    },
  });
  if (!adjustment) throw AppError.notFound('Stock adjustment not found', 'ADJUSTMENT_NOT_FOUND');

  const movements = await prisma.stockMovement.findMany({
    where: {
      tenantId,
      referenceType: 'StockAdjustment',
      referenceId: adjustment.id,
    },
    include: {
      product: { select: { id: true, sku: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return {
    ...adjustment,
    movements,
  };
}

export async function createStockAdjustment(
  tenantId: string,
  actor: ActorInfo,
  input: CreateStockAdjustmentInput,
) {
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, tenantId, status: 'ACTIVE' },
    });
    if (!branch) throw AppError.notFound('Active branch not found', 'BRANCH_NOT_FOUND');

    const employeeId = await resolveActorEmployeeId(tx, tenantId, actor.userId, actor.employeeId);
    const count = await tx.stockAdjustment.count({ where: { tenantId, branchId: branch.id } });
    const adjustmentPrefix = await getTenantDocumentPrefix(tx, tenantId, 'adjustmentPrefix', 'ADJ');
    const adjustmentNumber = generateDocumentNumber(adjustmentPrefix, count);

    const adjustment = await tx.stockAdjustment.create({
      data: {
        tenantId,
        branchId: branch.id,
        adjustmentNumber,
        employeeId,
        approvedBy: employeeId,
        reason: input.reason,
        status: 'APPROVED',
        ...(input.adjustmentDate ? { adjustmentDate: new Date(input.adjustmentDate) } : {}),
      },
    });

    for (const item of input.items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, tenantId },
      });
      if (!product) {
        throw AppError.notFound(`Product ${item.productId} not found`, 'PRODUCT_NOT_FOUND');
      }
      if (product.status !== 'ACTIVE') {
        throw AppError.badRequest(
          `Product ${product.name} is archived and cannot be adjusted`,
          'PRODUCT_ARCHIVED',
        );
      }
      if (!product.trackInventory) {
        throw AppError.badRequest(
          `Inventory tracking is disabled for ${product.name}`,
          'INVENTORY_NOT_TRACKED',
        );
      }

      await applyStockMovement(tx, {
        tenantId,
        branchId: branch.id,
        productId: product.id,
        movementType: item.direction === 'IN' ? 'adjustment_in' : 'adjustment_out',
        quantityIn: item.direction === 'IN' ? item.quantity : '0',
        quantityOut: item.direction === 'OUT' ? item.quantity : '0',
        referenceType: 'StockAdjustment',
        referenceId: adjustment.id,
        notes: item.notes || input.reason,
        createdByEmployeeId: employeeId,
      });
    }

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId,
        action: 'stock_adjustment.approved',
        module: 'inventory',
        recordType: 'StockAdjustment',
        recordId: adjustment.id,
        newValues: { adjustmentNumber, reason: input.reason, itemCount: input.items.length },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return adjustment;
  });
}

