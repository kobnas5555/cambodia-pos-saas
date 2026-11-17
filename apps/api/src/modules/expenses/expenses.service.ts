import {
  type CreateExpenseInput,
  type ListExpensesQueryInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { getTenantDefaultExchangeRate, resolveActorEmployeeId } from '../../common/utils/actor';
import { generateDocumentNumber, getTenantDocumentPrefix } from '../../common/utils/numbering';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export interface ExpenseListFilters {
  branchId?: string;
  expenseTypeId?: string;
  paymentMethod?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

function buildDateFilter(dateFrom?: string, dateTo?: string): { gte?: Date; lte?: Date } | undefined {
  const filter: { gte?: Date; lte?: Date } = {};
  if (dateFrom) {
    const start = dateFrom.length === 10 ? new Date(`${dateFrom}T00:00:00.000Z`) : new Date(dateFrom);
    if (Number.isNaN(start.getTime())) throw AppError.badRequest('Invalid dateFrom parameter', 'INVALID_DATE');
    filter.gte = start;
  }
  if (dateTo) {
    const end = dateTo.length === 10 ? new Date(`${dateTo}T23:59:59.999Z`) : new Date(dateTo);
    if (Number.isNaN(end.getTime())) throw AppError.badRequest('Invalid dateTo parameter', 'INVALID_DATE');
    filter.lte = end;
  }
  return filter.gte || filter.lte ? filter : undefined;
}

export async function listExpenses(
  tenantId: string,
  filters: ExpenseListFilters & Partial<ListExpensesQueryInput> = {},
) {
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);
  const where: any = {
    tenantId,
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(filters.expenseTypeId ? { expenseTypeId: filters.expenseTypeId } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    ...(dateRange ? { expenseDate: dateRange } : {}),
    ...(filters.search
      ? {
          OR: [
            { expenseNumber: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
            { expenseType: { name: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const hasPagination = filters.page !== undefined || filters.limit !== undefined;
  const page = filters.page ? Math.max(1, Number(filters.page)) : 1;
  const limit = filters.limit ? Math.min(100, Math.max(1, Number(filters.limit))) : 150;
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : 150;

  const [items, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, branchCode: true } },
        expenseType: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true, employeeCode: true } },
      },
      orderBy: { expenseDate: 'desc' },
      ...(skip !== undefined ? { skip } : {}),
      ...(take !== undefined ? { take } : {}),
    }),
    prisma.expense.count({ where }),
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

export async function getExpenseById(tenantId: string, expenseId: string) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, tenantId },
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      expenseType: { select: { id: true, name: true } },
      employee: { select: { id: true, name: true, employeeCode: true } },
    },
  });
  if (!expense) throw AppError.notFound('Expense not found', 'EXPENSE_NOT_FOUND');
  return expense;
}

export async function createExpense(
  tenantId: string,
  actor: ActorInfo,
  input: CreateExpenseInput,
) {
  return prisma.$transaction(async (tx) => {
    const [branch, expenseType] = await Promise.all([
      tx.branch.findFirst({ where: { id: input.branchId, tenantId, status: 'ACTIVE' } }),
      tx.expenseType.findFirst({ where: { id: input.expenseTypeId, tenantId } }),
    ]);

    if (!branch) throw AppError.notFound('Active branch not found', 'BRANCH_NOT_FOUND');
    if (!expenseType) throw AppError.notFound('Expense type not found', 'EXPENSE_TYPE_NOT_FOUND');
    if (expenseType.status !== 'ACTIVE') {
      throw AppError.badRequest('Selected expense type is inactive', 'EXPENSE_TYPE_INACTIVE');
    }

    const employeeId = await resolveActorEmployeeId(tx, tenantId, actor.userId, actor.employeeId);
    const defaultRate = await getTenantDefaultExchangeRate(tx, tenantId);
    const exchangeRate = input.exchangeRate ?? defaultRate;
    const count = await tx.expense.count({ where: { tenantId, branchId: branch.id } });
    const expensePrefix = await getTenantDocumentPrefix(tx, tenantId, 'expensePrefix', 'EXP');
    const expenseNumber = generateDocumentNumber(expensePrefix, count);

    const expense = await tx.expense.create({
      data: {
        tenantId,
        branchId: branch.id,
        expenseTypeId: expenseType.id,
        employeeId,
        expenseNumber,
        description: input.description ?? null,
        amount: input.amount,
        currencyCode: input.currencyCode,
        exchangeRate,
        paymentMethod: input.paymentMethod,
        expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
      },
      include: {
        branch: { select: { id: true, name: true } },
        expenseType: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
      },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId,
        action: 'expense.created',
        module: 'finance',
        recordType: 'Expense',
        recordId: expense.id,
        newValues: { expenseNumber, amount: input.amount, currencyCode: input.currencyCode },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return expense;
  });
}

