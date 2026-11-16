import {
  addDecimals,
  compareDecimals,
  convertCurrency,
  mulDecimals,
  subDecimals,
  type CurrencyCode,
} from '@cambodia-pos/shared';
import { AppError } from '../../common/errors/AppError';
import { getTenantDefaultExchangeRate } from '../../common/utils/actor';
import { prisma } from '../../db/prisma';

export interface ReportFilters {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  status?: string;
  expenseTypeId?: string;
  paymentMethod?: string;
  employeeId?: string;
  lowStockOnly?: boolean;
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

export async function getDashboardOverview(tenantId: string, branchId?: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      exchangeRates: {
        orderBy: { effectiveAt: 'desc' },
        take: 1,
      },
    },
  });
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const exchangeRate = tenant?.exchangeRates?.[0]?.rate?.toString() ?? '4100';

  const [orders, expenses, incomes, returns, balances] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
      include: {
        orderItems: true,
        payments: true,
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.expense.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
    }),
    prisma.income.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
    }),
    prisma.saleReturn.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
      include: { order: { select: { currencyCode: true, exchangeRate: true } } },
    }),
    prisma.stockBalance.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
      include: {
        product: { select: { id: true, name: true, sku: true, lowStockAlert: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
  ]);

  let grossSales = '0.00';
  let totalCostOfGoods = '0.00';
  const dailyMap = new Map<string, { amount: string; orders: number }>();

  // Pre-seed past 14 days with zero values
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStr = d.toISOString().slice(0, 10);
    dailyMap.set(dayStr, { amount: '0.00', orders: 0 });
  }

  for (const order of orders) {
    if (order.status === 'CANCELLED' || order.status === 'VOIDED') {
      continue;
    }
    const rate = order.exchangeRate.toString();
    const cur = order.currencyCode as CurrencyCode;
    const rev = convertCurrency(order.totalAmount.toString(), cur, baseCurrency, rate);
    grossSales = addDecimals(grossSales, rev, 2);

    const day = new Date(order.createdAt).toISOString().slice(0, 10);
    const current = dailyMap.get(day) ?? { amount: '0.00', orders: 0 };
    dailyMap.set(day, {
      amount: addDecimals(current.amount, rev, 2),
      orders: current.orders + 1,
    });

    for (const item of order.orderItems) {
      const lineCost = mulDecimals(item.quantity.toString(), item.unitCostSnapshot.toString(), 4, 2, 2);
      const costConverted = convertCurrency(lineCost, cur, baseCurrency, rate);
      totalCostOfGoods = addDecimals(totalCostOfGoods, costConverted, 2);
    }
  }

  let totalRefunds = '0.00';
  for (const ret of returns) {
    totalRefunds = addDecimals(
      totalRefunds,
      convertCurrency(
        ret.refundAmount.toString(),
        ret.order.currencyCode as CurrencyCode,
        baseCurrency,
        ret.order.exchangeRate.toString(),
      ),
      2,
    );
  }

  let totalExpenses = '0.00';
  for (const exp of expenses) {
    totalExpenses = addDecimals(
      totalExpenses,
      convertCurrency(
        exp.amount.toString(),
        exp.currencyCode as CurrencyCode,
        baseCurrency,
        exp.exchangeRate.toString(),
      ),
      2,
    );
  }

  let additionalIncome = '0.00';
  for (const inc of incomes) {
    additionalIncome = addDecimals(
      additionalIncome,
      convertCurrency(
        inc.amount.toString(),
        inc.currencyCode as CurrencyCode,
        baseCurrency,
        inc.exchangeRate.toString(),
      ),
      2,
    );
  }

  const netRevenue = subDecimals(grossSales, totalRefunds, 2);
  const grossProfit = subDecimals(netRevenue, totalCostOfGoods, 2);
  const estimatedProfit = subDecimals(addDecimals(grossProfit, additionalIncome, 2), totalExpenses, 2);

  const completedOrders = orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'VOIDED');
  const averageOrderValue =
    completedOrders.length > 0
      ? (Number(netRevenue) / completedOrders.length).toFixed(2)
      : '0.00';

  const profitMargin =
    Number(netRevenue) > 0
      ? ((Number(estimatedProfit) / Number(netRevenue)) * 100).toFixed(1)
      : '0.0';

  const lowStockItems = balances
    .filter((b) => Number(b.quantity) <= Number(b.product.lowStockAlert))
    .map((b) => ({
      productId: b.productId,
      name: b.product.name,
      sku: b.product.sku,
      branchName: b.branch.name,
      quantity: b.quantity.toString(),
      lowStockAlert: b.product.lowStockAlert.toString(),
      isCritical: Number(b.quantity) <= 0,
    }))
    .sort((a, b) => Number(a.quantity) - Number(b.quantity));

  const salesChart = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stat]) => ({
      date,
      amount: stat.amount,
      orders: stat.orders,
    }));

  return {
    currencyCode: baseCurrency,
    exchangeRate,
    totalSales: grossSales,
    revenue: netRevenue,
    grossSales,
    netRevenue,
    totalOrders: completedOrders.length,
    averageOrderValue,
    totalExpenses,
    additionalIncome,
    estimatedProfit,
    profitMargin,
    lowStockCount: lowStockItems.length,
    lowStockItems: lowStockItems.slice(0, 10),
    recentTransactions: orders.slice(0, 10).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      branchName: o.branch.name,
      customerName: o.customer?.name ?? 'Walk-in',
      customerPhone: o.customer?.phone ?? null,
      totalAmount: o.totalAmount.toString(),
      currencyCode: o.currencyCode,
      status: o.status,
      createdAt: o.createdAt,
      paymentMethod: (o as any).payments?.[0]?.paymentMethod ?? 'CASH',
      paymentMethods: Array.isArray((o as any).payments) && (o as any).payments.length > 0
        ? (o as any).payments.map((p: any) => p.paymentMethod)
        : ['CASH'],
    })),
    salesChart,
  };
}

