import type {
  CreateProductInput,
  UpdateProductInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { resolveActorEmployeeId } from '../../common/utils/actor';
import { applyStockMovement } from '../../common/utils/stock';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listProducts(
  tenantId: string,
  filters: {
    search?: string;
    categoryId?: string;
    unitId?: string;
    status?: string;
    branchId?: string;
    trackInventory?: string;
    page?: number | string;
    limit?: number | string;
  } = {},
) {
  const where: any = {
    tenantId,
    ...(filters.status && filters.status !== 'ALL' ? { status: filters.status } : {}),
    ...(filters.categoryId && filters.categoryId !== 'ALL' ? { categoryId: filters.categoryId } : {}),
    ...(filters.unitId && filters.unitId !== 'ALL' ? { unitId: filters.unitId } : {}),
    ...(filters.trackInventory === 'TRUE'
      ? { trackInventory: true }
      : filters.trackInventory === 'FALSE'
        ? { trackInventory: false }
        : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { sku: { contains: filters.search, mode: 'insensitive' } },
            { barcode: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const total = await prisma.product.count({ where });

  const hasPagination = filters.page !== undefined || filters.limit !== undefined;
  const page = filters.page ? Math.max(1, Number(filters.page)) : 1;
  const limit = filters.limit ? Math.min(100, Math.max(1, Number(filters.limit))) : (hasPagination ? 50 : total || 50);
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

  const products = await prisma.product.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true, abbreviation: true } },
      stockBalances: filters.branchId
        ? { where: { branchId: filters.branchId }, select: { quantity: true, branchId: true } }
        : { select: { quantity: true, branchId: true } },
    },
    orderBy: { createdAt: 'desc' },
    ...(skip !== undefined ? { skip } : {}),
    ...(take !== undefined ? { take } : {}),
  });

  const mapped = products.map((p) => {
    const branchStock = filters.branchId
      ? p.stockBalances[0]?.quantity?.toString() ?? '0'
      : p.stockBalances
          .reduce((sum, sb) => sum + Number(sb.quantity), 0)
          .toString();

    return {
      id: p.id,
      tenantId: p.tenantId,
      categoryId: p.categoryId,
      unitId: p.unitId,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      description: p.description,
      costPrice: p.costPrice.toString(),
      sellingPrice: p.sellingPrice.toString(),
      wholesalePrice: p.wholesalePrice?.toString() ?? null,
      lowStockAlert: p.lowStockAlert.toString(),
      trackInventory: p.trackInventory,
      status: p.status,
      category: p.category,
      unit: p.unit,
      stockQuantity: branchStock,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  });

  const totalPages = Math.ceil(total / (limit || 1)) || 1;

  return Object.assign(mapped, {
    items: mapped,
    total,
    page,
    limit,
    totalPages,
  });
}

export async function createProduct(
  tenantId: string,
  actor: ActorInfo,
  input: CreateProductInput,
) {
  const [category, unit] = await Promise.all([
    prisma.category.findFirst({ where: { id: input.categoryId, tenantId } }),
    prisma.unit.findFirst({ where: { id: input.unitId, tenantId } }),
  ]);

  if (!category) throw AppError.notFound('Category not found in this workspace', 'CATEGORY_NOT_FOUND');
  if (!unit) throw AppError.notFound('Unit not found in this workspace', 'UNIT_NOT_FOUND');

  const skuDup = await prisma.product.findUnique({
    where: { tenantId_sku: { tenantId, sku: input.sku } },
  });
  if (skuDup) throw AppError.conflict(`SKU "${input.sku}" already exists`, 'SKU_TAKEN');

  if (input.barcode) {
    const barDup = await prisma.product.findUnique({
      where: { tenantId_barcode: { tenantId, barcode: input.barcode } },
    });
    if (barDup) throw AppError.conflict(`Barcode "${input.barcode}" already exists`, 'BARCODE_TAKEN');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId,
          categoryId: input.categoryId,
          unitId: input.unitId,
          sku: input.sku,
          barcode: input.barcode || null,
          name: input.name,
          description: input.description ?? null,
          costPrice: input.costPrice,
          sellingPrice: input.sellingPrice,
          wholesalePrice: input.wholesalePrice ?? null,
          lowStockAlert: input.lowStockAlert,
          trackInventory: input.trackInventory,
          status: 'ACTIVE',
        },
        include: {
          category: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, abbreviation: true } },
        },
      });

      if (input.trackInventory && input.openingStock && Number(input.openingStock) > 0) {
        let targetBranchId = input.branchId;
        if (!targetBranchId) {
          const mainBranch = await tx.branch.findFirst({
            where: { tenantId, status: 'ACTIVE' },
            orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
          });
          targetBranchId = mainBranch?.id;
        } else {
          const branch = await tx.branch.findFirst({ where: { id: targetBranchId, tenantId } });
          if (!branch) throw AppError.notFound('Branch not found', 'BRANCH_NOT_FOUND');
        }

        if (targetBranchId) {
          const employeeId = await resolveActorEmployeeId(tx, tenantId, actor.userId, actor.employeeId);
          await applyStockMovement(tx, {
            tenantId,
            branchId: targetBranchId,
            productId: product.id,
            movementType: 'opening_stock',
            quantityIn: input.openingStock,
            referenceType: 'Product',
            referenceId: product.id,
            notes: 'Opening stock on product creation',
            createdByEmployeeId: employeeId,
          });
        }
      }

      await recordActivity(
        {
          tenantId,
          userId: actor.userId,
          employeeId: actor.employeeId,
          action: 'product.created',
          module: 'products',
          recordType: 'Product',
          recordId: product.id,
          newValues: { sku: product.sku, name: product.name, sellingPrice: input.sellingPrice },
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return product;
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(' ') : String(err.meta?.target ?? '');
      if (target.includes('sku')) {
        throw AppError.conflict(`SKU "${input.sku}" already exists in this workspace`, 'SKU_TAKEN');
      }
      if (target.includes('barcode')) {
        throw AppError.conflict(`Barcode "${input.barcode}" already exists in this workspace`, 'BARCODE_TAKEN');
      }
      throw AppError.conflict('A unique product constraint was violated (SKU or Barcode)', 'PRODUCT_CONFLICT');
    }
    throw err;
  }
}

