import {
  addDecimals,
  convertCurrency,
  subDecimals,
  type CreateExpenseInput,
  type CreateExpenseTypeInput,
  type CreateIncomeInput,
  type CurrencyCode,
  type ListExpenseTypesQueryInput,
  type UpdateExpenseTypeInput,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { getTenantDefaultExchangeRate, resolveActorEmployeeId } from '../../common/utils/actor';
import { generateDocumentNumber, getTenantDocumentPrefix } from '../../common/utils/numbering';
import { prisma } from '../../db/prisma';
import { recordActivity } from '../activity-logs/activity-logs.service';
import type { ActorInfo } from '../tenants/tenants.service';

export interface FinanceListFilters {
  branchId?: string;
  expenseTypeId?: string;
  paymentMethod?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FinancialTransactionFilters {
  branchId?: string;
  direction?: 'INFLOW' | 'OUTFLOW';
  type?: string;
  paymentMethod?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
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

export async function listExpenseTypes(
  tenantId: string,
  filters: Partial<ListExpenseTypesQueryInput> | string = {},
) {
  const query = typeof filters === 'string' ? { search: filters } : filters;
  const where: any = {
    tenantId,
    ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
    ...(query.search?.trim()
      ? {
          OR: [
            { name: { contains: query.search.trim(), mode: 'insensitive' } },
            { description: { contains: query.search.trim(), mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const page = query.page ? Math.max(1, Number(query.page)) : 1;
  const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : 50;
  const skip = hasPagination ? (page - 1) * limit : undefined;
  const take = hasPagination ? limit : undefined;

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

export async function listExpenses(tenantId: string, filters: FinanceListFilters = {}) {
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);
  return prisma.expense.findMany({
    where: {
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
    },
    include: {
      branch: { select: { id: true, name: true } },
      expenseType: { select: { id: true, name: true } },
      employee: { select: { id: true, name: true } },
    },
    orderBy: { expenseDate: 'desc' },
    take: 150,
  });
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

export async function listIncomes(tenantId: string, filters: FinanceListFilters = {}) {
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);
  return prisma.income.findMany({
    where: {
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
    },
    include: {
      branch: { select: { id: true, name: true } },
      employee: { select: { id: true, name: true } },
    },
    orderBy: { incomeDate: 'desc' },
    take: 150,
  });
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

export async function listFinancialTransactions(
  tenantId: string,
  filters: FinancialTransactionFilters = {},
) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);

  const [payments, returns, incomes, expenses, purchasePayments] = await Promise.all([
    prisma.payment.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { order: { branchId: filters.branchId } } : {}),
        ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
        ...(dateRange ? { paidAt: dateRange } : {}),
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            branchId: true,
            branch: { select: { id: true, name: true } },
            cashierEmployee: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: 200,
    }),
    prisma.saleReturn.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.paymentMethod ? { refundMethod: filters.paymentMethod } : {}),
        ...(dateRange ? { returnedAt: dateRange } : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
        order: { select: { orderNumber: true, currencyCode: true, exchangeRate: true } },
      },
      orderBy: { returnedAt: 'desc' },
      take: 200,
    }),
    filters.paymentMethod
      ? Promise.resolve([])
      : prisma.income.findMany({
          where: {
            tenantId,
            ...(filters.branchId ? { branchId: filters.branchId } : {}),
            ...(dateRange ? { incomeDate: dateRange } : {}),
          },
          include: {
            branch: { select: { id: true, name: true } },
            employee: { select: { id: true, name: true } },
          },
          orderBy: { incomeDate: 'desc' },
          take: 200,
        }),
    prisma.expense.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
        ...(dateRange ? { expenseDate: dateRange } : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        expenseType: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
      },
      orderBy: { expenseDate: 'desc' },
      take: 200,
    }),
    prisma.purchasePayment.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { purchase: { branchId: filters.branchId } } : {}),
        ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
        ...(dateRange ? { paidAt: dateRange } : {}),
      },
      include: {
        purchase: {
          select: {
            id: true,
            purchaseNumber: true,
            branch: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
            employee: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: 200,
    }),
  ]);

  type LedgerRow = {
    id: string;
    transactionType: 'SALE_PAYMENT' | 'SALE_RETURN' | 'ADDITIONAL_INCOME' | 'EXPENSE' | 'PURCHASE_PAYMENT';
    direction: 'INFLOW' | 'OUTFLOW';
    referenceNumber: string;
    category: string;
    description: string;
    paymentMethod: string | null;
    amount: string;
    currencyCode: CurrencyCode;
    baseAmount: string;
    branchName: string;
    employeeName: string;
    occurredAt: Date;
  };

  const rows: LedgerRow[] = [
    ...payments.map((p) => {
      const amt = p.amount.toString();
      const cur = p.currencyCode as CurrencyCode;
      return {
        id: `pay-${p.id}`,
        transactionType: 'SALE_PAYMENT' as const,
        direction: 'INFLOW' as const,
        referenceNumber: p.order?.orderNumber ?? p.id,
        category: 'POS Sale Payment',
        description: p.referenceNumber
          ? `Order ${p.order?.orderNumber ?? ''} (Ref: ${p.referenceNumber})`.trim()
          : `Order ${p.order?.orderNumber ?? ''}`.trim(),
        paymentMethod: p.paymentMethod,
        amount: amt,
        currencyCode: cur,
        baseAmount: convertCurrency(amt, cur, baseCurrency, p.exchangeRate.toString()),
        branchName: p.order?.branch?.name ?? '—',
        employeeName: p.order?.cashierEmployee?.name ?? '—',
        occurredAt: p.paidAt,
      };
    }),
    ...returns.map((r) => {
      const amt = r.refundAmount.toString();
      const cur = r.order.currencyCode as CurrencyCode;
      return {
        id: `ret-${r.id}`,
        transactionType: 'SALE_RETURN' as const,
        direction: 'OUTFLOW' as const,
        referenceNumber: r.returnNumber,
        category: 'Customer Refund',
        description: `${r.order.orderNumber} — ${r.returnReason}`,
        paymentMethod: r.refundMethod,
        amount: amt,
        currencyCode: cur,
        baseAmount: convertCurrency(amt, cur, baseCurrency, r.order.exchangeRate.toString()),
        branchName: r.branch?.name ?? '—',
        employeeName: r.employee?.name ?? '—',
        occurredAt: r.returnedAt,
      };
    }),
    ...incomes.map((inc) => {
      const amt = inc.amount.toString();
      const cur = inc.currencyCode as CurrencyCode;
      return {
        id: `inc-${inc.id}`,
        transactionType: 'ADDITIONAL_INCOME' as const,
        direction: 'INFLOW' as const,
        referenceNumber: inc.incomeNumber,
        category: 'Additional Income',
        description: inc.description || 'Additional business income',
        paymentMethod: null,
        amount: amt,
        currencyCode: cur,
        baseAmount: convertCurrency(amt, cur, baseCurrency, inc.exchangeRate.toString()),
        branchName: inc.branch?.name ?? '—',
        employeeName: inc.employee?.name ?? '—',
        occurredAt: inc.incomeDate,
      };
    }),
    ...expenses.map((ex) => {
      const amt = ex.amount.toString();
      const cur = ex.currencyCode as CurrencyCode;
      return {
        id: `exp-${ex.id}`,
        transactionType: 'EXPENSE' as const,
        direction: 'OUTFLOW' as const,
        referenceNumber: ex.expenseNumber,
        category: ex.expenseType?.name ?? 'Expense',
        description: ex.description || ex.expenseType?.name || 'Business expense',
        paymentMethod: ex.paymentMethod,
        amount: amt,
        currencyCode: cur,
        baseAmount: convertCurrency(amt, cur, baseCurrency, ex.exchangeRate.toString()),
        branchName: ex.branch?.name ?? '—',
        employeeName: ex.employee?.name ?? '—',
        occurredAt: ex.expenseDate,
      };
    }),
    ...purchasePayments.map((pp) => {
      const amt = pp.amount.toString();
      const cur = pp.currencyCode as CurrencyCode;
      const poNumber = pp.purchase?.purchaseNumber ?? 'Purchase';
      const supplierName = pp.purchase?.supplier?.name ?? 'Supplier';
      return {
        id: `pp-${pp.id}`,
        transactionType: 'PURCHASE_PAYMENT' as const,
        direction: 'OUTFLOW' as const,
        referenceNumber: pp.referenceNumber || poNumber,
        category: 'Supplier Payment',
        description: `${poNumber} — ${supplierName}`,
        paymentMethod: pp.paymentMethod,
        amount: amt,
        currencyCode: cur,
        baseAmount: convertCurrency(amt, cur, baseCurrency, pp.exchangeRate.toString()),
        branchName: pp.purchase?.branch?.name ?? '—',
        employeeName: pp.purchase?.employee?.name ?? '—',
        occurredAt: pp.paidAt,
      };
    }),
  ];

  const q = filters.search?.trim().toLowerCase();
  const filtered = rows
    .filter((row) => {
      if (filters.direction && row.direction !== filters.direction) return false;
      if (filters.type && row.transactionType !== filters.type) return false;
      if (q) {
        const hay = `${row.referenceNumber} ${row.category} ${row.description} ${row.branchName} ${row.employeeName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  let totalInflow = '0.00';
  let totalOutflow = '0.00';
  for (const r of filtered) {
    if (r.direction === 'INFLOW') {
      totalInflow = addDecimals(totalInflow, r.baseAmount, 2);
    } else {
      totalOutflow = addDecimals(totalOutflow, r.baseAmount, 2);
    }
  }

  return {
    currencyCode: baseCurrency,
    totalInflow,
    totalOutflow,
    netAmount: subDecimals(totalInflow, totalOutflow, 2),
    transactions: filtered.slice(0, 200),
  };
}

export async function getFinanceSummary(
  tenantId: string,
  filters: { branchId?: string; dateFrom?: string; dateTo?: string } = {},
) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);

  const [orders, expenses, incomes, returns, purchasePayments] = await Promise.all([
    prisma.order.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      select: { totalAmount: true, currencyCode: true, exchangeRate: true },
    }),
    prisma.expense.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { expenseDate: dateRange } : {}),
      },
      include: {
        expenseType: { select: { id: true, name: true } },
      },
    }),
    prisma.income.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { incomeDate: dateRange } : {}),
      },
      select: { amount: true, currencyCode: true, exchangeRate: true },
    }),
    prisma.saleReturn.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { returnedAt: dateRange } : {}),
      },
      include: {
        order: { select: { currencyCode: true, exchangeRate: true } },
      },
    }),
    prisma.purchasePayment.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { purchase: { branchId: filters.branchId } } : {}),
        ...(dateRange ? { paidAt: dateRange } : {}),
      },
      select: { amount: true, currencyCode: true, exchangeRate: true },
    }),
  ]);

  let grossSales = '0.00';
  for (const o of orders) {
    const amt = convertCurrency(
      o.totalAmount.toString(),
      o.currencyCode as CurrencyCode,
      baseCurrency,
      o.exchangeRate.toString(),
    );
    grossSales = addDecimals(grossSales, amt, 2);
  }

  let totalRefunds = '0.00';
  for (const r of returns) {
    const amt = convertCurrency(
      r.refundAmount.toString(),
      r.order.currencyCode as CurrencyCode,
      baseCurrency,
      r.order.exchangeRate.toString(),
    );
    totalRefunds = addDecimals(totalRefunds, amt, 2);
  }

  let additionalIncome = '0.00';
  for (const inc of incomes) {
    const amt = convertCurrency(
      inc.amount.toString(),
      inc.currencyCode as CurrencyCode,
      baseCurrency,
      inc.exchangeRate.toString(),
    );
    additionalIncome = addDecimals(additionalIncome, amt, 2);
  }

  let totalExpenses = '0.00';
  const breakdownMap = new Map<string, { expenseTypeId: string; expenseTypeName: string; count: number; total: string }>();
  for (const exp of expenses) {
    const amt = convertCurrency(
      exp.amount.toString(),
      exp.currencyCode as CurrencyCode,
      baseCurrency,
      exp.exchangeRate.toString(),
    );
    totalExpenses = addDecimals(totalExpenses, amt, 2);
    const typeId = exp.expenseTypeId;
    const typeName = exp.expenseType?.name ?? 'Other';
    const prev = breakdownMap.get(typeId) ?? {
      expenseTypeId: typeId,
      expenseTypeName: typeName,
      count: 0,
      total: '0.00',
    };
    breakdownMap.set(typeId, {
      ...prev,
      count: prev.count + 1,
      total: addDecimals(prev.total, amt, 2),
    });
  }

  let totalPurchasePayments = '0.00';
  for (const pp of purchasePayments) {
    const amt = convertCurrency(
      pp.amount.toString(),
      pp.currencyCode as CurrencyCode,
      baseCurrency,
      pp.exchangeRate.toString(),
    );
    totalPurchasePayments = addDecimals(totalPurchasePayments, amt, 2);
  }

  const netSales = subDecimals(grossSales, totalRefunds, 2);
  const totalInflow = addDecimals(netSales, additionalIncome, 2);
  const netCashflow = subDecimals(totalInflow, totalExpenses, 2);
  const totalOutflow = addDecimals(
    addDecimals(totalExpenses, totalPurchasePayments, 2),
    totalRefunds,
    2,
  );
  const netPositionIncludingPurchases = subDecimals(netCashflow, totalPurchasePayments, 2);

  const expenseBreakdown = Array.from(breakdownMap.values()).sort(
    (a, b) => Number(b.total) - Number(a.total),
  );

  return {
    currencyCode: baseCurrency,
    grossSales,
    salesRevenue: netSales,
    totalRefunds,
    additionalIncome,
    totalExpenses,
    purchasePayments: totalPurchasePayments,
    totalInflow,
    totalOutflow,
    netCashflow,
    netPositionIncludingPurchases,
    expenseBreakdown,
  };
}