export async function getSalesReport(tenantId: string, filters: ReportFilters = {}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);

  const [orders, payments, returns] = await Promise.all([
    prisma.order.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payment.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { order: { branchId: filters.branchId } } : {}),
        ...(dateRange ? { paidAt: dateRange } : {}),
      },
    }),
    prisma.saleReturn.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { returnedAt: dateRange } : {}),
      },
      include: { order: { select: { currencyCode: true, exchangeRate: true } } },
    }),
  ]);

  const byDay = new Map<
    string,
    { date: string; orders: number; grossTotal: string; refunds: string; total: string }
  >();
  const byMonth = new Map<
    string,
    { month: string; orders: number; grossTotal: string; refunds: string; total: string }
  >();

  let grossSales = '0.00';
  let totalDiscounts = '0.00';

  for (const o of orders) {
    const rate = o.exchangeRate.toString();
    const cur = o.currencyCode as CurrencyCode;
    const converted = convertCurrency(o.totalAmount.toString(), cur, baseCurrency, rate);
    const discConverted = convertCurrency(o.discountAmount.toString(), cur, baseCurrency, rate);
    grossSales = addDecimals(grossSales, converted, 2);
    totalDiscounts = addDecimals(totalDiscounts, discConverted, 2);

    const dayKey = o.createdAt.toISOString().slice(0, 10);
    const monthKey = o.createdAt.toISOString().slice(0, 7);

    const prevDay = byDay.get(dayKey) ?? {
      date: dayKey,
      orders: 0,
      grossTotal: '0.00',
      refunds: '0.00',
      total: '0.00',
    };
    const nextDayGross = addDecimals(prevDay.grossTotal, converted, 2);
    byDay.set(dayKey, {
      ...prevDay,
      orders: prevDay.orders + 1,
      grossTotal: nextDayGross,
      total: subDecimals(nextDayGross, prevDay.refunds, 2),
    });

    const prevMonth = byMonth.get(monthKey) ?? {
      month: monthKey,
      orders: 0,
      grossTotal: '0.00',
      refunds: '0.00',
      total: '0.00',
    };
    const nextMonthGross = addDecimals(prevMonth.grossTotal, converted, 2);
    byMonth.set(monthKey, {
      ...prevMonth,
      orders: prevMonth.orders + 1,
      grossTotal: nextMonthGross,
      total: subDecimals(nextMonthGross, prevMonth.refunds, 2),
    });
  }

  let totalRefunds = '0.00';
  for (const r of returns) {
    const converted = convertCurrency(
      r.refundAmount.toString(),
      r.order.currencyCode as CurrencyCode,
      baseCurrency,
      r.order.exchangeRate.toString(),
    );
    totalRefunds = addDecimals(totalRefunds, converted, 2);

    const dayKey = r.returnedAt.toISOString().slice(0, 10);
    const monthKey = r.returnedAt.toISOString().slice(0, 7);

    const prevDay = byDay.get(dayKey) ?? {
      date: dayKey,
      orders: 0,
      grossTotal: '0.00',
      refunds: '0.00',
      total: '0.00',
    };
    const nextDayRefunds = addDecimals(prevDay.refunds, converted, 2);
    byDay.set(dayKey, {
      ...prevDay,
      refunds: nextDayRefunds,
      total: subDecimals(prevDay.grossTotal, nextDayRefunds, 2),
    });

    const prevMonth = byMonth.get(monthKey) ?? {
      month: monthKey,
      orders: 0,
      grossTotal: '0.00',
      refunds: '0.00',
      total: '0.00',
    };
    const nextMonthRefunds = addDecimals(prevMonth.refunds, converted, 2);
    byMonth.set(monthKey, {
      ...prevMonth,
      refunds: nextMonthRefunds,
      total: subDecimals(prevMonth.grossTotal, nextMonthRefunds, 2),
    });
  }

  const byMethod = new Map<string, { method: string; count: number; total: string }>();
  for (const p of payments) {
    const converted = convertCurrency(
      p.amount.toString(),
      p.currencyCode as CurrencyCode,
      baseCurrency,
      p.exchangeRate.toString(),
    );
    const prev = byMethod.get(p.paymentMethod) ?? {
      method: p.paymentMethod,
      count: 0,
      total: '0.00',
    };
    byMethod.set(p.paymentMethod, {
      method: p.paymentMethod,
      count: prev.count + 1,
      total: addDecimals(prev.total, converted, 2),
    });
  }

  return {
    currencyCode: baseCurrency,
    summary: {
      orderCount: orders.length,
      grossSales,
      totalRefunds,
      netSales: subDecimals(grossSales, totalRefunds, 2),
      totalDiscounts,
    },
    daily: Array.from(byDay.values()).sort((a, b) => b.date.localeCompare(a.date)),
    monthly: Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month)),
    byPaymentMethod: Array.from(byMethod.values()),
  };
}

export async function getProductPerformanceReport(tenantId: string, filters: ReportFilters = {}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);

  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
    },
    include: {
      order: { select: { currencyCode: true, exchangeRate: true } },
    },
  });

  const map = new Map<
    string,
    {
      productId: string;
      name: string;
      sku: string;
      quantitySold: string;
      revenue: string;
      cost: string;
      profit: string;
      marginPct: string;
    }
  >();

  for (const item of items) {
    const cur = item.order.currencyCode as CurrencyCode;
    const rate = item.order.exchangeRate.toString();
    const rev = convertCurrency(item.lineTotal.toString(), cur, baseCurrency, rate);
    const lineCostRaw = mulDecimals(item.quantity.toString(), item.unitCostSnapshot.toString(), 4, 2, 2);
    const cost = convertCurrency(lineCostRaw, cur, baseCurrency, rate);

    const prev = map.get(item.productId) ?? {
      productId: item.productId,
      name: item.productNameSnapshot,
      sku: item.skuSnapshot,
      quantitySold: '0.0000',
      revenue: '0.00',
      cost: '0.00',
      profit: '0.00',
      marginPct: '0.0',
    };

    const nextRev = addDecimals(prev.revenue, rev, 2);
    const nextCost = addDecimals(prev.cost, cost, 2);
    const nextProfit = subDecimals(nextRev, nextCost, 2);
    const marginPct =
      Number(nextRev) > 0 ? ((Number(nextProfit) / Number(nextRev)) * 100).toFixed(1) : '0.0';

    map.set(item.productId, {
      ...prev,
      quantitySold: addDecimals(prev.quantitySold, item.quantity.toString(), 4),
      revenue: nextRev,
      cost: nextCost,
      profit: nextProfit,
      marginPct,
    });
  }

  const q = filters.search?.trim().toLowerCase();
  const products = Array.from(map.values())
    .filter((p) => (!q ? true : `${p.name} ${p.sku}`.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));

  let totalRevenue = '0.00';
  let totalCost = '0.00';
  let totalProfit = '0.00';
  for (const p of products) {
    totalRevenue = addDecimals(totalRevenue, p.revenue, 2);
    totalCost = addDecimals(totalCost, p.cost, 2);
    totalProfit = addDecimals(totalProfit, p.profit, 2);
  }

  return {
    currencyCode: baseCurrency,
    totalRevenue,
    totalCost,
    totalProfit,
    products,
  };
}

