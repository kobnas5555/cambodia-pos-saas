import type {
  CreateCategoryInput,
  CreateProductInput,
  CreateSupplierInput,
  CreateUnitInput,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateSupplierInput,
  UpdateUnitInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { resolveActorEmployeeId } from '../../common/utils/actor';
import { applyStockMovement } from '../../common/utils/stock';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

// ============================================================================
// Categories
// ============================================================================

export async function listCategories(
  tenantId: string,
  options?:
    | string
    | {
        search?: string;
        status?: string;
        parentId?: string;
        page?: number;
        limit?: number;
      },
) {
  const search = typeof options === 'string' ? options : options?.search;
  const status = typeof options === 'object' ? options?.status : undefined;
  const parentId = typeof options === 'object' ? options?.parentId : undefined;
  const page = typeof options === 'object' && options?.page ? Math.max(1, Number(options.page)) : 1;
  const limit = typeof options === 'object' && options?.limit ? Math.max(1, Number(options.limit)) : 100;
  const skip = (page - 1) * limit;

  const where = {
    tenantId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(status && status !== 'ALL' ? { status } : {}),
    ...(parentId !== undefined && parentId !== 'ALL'
      ? parentId === 'ROOT' || parentId === 'null' || parentId === ''
        ? { parentId: null }
        : { parentId }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.category.count({ where }),
    prisma.category.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { products: true, children: true } },
      },
      orderBy: { name: 'asc' },
      skip,
      take: limit,
    }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function createCategory(
  tenantId: string,
  actor: ActorInfo,
  input: CreateCategoryInput,
) {
  if (input.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: input.parentId, tenantId },
    });
    if (!parent) throw AppError.notFound('Parent category not found', 'CATEGORY_NOT_FOUND');
  }

  return prisma.$transaction(async (tx) => {
    const cat = await tx.category.create({
      data: {
        tenantId,
        name: input.name,
        description: input.description ?? null,
        parentId: input.parentId ?? null,
        status: 'ACTIVE',
      },
    });
    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'category.created',
        module: 'products',
        recordType: 'Category',
        recordId: cat.id,
        newValues: { name: cat.name },
        ipAddress: actor.ipAddress,
      },
      tx,
    );
    return cat;
  });
}

export async function updateCategory(
  tenantId: string,
  categoryId: string,
  actor: ActorInfo,
  input: UpdateCategoryInput,
) {
  const existing = await prisma.category.findFirst({ where: { id: categoryId, tenantId } });
  if (!existing) throw AppError.notFound('Category not found', 'CATEGORY_NOT_FOUND');

  if (input.parentId) {
    if (input.parentId === categoryId) {
      throw AppError.badRequest('Category cannot be its own parent');
    }
    const parent = await prisma.category.findFirst({ where: { id: input.parentId, tenantId } });
    if (!parent) throw AppError.notFound('Parent category not found', 'CATEGORY_NOT_FOUND');
  }

  const updated = await prisma.category.update({
    where: { id: categoryId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId: actor.employeeId,
    action: 'category.updated',
    module: 'products',
    recordType: 'Category',
    recordId: categoryId,
    oldValues: { name: existing.name, description: existing.description, status: existing.status },
    newValues: input,
    ipAddress: actor.ipAddress,
  });

  return updated;
}

export async function deleteCategory(
  tenantId: string,
  categoryId: string,
  actor: ActorInfo,
) {
  const existing = await prisma.category.findFirst({
    where: { id: categoryId, tenantId },
    include: {
      _count: { select: { products: true, children: true } },
    },
  });
  if (!existing) throw AppError.notFound('Category not found', 'CATEGORY_NOT_FOUND');

  // If there are products or child categories linked to it, archive to INACTIVE safely
  if (((existing as any)._count?.products ?? 0) > 0 || ((existing as any)._count?.children ?? 0) > 0) {
    const archived = await prisma.category.update({
      where: { id: categoryId },
      data: { status: 'INACTIVE' },
    });
    await recordActivity({
      tenantId,
      userId: actor.userId,
      employeeId: actor.employeeId,
      action: 'category.archived',
      module: 'products',
      recordType: 'Category',
      recordId: categoryId,
      oldValues: { status: existing.status },
      newValues: { status: 'INACTIVE' },
      ipAddress: actor.ipAddress,
    });
    return archived;
  }

  const deleted = await prisma.category.delete({
    where: { id: categoryId },
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId: actor.employeeId,
    action: 'category.deleted',
    module: 'products',
    recordType: 'Category',
    recordId: categoryId,
    oldValues: { name: existing.name },
    ipAddress: actor.ipAddress,
  });

  return deleted;
}

// ============================================================================
// Units
// ============================================================================

export async function listUnits(tenantId: string) {
  return prisma.unit.findMany({
    where: { tenantId },
    include: { _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function createUnit(tenantId: string, actor: ActorInfo, input: CreateUnitInput) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.create({
      data: {
        tenantId,
        name: input.name,
        abbreviation: input.abbreviation,
        status: 'ACTIVE',
      },
    });
    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'unit.created',
        module: 'products',
        recordType: 'Unit',
        recordId: unit.id,
        newValues: { name: unit.name, abbreviation: unit.abbreviation },
        ipAddress: actor.ipAddress,
      },
      tx,
    );
    return unit;
  });
}