export async function updateProduct(
  tenantId: string,
  productId: string,
  actor: ActorInfo,
  input: UpdateProductInput,
) {
  const existing = await prisma.product.findFirst({ where: { id: productId, tenantId } });
  if (!existing) throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

  if (input.categoryId !== undefined) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, tenantId } });
    if (!category) throw AppError.notFound('Category not found in this workspace', 'CATEGORY_NOT_FOUND');
  }

  if (input.unitId !== undefined) {
    const unit = await prisma.unit.findFirst({ where: { id: input.unitId, tenantId } });
    if (!unit) throw AppError.notFound('Unit not found in this workspace', 'UNIT_NOT_FOUND');
  }

  if (input.sku && input.sku !== existing.sku) {
    const dup = await prisma.product.findUnique({
      where: { tenantId_sku: { tenantId, sku: input.sku } },
    });
    if (dup) throw AppError.conflict(`SKU "${input.sku}" already exists`, 'SKU_TAKEN');
  }

  const normalizedBarcode = input.barcode !== undefined ? input.barcode || null : undefined;
  if (normalizedBarcode && normalizedBarcode !== existing.barcode) {
    const dup = await prisma.product.findUnique({
      where: { tenantId_barcode: { tenantId, barcode: normalizedBarcode } },
    });
    if (dup) throw AppError.conflict(`Barcode "${normalizedBarcode}" already exists`, 'BARCODE_TAKEN');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(normalizedBarcode !== undefined ? { barcode: normalizedBarcode } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
          ...(input.sellingPrice !== undefined ? { sellingPrice: input.sellingPrice } : {}),
          ...(input.wholesalePrice !== undefined ? { wholesalePrice: input.wholesalePrice } : {}),
          ...(input.lowStockAlert !== undefined ? { lowStockAlert: input.lowStockAlert } : {}),
          ...(input.trackInventory !== undefined ? { trackInventory: input.trackInventory } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include: {
          category: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, abbreviation: true } },
        },
      });

      await recordActivity(
        {
          tenantId,
          userId: actor.userId,
          employeeId: actor.employeeId,
          action: input.status === 'ARCHIVED' ? 'product.archived' : 'product.updated',
          module: 'products',
          recordType: 'Product',
          recordId: productId,
          oldValues: {
            name: existing.name,
            sku: existing.sku,
            sellingPrice: existing.sellingPrice.toString(),
            status: existing.status,
          },
          newValues: input,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return updated;
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(' ') : String(err.meta?.target ?? '');
      if (target.includes('sku')) {
        throw AppError.conflict(`SKU "${input.sku}" already exists in this workspace`, 'SKU_TAKEN');
      }
      if (target.includes('barcode')) {
        throw AppError.conflict(`Barcode "${normalizedBarcode}" already exists in this workspace`, 'BARCODE_TAKEN');
      }
      throw AppError.conflict('A unique product constraint was violated (SKU or Barcode)', 'PRODUCT_CONFLICT');
    }
    throw err;
  }
}

export async function archiveProduct(tenantId: string, productId: string, actor: ActorInfo) {
  return updateProduct(tenantId, productId, actor, { status: 'ARCHIVED' });
}

export async function deleteProduct(
  tenantId: string,
  productId: string,
  actor: ActorInfo,
  mode?: string,
) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    include: {
      _count: {
        select: {
          orderItems: true,
          saleReturnItems: true,
          purchaseItems: true,
          stockMovements: true,
        },
      },
    },
  });
  if (!existing) throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

  const hasHistory =
    ((existing as any)._count?.orderItems ?? 0) > 0 ||
    ((existing as any)._count?.saleReturnItems ?? 0) > 0 ||
    ((existing as any)._count?.purchaseItems ?? 0) > 0 ||
    ((existing as any)._count?.stockMovements ?? 0) > 0;

  if (mode === 'permanent') {
    if (hasHistory) {
      throw AppError.badRequest(
        'Cannot permanently delete product with existing sales, purchases, or stock movement history. Product should be archived instead.',
        'PRODUCT_HAS_HISTORY',
      );
    }
    return prisma.$transaction(async (tx) => {
      await tx.stockBalance.deleteMany({ where: { productId } });
      const deleted = await tx.product.delete({ where: { id: productId } });
      await recordActivity(
        {
          tenantId,
          userId: actor.userId,
          employeeId: actor.employeeId,
          action: 'product.deleted',
          module: 'products',
          recordType: 'Product',
          recordId: productId,
          oldValues: { name: existing.name, sku: existing.sku },
          ipAddress: actor.ipAddress,
        },
        tx,
      );
      return deleted;
    });
  }

  // Default: archive product to ARCHIVED for transactional safety
  return archiveProduct(tenantId, productId, actor);
}