export async function getInventoryReport(tenantId: string, filters: ReportFilters = {}) {
  const [tenant, defaultRate] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    getTenantDefaultExchangeRate(prisma, tenantId),
  ]);
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;

  const balances = await prisma.stockBalance.findMany({
    where: { tenantId, ...(filters.branchId ? { branchId: filters.branchId } : {}) },
    include: {
      branch: { select: { id: true, name: true } },
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          costPrice: true,
          sellingPrice: true,
          lowStockAlert: true,
          status: true,
          trackInventory: true,
        },
      },
    },
  });

  const q = filters.search?.trim().toLowerCase();
  let totalCostValue = '0.00';
  let totalRetailValue = '0.00';
  let totalUnits = '0.0000';

  const items = balances
    .filter((b) => b.product.status === 'ACTIVE' && b.product.trackInventory)
    .map((b) => {
      const costValRaw = mulDecimals(b.quantity.toString(), b.product.costPrice.toString(), 4, 2, 2);
      const retailValRaw = mulDecimals(b.quantity.toString(), b.product.sellingPrice.toString(), 4, 2, 2);
      const costVal = convertCurrency(costValRaw, 'USD', baseCurrency, defaultRate);
      const retailVal = convertCurrency(retailValRaw, 'USD', baseCurrency, defaultRate);
      const isLowStock = Number(b.quantity) <= Number(b.product.lowStockAlert);
      return {
        productId: b.productId,
        branchName: b.branch.name,
        sku: b.product.sku,
        name: b.product.name,
        quantity: b.quantity.toString(),
        lowStockAlert: b.product.lowStockAlert.toString(),
        isLowStock,
        costValue: costVal,
        retailValue: retailVal,
      };
    })
    .filter((item) => {
      if (filters.lowStockOnly && !item.isLowStock) return false;
      if (q && !`${item.name} ${item.sku} ${item.branchName}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

  for (const item of items) {
    totalCostValue = addDecimals(totalCostValue, item.costValue, 2);
    totalRetailValue = addDecimals(totalRetailValue, item.retailValue, 2);
    totalUnits = addDecimals(totalUnits, item.quantity, 4);
  }

  return {
    currencyCode: baseCurrency,
    totalCostValue,
    totalRetailValue,
    totalUnits,
    lowStockCount: items.filter((i) => i.isLowStock).length,
    items,
  };
}

export async function getPurchaseReport(tenantId: string, filters: ReportFilters = {}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);

  const purchases = await prisma.purchase.findMany({
    where: {
      tenantId,
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(dateRange ? { purchaseDate: dateRange } : {}),
    },
    include: {
      supplier: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { purchaseDate: 'desc' },
  });

  const q = filters.search?.trim().toLowerCase();
  const rows = purchases
    .map((p) => {
      const totalStr = p.totalAmount.toString();
      const paidStr = p.paidAmount.toString();
      const balanceDue = subDecimals(totalStr, paidStr, 2);
      const paymentStatus =
        compareDecimals(paidStr, '0', 2) <= 0
          ? 'UNPAID'
          : compareDecimals(paidStr, totalStr, 2) >= 0
            ? 'PAID'
            : 'PARTIAL';
      return {
        id: p.id,
        purchaseNumber: p.purchaseNumber,
        supplierName: p.supplier.name,
        branchName: p.branch.name,
        totalAmount: totalStr,
        paidAmount: paidStr,
        balanceDue,
        currencyCode: p.currencyCode as CurrencyCode,
        exchangeRate: p.exchangeRate.toString(),
        status: p.status,
        paymentStatus,
        purchaseDate: p.purchaseDate,
      };
    })
    .filter((row) =>
      !q
        ? true
        : `${row.purchaseNumber} ${row.supplierName} ${row.branchName}`.toLowerCase().includes(q),
    );

  let totalCost = '0.00';
  let totalPaid = '0.00';
  let totalBalanceDue = '0.00';
  for (const row of rows) {
    totalCost = addDecimals(
      totalCost,
      convertCurrency(row.totalAmount, row.currencyCode, baseCurrency, row.exchangeRate),
      2,
    );
    totalPaid = addDecimals(
      totalPaid,
      convertCurrency(row.paidAmount, row.currencyCode, baseCurrency, row.exchangeRate),
      2,
    );
    totalBalanceDue = addDecimals(
      totalBalanceDue,
      convertCurrency(row.balanceDue, row.currencyCode, baseCurrency, row.exchangeRate),
      2,
    );
  }

  return {
    currencyCode: baseCurrency,
    summary: {
      count: rows.length,
      receivedCount: rows.filter((r) => r.status === 'RECEIVED').length,
      totalCost,
      totalPaid,
      totalBalanceDue,
    },
    items: rows,
  };
}

export async function getExpenseReport(tenantId: string, filters: ReportFilters = {}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);

  const expenses = await prisma.expense.findMany({
    where: {
      tenantId,
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.expenseTypeId ? { expenseTypeId: filters.expenseTypeId } : {}),
      ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
      ...(dateRange ? { expenseDate: dateRange } : {}),
    },
    include: {
      branch: { select: { id: true, name: true } },
      expenseType: { select: { id: true, name: true } },
      employee: { select: { id: true, name: true } },
    },
    orderBy: { expenseDate: 'desc' },
  });

  const q = filters.search?.trim().toLowerCase();
  const filtered = expenses.filter((ex) => {
    if (!q) return true;
    const hay = `${ex.expenseNumber} ${ex.description ?? ''} ${ex.expenseType?.name ?? ''} ${ex.branch?.name ?? ''}`.toLowerCase();
    return hay.includes(q);
  });

  let totalExpenses = '0.00';
  const byTypeMap = new Map<string, { expenseTypeId: string; name: string; count: number; total: string }>();
  const byMethodMap = new Map<string, { method: string; count: number; total: string }>();

  const rows = filtered.map((ex) => {
    const amt = ex.amount.toString();
    const cur = ex.currencyCode as CurrencyCode;
    const baseAmt = convertCurrency(amt, cur, baseCurrency, ex.exchangeRate.toString());
    totalExpenses = addDecimals(totalExpenses, baseAmt, 2);

    const typeName = ex.expenseType?.name ?? 'Other';
    const prevType = byTypeMap.get(ex.expenseTypeId) ?? {
      expenseTypeId: ex.expenseTypeId,
      name: typeName,
      count: 0,
      total: '0.00',
    };
    byTypeMap.set(ex.expenseTypeId, {
      ...prevType,
      count: prevType.count + 1,
      total: addDecimals(prevType.total, baseAmt, 2),
    });

    const prevMethod = byMethodMap.get(ex.paymentMethod) ?? {
      method: ex.paymentMethod,
      count: 0,
      total: '0.00',
    };
    byMethodMap.set(ex.paymentMethod, {
      method: ex.paymentMethod,
      count: prevMethod.count + 1,
      total: addDecimals(prevMethod.total, baseAmt, 2),
    });

    return {
      id: ex.id,
      expenseNumber: ex.expenseNumber,
      branchName: ex.branch?.name ?? '—',
      expenseTypeId: ex.expenseTypeId,
      expenseTypeName: typeName,
      employeeName: ex.employee?.name ?? '—',
      description: ex.description,
      paymentMethod: ex.paymentMethod,
      amount: amt,
      currencyCode: cur,
      baseAmount: baseAmt,
      expenseDate: ex.expenseDate,
    };
  });

  return {
    currencyCode: baseCurrency,
    totalExpenses,
    expenseCount: rows.length,
    byExpenseType: Array.from(byTypeMap.values()).sort((a, b) => Number(b.total) - Number(a.total)),
    byPaymentMethod: Array.from(byMethodMap.values()).sort((a, b) => Number(b.total) - Number(a.total)),
    expenses: rows,
  };
}

export async function getIncomeReport(tenantId: string, filters: ReportFilters = {}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);

  const [orders, returns, incomes] = await Promise.all([
    prisma.order.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.saleReturn.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { returnedAt: dateRange } : {}),
      },
      include: { order: { select: { currencyCode: true, exchangeRate: true } } },
    }),
    prisma.income.findMany({
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
    }),
  ]);

  const byDateMap = new Map<
    string,
    { date: string; salesIncome: string; additionalIncome: string; total: string }
  >();

  let grossSalesRevenue = '0.00';
  for (const o of orders) {
    const baseAmt = convertCurrency(
      o.totalAmount.toString(),
      o.currencyCode as CurrencyCode,
      baseCurrency,
      o.exchangeRate.toString(),
    );
    grossSalesRevenue = addDecimals(grossSalesRevenue, baseAmt, 2);
    const day = o.createdAt.toISOString().slice(0, 10);
    const prev = byDateMap.get(day) ?? {
      date: day,
      salesIncome: '0.00',
      additionalIncome: '0.00',
      total: '0.00',
    };
    const nextSales = addDecimals(prev.salesIncome, baseAmt, 2);
    byDateMap.set(day, {
      ...prev,
      salesIncome: nextSales,
      total: addDecimals(nextSales, prev.additionalIncome, 2),
    });
  }

  let totalRefunds = '0.00';
  for (const r of returns) {
    const baseAmt = convertCurrency(
      r.refundAmount.toString(),
      r.order.currencyCode as CurrencyCode,
      baseCurrency,
      r.order.exchangeRate.toString(),
    );
    totalRefunds = addDecimals(totalRefunds, baseAmt, 2);
    const day = r.returnedAt.toISOString().slice(0, 10);
    const prev = byDateMap.get(day) ?? {
      date: day,
      salesIncome: '0.00',
      additionalIncome: '0.00',
      total: '0.00',
    };
    const nextSales = subDecimals(prev.salesIncome, baseAmt, 2);
    byDateMap.set(day, {
      ...prev,
      salesIncome: nextSales,
      total: addDecimals(nextSales, prev.additionalIncome, 2),
    });
  }

  const q = filters.search?.trim().toLowerCase();
  const filteredIncomes = incomes.filter((inc) => {
    if (!q) return true;
    const hay = `${inc.incomeNumber} ${inc.description ?? ''} ${inc.branch?.name ?? ''}`.toLowerCase();
    return hay.includes(q);
  });

  let additionalIncome = '0.00';
  const incomeRows = filteredIncomes.map((inc) => {
    const amt = inc.amount.toString();
    const cur = inc.currencyCode as CurrencyCode;
    const baseAmt = convertCurrency(amt, cur, baseCurrency, inc.exchangeRate.toString());
    additionalIncome = addDecimals(additionalIncome, baseAmt, 2);

    const day = inc.incomeDate.toISOString().slice(0, 10);
    const prev = byDateMap.get(day) ?? {
      date: day,
      salesIncome: '0.00',
      additionalIncome: '0.00',
      total: '0.00',
    };
    const nextAdd = addDecimals(prev.additionalIncome, baseAmt, 2);
    byDateMap.set(day, {
      ...prev,
      additionalIncome: nextAdd,
      total: addDecimals(prev.salesIncome, nextAdd, 2),
    });

    return {
      id: inc.id,
      incomeNumber: inc.incomeNumber,
      branchName: inc.branch?.name ?? '—',
      employeeName: inc.employee?.name ?? '—',
      description: inc.description,
      amount: amt,
      currencyCode: cur,
      baseAmount: baseAmt,
      incomeDate: inc.incomeDate,
    };
  });

  const netSalesRevenue = subDecimals(grossSalesRevenue, totalRefunds, 2);
  const totalIncome = addDecimals(netSalesRevenue, additionalIncome, 2);

  return {
    currencyCode: baseCurrency,
    grossSalesRevenue,
    totalRefunds,
    netSalesRevenue,
    additionalIncome,
    totalIncome,
    additionalIncomeCount: incomeRows.length,
    byDate: Array.from(byDateMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
    incomes: incomeRows,
  };
}

export async function getProfitEstimationReport(tenantId: string, filters: ReportFilters = {}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);

  const [orders, returns, incomes, expenses] = await Promise.all([
    prisma.order.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.saleReturn.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { returnedAt: dateRange } : {}),
      },
      include: { order: { select: { currencyCode: true, exchangeRate: true } } },
    }),
    prisma.income.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { incomeDate: dateRange } : {}),
      },
    }),
    prisma.expense.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(dateRange ? { expenseDate: dateRange } : {}),
      },
    }),
  ]);

  const dailyMap = new Map<
    string,
    {
      date: string;
      netSales: string;
      cogs: string;
      additionalIncome: string;
      expenses: string;
      estimatedProfit: string;
    }
  >();

  const ensureDay = (date: string) =>
    dailyMap.get(date) ?? {
      date,
      netSales: '0.00',
      cogs: '0.00',
      additionalIncome: '0.00',
      expenses: '0.00',
      estimatedProfit: '0.00',
    };

  let grossSales = '0.00';
  let costOfGoodsSold = '0.00';

  for (const o of orders) {
    const rate = o.exchangeRate.toString();
    const cur = o.currencyCode as CurrencyCode;
    const rev = convertCurrency(o.totalAmount.toString(), cur, baseCurrency, rate);
    grossSales = addDecimals(grossSales, rev, 2);

    let orderCost = '0.00';
    for (const item of o.orderItems) {
      const lineCost = mulDecimals(item.quantity.toString(), item.unitCostSnapshot.toString(), 4, 2, 2);
      orderCost = addDecimals(orderCost, convertCurrency(lineCost, cur, baseCurrency, rate), 2);
    }
    costOfGoodsSold = addDecimals(costOfGoodsSold, orderCost, 2);

    const day = o.createdAt.toISOString().slice(0, 10);
    const prev = ensureDay(day);
    dailyMap.set(day, {
      ...prev,
      netSales: addDecimals(prev.netSales, rev, 2),
      cogs: addDecimals(prev.cogs, orderCost, 2),
    });
  }

  let totalRefunds = '0.00';
  for (const r of returns) {
    const refAmt = convertCurrency(
      r.refundAmount.toString(),
      r.order.currencyCode as CurrencyCode,
      baseCurrency,
      r.order.exchangeRate.toString(),
    );
    totalRefunds = addDecimals(totalRefunds, refAmt, 2);

    const day = r.returnedAt.toISOString().slice(0, 10);
    const prev = ensureDay(day);
    dailyMap.set(day, {
      ...prev,
      netSales: subDecimals(prev.netSales, refAmt, 2),
    });
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

    const day = inc.incomeDate.toISOString().slice(0, 10);
    const prev = ensureDay(day);
    dailyMap.set(day, {
      ...prev,
      additionalIncome: addDecimals(prev.additionalIncome, amt, 2),
    });
  }

  let totalExpenses = '0.00';
  for (const exp of expenses) {
    const amt = convertCurrency(
      exp.amount.toString(),
      exp.currencyCode as CurrencyCode,
      baseCurrency,
      exp.exchangeRate.toString(),
    );
    totalExpenses = addDecimals(totalExpenses, amt, 2);

    const day = exp.expenseDate.toISOString().slice(0, 10);
    const prev = ensureDay(day);
    dailyMap.set(day, {
      ...prev,
      expenses: addDecimals(prev.expenses, amt, 2),
    });
  }

  const netSalesRevenue = subDecimals(grossSales, totalRefunds, 2);
  const grossProfit = subDecimals(netSalesRevenue, costOfGoodsSold, 2);
  const estimatedNetProfit = subDecimals(
    addDecimals(grossProfit, additionalIncome, 2),
    totalExpenses,
    2,
  );
  const grossMarginPct =
    Number(netSalesRevenue) > 0
      ? ((Number(grossProfit) / Number(netSalesRevenue)) * 100).toFixed(1)
      : '0.0';
  const netMarginPct =
    Number(netSalesRevenue) > 0
      ? ((Number(estimatedNetProfit) / Number(netSalesRevenue)) * 100).toFixed(1)
      : '0.0';

  const dailyProfit = Array.from(dailyMap.values())
    .map((d) => ({
      ...d,
      estimatedProfit: subDecimals(
        addDecimals(subDecimals(d.netSales, d.cogs, 2), d.additionalIncome, 2),
        d.expenses,
        2,
      ),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    currencyCode: baseCurrency,
    grossSales,
    totalRefunds,
    netSalesRevenue,
    costOfGoodsSold,
    grossProfit,
    grossMarginPct,
    additionalIncome,
    totalExpenses,
    estimatedNetProfit,
    netMarginPct,
    dailyProfit,
  };
}

export async function getCashierShiftReport(tenantId: string, filters: ReportFilters = {}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);

  const [shifts, orders] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(dateRange ? { openedAt: dateRange } : {}),
      },
      include: {
        branch: { select: { id: true, name: true, branchCode: true } },
        employee: { select: { id: true, name: true, employeeCode: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: 200,
    }),
    prisma.order.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
      },
      select: {
        id: true,
        shiftId: true,
        totalAmount: true,
        currencyCode: true,
        exchangeRate: true,
      },
    }),
  ]);

  const salesByShift = new Map<string, { count: number; total: string }>();
  for (const o of orders) {
    if (!o.shiftId) continue;
    const rev = convertCurrency(
      o.totalAmount.toString(),
      o.currencyCode as CurrencyCode,
      baseCurrency,
      o.exchangeRate.toString(),
    );
    const prev = salesByShift.get(o.shiftId) ?? { count: 0, total: '0.00' };
    salesByShift.set(o.shiftId, {
      count: prev.count + 1,
      total: addDecimals(prev.total, rev, 2),
    });
  }

  const q = filters.search?.trim().toLowerCase();
  const rows = shifts
    .map((s) => {
      const stats = salesByShift.get(s.id) ?? { count: s._count?.orders ?? 0, total: '0.00' };
      return {
        id: s.id,
        shiftNumber: s.shiftNumber,
        branchName: s.branch?.name ?? '—',
        employeeId: s.employeeId,
        employeeName: s.employee?.name ?? '—',
        employeeCode: s.employee?.employeeCode ?? '—',
        status: s.status,
        orderCount: stats.count,
        salesTotal: stats.total,
        openingCash: s.openingCash.toString(),
        expectedCash: s.expectedCash.toString(),
        actualCash: s.actualCash !== null ? s.actualCash.toString() : null,
        cashDifference: s.cashDifference !== null ? s.cashDifference.toString() : null,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
      };
    })
    .filter((row) =>
      !q
        ? true
        : `${row.shiftNumber} ${row.employeeName} ${row.employeeCode} ${row.branchName}`
            .toLowerCase()
            .includes(q),
    );

  let totalOpeningCash = '0.00';
  let totalShiftSales = '0.00';
  let totalExpectedCash = '0.00';
  let totalActualCash = '0.00';
  let totalCashDifference = '0.00';

  for (const r of rows) {
    totalOpeningCash = addDecimals(totalOpeningCash, r.openingCash, 2);
    totalShiftSales = addDecimals(totalShiftSales, r.salesTotal, 2);
    totalExpectedCash = addDecimals(totalExpectedCash, r.expectedCash, 2);
    if (r.actualCash !== null) {
      totalActualCash = addDecimals(totalActualCash, r.actualCash, 2);
    }
    if (r.cashDifference !== null) {
      totalCashDifference = addDecimals(totalCashDifference, r.cashDifference, 2);
    }
  }

  return {
    currencyCode: baseCurrency,
    summary: {
      totalShifts: rows.length,
      openShifts: rows.filter((r) => r.status === 'OPEN').length,
      closedShifts: rows.filter((r) => r.status === 'CLOSED').length,
      totalOpeningCash,
      totalShiftSales,
      totalExpectedCash,
      totalActualCash,
      totalCashDifference,
    },
    shifts: rows,
  };
}

export async function getEmployeeReport(tenantId: string, filters: ReportFilters = {}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const baseCurrency = (tenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const dateRange = buildDateFilter(filters.dateFrom, filters.dateTo);

  const [employees, orders, shifts] = await Promise.all([
    prisma.employee.findMany({
      where: {
        tenantId,
        ...(filters.employeeId ? { id: filters.employeeId } : {}),
      },
      include: {
        branchAccess: {
          include: { branch: { select: { id: true, name: true, branchCode: true } } },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.order.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.employeeId ? { cashierEmployeeId: filters.employeeId } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      select: {
        id: true,
        orderNumber: true,
        cashierEmployeeId: true,
        totalAmount: true,
        discountAmount: true,
        currencyCode: true,
        exchangeRate: true,
        status: true,
      },
    }),
    prisma.shift.findMany({
      where: {
        tenantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(dateRange ? { openedAt: dateRange } : {}),
      },
      select: {
        id: true,
        employeeId: true,
        status: true,
        openingCash: true,
        actualCash: true,
        cashDifference: true,
      },
    }),
  ]);

  const scopedEmployees = filters.branchId
    ? employees.filter((e) =>
        e.branchAccess && e.branchAccess.length > 0
          ? e.branchAccess.some((ba: any) => ba.branchId === filters.branchId)
          : true,
      )
    : employees;

  const ordersByEmp = new Map<
    string,
    { count: number; totalSales: string; totalDiscounts: string }
  >();
  for (const o of orders) {
    if (o.status === 'CANCELLED' || o.status === 'VOIDED' || !o.cashierEmployeeId) continue;
    const rev = convertCurrency(
      o.totalAmount.toString(),
      o.currencyCode as CurrencyCode,
      baseCurrency,
      o.exchangeRate.toString(),
    );
    const disc = o.discountAmount
      ? convertCurrency(
          o.discountAmount.toString(),
          o.currencyCode as CurrencyCode,
          baseCurrency,
          o.exchangeRate.toString(),
        )
      : '0.00';
    const prev = ordersByEmp.get(o.cashierEmployeeId) ?? {
      count: 0,
      totalSales: '0.00',
      totalDiscounts: '0.00',
    };
    ordersByEmp.set(o.cashierEmployeeId, {
      count: prev.count + 1,
      totalSales: addDecimals(prev.totalSales, rev, 2),
      totalDiscounts: addDecimals(prev.totalDiscounts, disc, 2),
    });
  }

  const shiftsByEmp = new Map<string, { shiftCount: number; cashDifference: string }>();
  for (const s of shifts) {
    const prev = shiftsByEmp.get(s.employeeId) ?? { shiftCount: 0, cashDifference: '0.00' };
    const diff = s.cashDifference !== null ? s.cashDifference.toString() : '0.00';
    shiftsByEmp.set(s.employeeId, {
      shiftCount: prev.shiftCount + 1,
      cashDifference: addDecimals(prev.cashDifference, diff, 2),
    });
  }

  const q = filters.search?.trim().toLowerCase();
  const rows = scopedEmployees
    .map((e) => {
      const oStats = ordersByEmp.get(e.id) ?? {
        count: 0,
        totalSales: '0.00',
        totalDiscounts: '0.00',
      };
      const sStats = shiftsByEmp.get(e.id) ?? { shiftCount: 0, cashDifference: '0.00' };
      const avgAov =
        oStats.count > 0 ? (Number(oStats.totalSales) / oStats.count).toFixed(2) : '0.00';
      const branchNames =
        e.branchAccess && e.branchAccess.length > 0
          ? e.branchAccess.map((ba: any) => ba.branch?.name).filter(Boolean)
          : ['All Branches'];

      return {
        id: e.id,
        employeeCode: e.employeeCode,
        name: e.name,
        position: e.position ?? 'Staff',
        status: e.status,
        branches: branchNames,
        orderCount: oStats.count,
        totalSales: oStats.totalSales,
        averageOrderValue: avgAov,
        totalDiscounts: oStats.totalDiscounts,
        shiftCount: sStats.shiftCount,
        cashDifference: sStats.cashDifference,
      };
    })
    .filter((row) =>
      !q
        ? true
        : `${row.name} ${row.employeeCode} ${row.position} ${row.branches.join(' ')}`
            .toLowerCase()
            .includes(q),
    );

  let totalSalesVolume = '0.00';
  let totalDiscountsGiven = '0.00';
  let totalOrdersHandled = 0;
  let topPerformer = { name: '—', sales: '0.00', orderCount: 0 };
  let maxSales = 0;

  for (const r of rows) {
    totalSalesVolume = addDecimals(totalSalesVolume, r.totalSales, 2);
    totalDiscountsGiven = addDecimals(totalDiscountsGiven, r.totalDiscounts, 2);
    totalOrdersHandled += r.orderCount;
    const sNum = Number(r.totalSales);
    if (sNum > maxSales) {
      maxSales = sNum;
      topPerformer = { name: r.name, sales: r.totalSales, orderCount: r.orderCount };
    }
  }

  return {
    currencyCode: baseCurrency,
    summary: {
      totalEmployees: rows.length,
      activeCashiers: rows.filter((r) => r.orderCount > 0).length,
      totalOrdersHandled,
      totalSalesVolume,
      totalDiscountsGiven,
      topPerformer,
    },
    employees: rows,
  };
}

// ============================================================================
// Version 2: Advanced Analytics & Financial Reports
// ============================================================================

export async function getHourlyHeatmap(
  tenantId: string,
  branchId?: string,
  dateFrom?: string,
  dateTo?: string,
) {
  const dateFilter = buildDateFilter(dateFrom, dateTo);
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      ...(branchId ? { branchId } : {}),
      ...(dateFilter ? { createdAt: dateFilter } : {}),
      status: { notIn: ['CANCELLED', 'VOIDED'] },
    },
  });

  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${String(i).padStart(2, '0')}:00`,
    orderCount: 0,
    totalSales: '0.00',
    averageOrderValue: '0.00',
  }));

  for (const o of orders) {
    const h = new Date(o.createdAt).getHours();
    hours[h].orderCount += 1;
    hours[h].totalSales = addDecimals(hours[h].totalSales, o.totalAmount.toString(), 2);
  }

  let peakHour = 12;
  let maxSales = -1;
  for (const h of hours) {
    if (h.orderCount > 0) {
      h.averageOrderValue = (Number(h.totalSales) / h.orderCount).toFixed(2);
    }
    if (Number(h.totalSales) > maxSales) {
      maxSales = Number(h.totalSales);
      peakHour = h.hour;
    }
  }

  return {
    peakHour: `${String(peakHour).padStart(2, '0')}:00`,
    totalOrders: orders.length,
    hours,
  };
}