export async function updateUnit(
  tenantId: string,
  unitId: string,
  actor: ActorInfo,
  input: UpdateUnitInput,
) {
  const existing = await prisma.unit.findFirst({ where: { id: unitId, tenantId } });
  if (!existing) throw AppError.notFound('Unit not found', 'UNIT_NOT_FOUND');

  const updated = await prisma.unit.update({
    where: { id: unitId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.abbreviation !== undefined ? { abbreviation: input.abbreviation } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId: actor.employeeId,
    action: 'unit.updated',
    module: 'products',
    recordType: 'Unit',
    recordId: unitId,
    oldValues: { name: existing.name, abbreviation: existing.abbreviation, status: existing.status },
    newValues: input,
    ipAddress: actor.ipAddress,
  });

  return updated;
}

// ============================================================================
// Suppliers
// ============================================================================

export async function listSuppliers(tenantId: string, search?: string) {
  return prisma.supplier.findMany({
    where: {
      tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { contactPerson: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { purchases: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function createSupplier(
  tenantId: string,
  actor: ActorInfo,
  input: CreateSupplierInput,
) {
  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
      data: {
        tenantId,
        name: input.name,
        contactPerson: input.contactPerson ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        status: 'ACTIVE',
      },
    });
    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'supplier.created',
        module: 'suppliers',
        recordType: 'Supplier',
        recordId: supplier.id,
        newValues: { name: supplier.name },
        ipAddress: actor.ipAddress,
      },
      tx,
    );
    return supplier;
  });
}

export async function updateSupplier(
  tenantId: string,
  supplierId: string,
  actor: ActorInfo,
  input: UpdateSupplierInput,
) {
  const existing = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
  if (!existing) throw AppError.notFound('Supplier not found', 'SUPPLIER_NOT_FOUND');

  const updated = await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId: actor.employeeId,
    action: 'supplier.updated',
    module: 'suppliers',
    recordType: 'Supplier',
    recordId: supplierId,
    oldValues: { name: existing.name, phone: existing.phone, status: existing.status },
    newValues: input,
    ipAddress: actor.ipAddress,
  });

  return updated;
}

// ============================================================================
// Products
// ============================================================================

export async function listProducts(
  tenantId: string,
  filters: { search?: string; categoryId?: string; status?: string; branchId?: string },
) {
  const products = await prisma.product.findMany({
    where: {
      tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { sku: { contains: filters.search, mode: 'insensitive' } },
              { barcode: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      category: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true, abbreviation: true } },
      stockBalances: filters.branchId
        ? { where: { branchId: filters.branchId }, select: { quantity: true, branchId: true } }
        : { select: { quantity: true, branchId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return products.map((p) => {
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

  return prisma.$transaction(async (tx) => {
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

  return prisma.$transaction(async (tx) => {
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
}

export async function archiveProduct(tenantId: string, productId: string, actor: ActorInfo) {
  return updateProduct(tenantId, productId, actor, { status: 'ARCHIVED' });
}

