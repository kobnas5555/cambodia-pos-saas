import type {
  CreateSupplierInput,
  UpdateSupplierInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listSuppliers(
  tenantId: string,
  options?:
    | string
    | {
        search?: string;
        status?: string;
        page?: number;
        limit?: number;
      },
) {
  const search = typeof options === 'string' ? options : options?.search;
  const status = typeof options === 'object' ? options?.status : undefined;
  const page = typeof options === 'object' && options?.page ? Math.max(1, Number(options.page)) : 1;
  const limit = typeof options === 'object' && options?.limit ? Math.max(1, Number(options.limit)) : 100;
  const skip = (page - 1) * limit;

  const where = {
    tenantId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { contactPerson: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(status && status !== 'ALL' ? { status } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      include: { _count: { select: { purchases: true } } },
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

export async function deleteSupplier(
  tenantId: string,
  supplierId: string,
  actor: ActorInfo,
) {
  const existing = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId },
    include: { _count: { select: { purchases: true } } },
  });
  if (!existing) throw AppError.notFound('Supplier not found', 'SUPPLIER_NOT_FOUND');

  if (((existing as any)._count?.purchases ?? 0) > 0) {
    const archived = await prisma.supplier.update({
      where: { id: supplierId },
      data: { status: 'INACTIVE' },
    });
    await recordActivity({
      tenantId,
      userId: actor.userId,
      employeeId: actor.employeeId,
      action: 'supplier.archived',
      module: 'suppliers',
      recordType: 'Supplier',
      recordId: supplierId,
      oldValues: { status: existing.status },
      newValues: { status: 'INACTIVE' },
      ipAddress: actor.ipAddress,
    });
    return archived;
  }

  const deleted = await prisma.supplier.delete({
    where: { id: supplierId },
  });

  await recordActivity({
    tenantId,
    userId: actor.userId,
    employeeId: actor.employeeId,
    action: 'supplier.deleted',
    module: 'suppliers',
    recordType: 'Supplier',
    recordId: supplierId,
    oldValues: { name: existing.name },
    ipAddress: actor.ipAddress,
  });

  return deleted;
}