export async function getProductAffinity(tenantId: string, branchId?: string) {
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      ...(branchId ? { branchId } : {}),
      status: { notIn: ['CANCELLED', 'VOIDED'] },
    },
    include: {
      orderItems: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
      },
    },
    take: 200,
  });

  const pairCounts: Record<string, { productA: string; productB: string; count: number }> = {};

  for (const order of orders) {
    const items = order.orderItems;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const p1 = items[i].product.name;
        const p2 = items[j].product.name;
        const key = [p1, p2].sort().join(' + ');
        if (!pairCounts[key]) {
          pairCounts[key] = { productA: p1, productB: p2, count: 0 };
        }
        pairCounts[key].count += 1;
      }
    }
  }

  const sortedPairs = Object.values(pairCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    topAffinityPairs: sortedPairs,
  };
}

export async function getCustomerRetention(tenantId: string, branchId?: string) {
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      ...(branchId ? { branchId } : {}),
      customerId: { not: null },
      status: { notIn: ['CANCELLED', 'VOIDED'] },
    },
  });

  const customerOrders: Record<string, number> = {};
  for (const o of orders) {
    if (o.customerId) {
      customerOrders[o.customerId] = (customerOrders[o.customerId] ?? 0) + 1;
    }
  }

  const totalTrackedCustomers = Object.keys(customerOrders).length;
  let repeatCustomers = 0;
  for (const count of Object.values(customerOrders)) {
    if (count > 1) repeatCustomers += 1;
  }

  const repeatCustomerRate = totalTrackedCustomers > 0
    ? ((repeatCustomers / totalTrackedCustomers) * 100).toFixed(1)
    : '0.0';

  return {
    totalTrackedCustomers,
    oneTimeCustomers: totalTrackedCustomers - repeatCustomers,
    repeatCustomers,
    repeatCustomerRate: `${repeatCustomerRate}%`,
  };
}

