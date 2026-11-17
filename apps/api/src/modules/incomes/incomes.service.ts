import {
  type CreateIncomeInput,
  type ListIncomesQueryInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { getTenantDefaultExchangeRate, resolveActorEmployeeId } from '../../common/utils/actor';
import { generateDocumentNumber, getTenantDocumentPrefix } from '../../common/utils/numbering';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export interface IncomeListFilters {
  branchId?: string;
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

export async function listIncomes(
  tenantId: string,
  filters: IncomeListFilters & Partial<ListIncomesQueryInput> = {},
) {
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);
  const where: any = {
    tenantId,
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(dateRange ? { incomeDate: dateRange } : {}),
    ...(filters.search
      ? {
          OR: [
            { incomeNumber: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
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
    prisma.income.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, branchCode: true } },
        employee: { select: { id: true, name: true, employeeCode: true } },
      },
      orderBy: { incomeDate: 'desc' },
      ...(skip !== undefined ? { skip } : {}),
      ...(take !== undefined ? { take } : {}),
    }),
    prisma.income.count({ where }),
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

export async function getIncomeById(tenantId: string, incomeId: string) {
  const income = await prisma.income.findFirst({
    where: { id: incomeId, tenantId },
    include: {
      branch: { select: { id: true, name: true, branchCode: true } },
      employee: { select: { id: true, name: true, employeeCode: true } },
    },
  });
  if (!income) throw AppError.notFound('Income record not found', 'INCOME_NOT_FOUND');
  return income;
}

export async function createIncome(
  tenantId: string,
  actor: ActorInfo,
  input: CreateIncomeInput,
) {
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, tenantId, status: 'ACTIVE' },
    });
    if (!branch) throw AppError.notFound('Active branch not found', 'BRANCH_NOT_FOUND');

    const employeeId = await resolveActorEmployeeId(tx, tenantId, actor.userId, actor.employeeId);
    const defaultRate = await getTenantDefaultExchangeRate(tx, tenantId);
    const exchangeRate = input.exchangeRate ?? defaultRate;
    const count = await tx.income.count({ where: { tenantId, branchId: branch.id } });
    const incomePrefix = await getTenantDocumentPrefix(tx, tenantId, 'incomePrefix', 'INC');
    const incomeNumber = generateDocumentNumber(incomePrefix, count);

    const income = await tx.income.create({
      data: {
        tenantId,
        branchId: branch.id,
        employeeId,
        incomeNumber,
        description: input.description,
        amount: input.amount,
        currencyCode: input.currencyCode,
        exchangeRate,
        incomeDate: input.incomeDate ? new Date(input.incomeDate) : new Date(),
      },
      include: {
        branch: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
      },
    });

    await recordActivity(
      {
        tenantId,
        userId: actor.userId,
        employeeId,
        action: 'income.created',
        module: 'finance',
        recordType: 'Income',
        recordId: income.id,
        newValues: { incomeNumber, amount: input.amount, currencyCode: input.currencyCode },
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return income;
  });
}

