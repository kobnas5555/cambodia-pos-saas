import {
  type CreateExpenseTypeInput,
  type ListExpenseTypesQueryInput,
  type UpdateExpenseTypeInput,
} from '@cambodia-pos/shared';
import { prisma } from '../../db/prisma';
import { AppError } from '../../common/errors/AppError';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export async function listExpenseTypes(
  tenantId: string,
  filters: Partial<ListExpenseTypesQueryInput> = {},
) {
  const where: any = {
    tenantId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const hasPagination = filters.page !== undefined || filters.limit !== undefined;
  const page = filters.page ? Math.max(1, Number(filters.page)) : 1;
  const limit = filters.limit ? Math.min(100, Math.max(1, Number(filters.limit))) : 100;
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : 100;

  const [items, total] = await Promise.all([
    prisma.expenseType.findMany({
      where,
      include: { _count: { select: { expenses: true } } },
      orderBy: { name: 'asc' },
      ...(skip !== undefined ? { skip } : {}),
      ...(take !== undefined ? { take } : {}),
    }),
    prisma.expenseType.count({ where }),
  ]);

  const totalPages = Math.ceil(total / (limit || 1)) || 1;

  return Object.assign(items, {
    items,
    total,
    page,
    limit,
    totalPages,
  });
}

export async function getExpenseTypeById(tenantId: string, expenseTypeId: string) {
  const et = await prisma.expenseType.findFirst({
    where: { id: expenseTypeId, tenantId },
    include: { _count: { select: { expenses: true } } },
  });
  if (!et) throw AppError.notFound('Expense type not found', 'EXPENSE_TYPE_NOT_FOUND');
  return et;
}

export async function createExpenseType(
  tenantId: string,
  actor: ActorInfo,
  input: CreateExpenseTypeInput,
) {
  const dup = await prisma.expenseType.findUnique({
    where: { tenantId_name: { tenantId, name: input.name } },
  });
  if (dup) throw AppError.conflict(`Expense type "${input.name}" already exists`, 'EXPENSE_TYPE_EXISTS');

  return prisma.$transaction(async (tx) => {
    const et = await tx.expenseType.create({
      data: {
        tenantId,
        name: input.name,
        description: input.description ?? null,
        status: 'ACTIVE',
      },
    });
    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'expense_type.created',
        module: 'finance',
        recordType: 'ExpenseType',
        recordId: et.id,
        newValues: { name: et.name },
        ipAddress: actor.ipAddress,
      },
      tx,
    );
    return et;
  });
}

export async function updateExpenseType(
  tenantId: string,
  actor: ActorInfo,
  expenseTypeId: string,
  input: UpdateExpenseTypeInput,
) {
  const existing = await prisma.expenseType.findFirst({ where: { id: expenseTypeId, tenantId } });
  if (!existing) throw AppError.notFound('Expense type not found', 'EXPENSE_TYPE_NOT_FOUND');

  if (input.name !== undefined && input.name !== existing.name) {
    const dup = await prisma.expenseType.findFirst({
      where: { tenantId, name: input.name, id: { not: expenseTypeId } },
    });
    if (dup) throw AppError.conflict(`Expense type "${input.name}" already exists`, 'EXPENSE_TYPE_EXISTS');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.expenseType.update({
      where: { id: expenseTypeId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId: actor.employeeId,
        action: 'expense_type.updated',
        module: 'finance',
        recordType: 'ExpenseType',
        recordId: updated.id,
        oldValues: { name: existing.name, status: existing.status },
        newValues: { name: updated.name, status: updated.status },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return updated;
  });
}