export async function getProfitAndLoss(
  tenantId: string,
  branchId?: string,
  dateFrom?: string,
  dateTo?: string,
) {
  const dateFilter = buildDateFilter(dateFrom, dateTo);

  const [orders, returns, expenses, incomes] = await Promise.all([
    prisma.order.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...(dateFilter ? { createdAt: dateFilter } : {}),
        status: { notIn: ['CANCELLED', 'VOIDED'] },
      },
      include: {
        orderItems: {
          include: { product: { select: { costPrice: true } } },
        },
      },
    }),
    prisma.saleReturn.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
    }),
    prisma.expense.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...(dateFilter ? { expenseDate: dateFilter } : {}),
      },
      include: { expenseType: true },
    }),
    prisma.income.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...(dateFilter ? { incomeDate: dateFilter } : {}),
      },
    }),
  ]);

  let grossRevenue = '0.00';
  let cogs = '0.00';
  for (const o of orders) {
    grossRevenue = addDecimals(grossRevenue, o.totalAmount.toString(), 2);
    for (const item of o.orderItems) {
      const itemCost = mulDecimals(
        item.product.costPrice.toString(),
        item.quantity.toString(),
        2,
      );
      cogs = addDecimals(cogs, itemCost, 2);
    }
  }

  let totalReturns = '0.00';
  for (const r of returns) {
    totalReturns = addDecimals(totalReturns, r.refundAmount.toString(), 2);
  }

  const netRevenue = subDecimals(grossRevenue, totalReturns, 2);
  const grossProfit = subDecimals(netRevenue, cogs, 2);

  const expenseBreakdown: Record<string, string> = {};
  let totalExpenses = '0.00';
  for (const e of expenses) {
    const type = e.expenseType?.name ?? 'General Expense';
    expenseBreakdown[type] = addDecimals(
      expenseBreakdown[type] ?? '0.00',
      e.amount.toString(),
      2,
    );
    totalExpenses = addDecimals(totalExpenses, e.amount.toString(), 2);
  }

  let totalAdditionalIncome = '0.00';
  for (const inc of incomes) {
    totalAdditionalIncome = addDecimals(totalAdditionalIncome, inc.amount.toString(), 2);
  }

  const operatingProfit = subDecimals(grossProfit, totalExpenses, 2);
  const netProfit = addDecimals(operatingProfit, totalAdditionalIncome, 2);

  const grossMargin = Number(netRevenue) > 0
    ? ((Number(grossProfit) / Number(netRevenue)) * 100).toFixed(1)
    : '0.0';
  const netMargin = Number(netRevenue) > 0
    ? ((Number(netProfit) / Number(netRevenue)) * 100).toFixed(1)
    : '0.0';

  return {
    grossRevenue,
    returnsAndRefunds: totalReturns,
    netRevenue,
    costOfGoodsSold: cogs,
    grossProfit,
    grossMarginPercentage: `${grossMargin}%`,
    operatingExpenses: totalExpenses,
    operatingExpensesBreakdown: expenseBreakdown,
    operatingProfit,
    additionalIncome: totalAdditionalIncome,
    netProfit,
    netMarginPercentage: `${netMargin}%`,
  };
}

