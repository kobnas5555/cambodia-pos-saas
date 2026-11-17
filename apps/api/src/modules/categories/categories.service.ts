import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

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