export async function getBalanceSheet(tenantId: string, branchId?: string) {
  const [balances, purchases, shifts] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
      include: { product: { select: { costPrice: true } } },
    }),
    prisma.purchase.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
      },
    }),
    prisma.shift.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        status: 'OPEN',
      },
    }),
  ]);

  let inventoryAssetValuation = '0.00';
  for (const b of balances) {
    const val = mulDecimals(b.quantity.toString(), b.product.costPrice.toString(), 2);
    inventoryAssetValuation = addDecimals(inventoryAssetValuation, val, 2);
  }

  let cashInRegisters = '0.00';
  for (const s of shifts) {
    cashInRegisters = addDecimals(cashInRegisters, s.openingCash.toString(), 2);
  }

  const totalCurrentAssets = addDecimals(inventoryAssetValuation, cashInRegisters, 2);

  let accountsPayable = '0.00';
  for (const p of purchases) {
    if (Number(p.paidAmount) < Number(p.totalAmount)) {
      const unpaid = subDecimals(p.totalAmount.toString(), p.paidAmount.toString(), 2);
      accountsPayable = addDecimals(accountsPayable, unpaid, 2);
    }
  }

  const netEquity = subDecimals(totalCurrentAssets, accountsPayable, 2);

  return {
    assets: {
      cashInRegisters,
      inventoryValuation: inventoryAssetValuation,
      totalCurrentAssets,
    },
    liabilities: {
      accountsPayable,
      totalCurrentLiabilities: accountsPayable,
    },
    equity: {
      netBusinessEquity: netEquity,
    },
  };
}

export async function getTaxSummary(
  tenantId: string,
  branchId?: string,
  dateFrom?: string,
  dateTo?: string,
) {
  const dateFilter = buildDateFilter(dateFrom, dateTo);

  const [orders, purchases] = await Promise.all([
    prisma.order.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...(dateFilter ? { createdAt: dateFilter } : {}),
        status: { notIn: ['CANCELLED', 'VOIDED'] },
      },
    }),
    prisma.purchase.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...(dateFilter ? { purchaseDate: dateFilter } : {}),
      },
    }),
  ]);

  let outputVat = '0.00';
  let taxableSales = '0.00';
  for (const o of orders) {
    outputVat = addDecimals(outputVat, o.taxAmount.toString(), 2);
    taxableSales = addDecimals(taxableSales, o.subtotal.toString(), 2);
  }

  let inputVat = '0.00';
  let taxablePurchases = '0.00';
  for (const p of purchases) {
    inputVat = addDecimals(inputVat, p.taxAmount.toString(), 2);
    taxablePurchases = addDecimals(taxablePurchases, p.subtotal.toString(), 2);
  }

  const netVatPayable = subDecimals(outputVat, inputVat, 2);

  return {
    salesTax: {
      taxableSales,
      outputVat,
    },
    purchaseTax: {
      taxablePurchases,
      inputVat,
    },
    netVatLiability: netVatPayable,
  };
}

export async function exportReportData(
  tenantId: string,
  type: string,
  filters: ReportFilters,
) {
  if (type === 'sales') {
    const report = await getSalesReport(tenantId, filters);
    const rows = ['Date,Total Sales,Transactions'];
    for (const d of report.daily) {
      rows.push(`"${d.date}",${d.total},${d.orders}`);
    }
    return { mimeType: 'text/csv', filename: `sales-report-${Date.now()}.csv`, content: rows.join('\n') };
  }

  if (type === 'inventory') {
    const report = await getInventoryReport(tenantId, filters);
    const rows = ['Product,SKU,Stock,Cost Value,Retail Value'];
    for (const item of report.items) {
      rows.push(`"${item.name}","${item.sku}",${item.quantity},${item.costValue},${item.retailValue}`);
    }
    return { mimeType: 'text/csv', filename: `inventory-report-${Date.now()}.csv`, content: rows.join('\n') };
  }

  if (type === 'employees') {
    const report = await getEmployeeReport(tenantId, filters);
    const rows = [
      'Employee Code,Name,Position,Branches,Orders Handled,Total Sales,Avg Basket Size,Discounts Given,Shifts,Cash Difference',
    ];
    for (const e of report.employees) {
      rows.push(
        `"${e.employeeCode}","${e.name}","${e.position}","${e.branches.join('; ')}",${e.orderCount},${e.totalSales},${e.averageOrderValue},${e.totalDiscounts},${e.shiftCount},${e.cashDifference}`,
      );
    }
    return {
      mimeType: 'text/csv',
      filename: `employee-report-${Date.now()}.csv`,
      content: rows.join('\n'),
    };
  }

  if (type === 'pnl') {
    const pnl = await getProfitAndLoss(tenantId, filters.branchId, filters.dateFrom, filters.dateTo);
    const rows = [
      'Line Item,Amount ($)',
      `"Gross Revenue",${pnl.grossRevenue}`,
      `"Sales Returns & Refunds",${pnl.returnsAndRefunds}`,
      `"Net Sales Revenue",${pnl.netRevenue}`,
      `"Cost of Goods Sold (COGS)",${pnl.costOfGoodsSold}`,
      `"Gross Profit",${pnl.grossProfit}`,
      `"Gross Margin %",${pnl.grossMarginPercentage}`,
      `"Operating Expenses",${pnl.operatingExpenses}`,
      `"Operating Profit",${pnl.operatingProfit}`,
      `"Additional Business Income",${pnl.additionalIncome}`,
      `"Net Profit",${pnl.netProfit}`,
      `"Net Margin %",${pnl.netMarginPercentage}`,
    ];
    return { mimeType: 'text/csv', filename: `pnl-statement-${Date.now()}.csv`, content: rows.join('\n') };
  }

  throw AppError.badRequest(`Unsupported export type: ${type}`);
}
