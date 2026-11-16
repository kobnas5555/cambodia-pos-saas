'use client';

import { formatCurrency, type CurrencyCode } from '@cambodia-pos/shared';
import {
  Award,
  BarChart3,
  Clock,
  DollarSign,
  Package,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

const EXCHANGE_RATE = 4100;

function DualAmount({
  amount,
  currencyCode,
  className = '',
  subClassName = '',
}: {
  amount: string | number;
  currencyCode: CurrencyCode;
  className?: string;
  subClassName?: string;
}) {
  const num = typeof amount === 'number' ? amount : parseFloat(amount || '0') || 0;
  const isUsd = currencyCode === 'USD';
  const counterpart = isUsd ? num * EXCHANGE_RATE : num / EXCHANGE_RATE;
  const counterpartCur: CurrencyCode = isUsd ? 'KHR' : 'USD';
  return (
    <div className={className}>
      <div>{formatCurrency(num, currencyCode)}</div>
      <div className={`text-[10px] font-normal text-slate-400 ${subClassName}`}>
        &asymp; {formatCurrency(counterpart, counterpartCur)}
      </div>
    </div>
  );
}

interface EmployeeReport {
  currencyCode: CurrencyCode;
  summary: {
    totalEmployees: number;
    activeCashiers: number;
    totalOrdersHandled: number;
    totalSalesVolume: string;
    totalDiscountsGiven: string;
    topPerformer: { name: string; sales: string; orderCount: number };
  };
  employees: Array<{
    id: string;
    employeeCode: string;
    name: string;
    position: string;
    status: string;
    branches: string[];
    orderCount: number;
    totalSales: string;
    averageOrderValue: string;
    totalDiscounts: string;
    shiftCount: number;
    cashDifference: string;
  }>;
}

interface SalesReport {
  currencyCode: CurrencyCode;
  summary: {
    orderCount: number;
    grossSales: string;
    totalRefunds: string;
    netSales: string;
    totalDiscounts: string;
  };
  daily: Array<{ date: string; orders: number; grossTotal: string; refunds: string; total: string }>;
  monthly: Array<{
    month: string;
    orders: number;
    grossTotal: string;
    refunds: string;
    total: string;
  }>;
  byPaymentMethod: Array<{ method: string; count: number; total: string }>;
}

interface ProductReport {
  currencyCode: CurrencyCode;
  totalRevenue: string;
  totalCost: string;
  totalProfit: string;
  products: Array<{
    productId: string;
    name: string;
    sku: string;
    quantitySold: string;
    revenue: string;
    cost: string;
    profit: string;
    marginPct: string;
  }>;
}

interface InventoryReport {
  currencyCode: CurrencyCode;
  totalCostValue: string;
  totalRetailValue: string;
  totalUnits: string;
  lowStockCount: number;
  items: Array<{
    productId: string;
    branchName: string;
    sku: string;
    name: string;
    quantity: string;
    lowStockAlert: string;
    isLowStock: boolean;
    costValue: string;
    retailValue: string;
  }>;
}

interface PurchaseReport {
  currencyCode: CurrencyCode;
  summary: {
    count: number;
    receivedCount: number;
    totalCost: string;
    totalPaid: string;
    totalBalanceDue: string;
  };
  items: Array<{
    id: string;
    purchaseNumber: string;
    supplierName: string;
    branchName: string;
    totalAmount: string;
    paidAmount: string;
    balanceDue: string;
    currencyCode: CurrencyCode;
    status: string;
    paymentStatus: string;
    purchaseDate: string;
  }>;
}

interface ExpenseReport {
  currencyCode: CurrencyCode;
  totalExpenses: string;
  expenseCount: number;
  byExpenseType: Array<{ expenseTypeId: string; name: string; count: number; total: string }>;
  byPaymentMethod: Array<{ method: string; count: number; total: string }>;
  expenses: Array<{
    id: string;
    expenseNumber: string;
    branchName: string;
    expenseTypeName: string;
    employeeName: string;
    description: string | null;
    paymentMethod: string;
    amount: string;
    currencyCode: CurrencyCode;
    baseAmount: string;
    expenseDate: string;
  }>;
}

interface IncomeReport {
  currencyCode: CurrencyCode;
  grossSalesRevenue: string;
  totalRefunds: string;
  netSalesRevenue: string;
  additionalIncome: string;
  totalIncome: string;
  additionalIncomeCount: number;
  byDate: Array<{ date: string; salesIncome: string; additionalIncome: string; total: string }>;
  incomes: Array<{
    id: string;
    incomeNumber: string;
    branchName: string;
    employeeName: string;
    description: string | null;
    amount: string;
    currencyCode: CurrencyCode;
    baseAmount: string;
    incomeDate: string;
  }>;
}

interface ProfitReport {
  currencyCode: CurrencyCode;
  grossSales: string;
  totalRefunds: string;
  netSalesRevenue: string;
  costOfGoodsSold: string;
  grossProfit: string;
  grossMarginPct: string;
  additionalIncome: string;
  totalExpenses: string;
  estimatedNetProfit: string;
  netMarginPct: string;
  dailyProfit: Array<{
    date: string;
    netSales: string;
    cogs: string;
    additionalIncome: string;
    expenses: string;
    estimatedProfit: string;
  }>;
}

interface ShiftReport {
  currencyCode: CurrencyCode;
  summary: {
    totalShifts: number;
    openShifts: number;
    closedShifts: number;
    totalOpeningCash: string;
    totalShiftSales: string;
    totalExpectedCash: string;
    totalActualCash: string;
    totalCashDifference: string;
  };
  shifts: Array<{
    id: string;
    shiftNumber: string;
    branchName: string;
    employeeName: string;
    employeeCode: string;
    status: string;
    orderCount: number;
    salesTotal: string;
    openingCash: string;
    expectedCash: string;
    actualCash: string | null;
    cashDifference: string | null;
    openedAt: string;
    closedAt: string | null;
  }>;
}

type ReportTab =
  | 'sales'
  | 'products'
  | 'inventory'
  | 'purchases'
  | 'expenses'
  | 'incomes'
  | 'profit'
  | 'shifts'
  | 'employees'
  | 'analytics'
  | 'pnl'
  | 'balanceSheet'
  | 'tax';

export default function ReportsPage() {
  const { activeTenant, activeBranch } = useAuth();
  const { t } = useI18n();

  const [tab, setTab] = useState<ReportTab>('sales');
  const [branchScope, setBranchScope] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [productReport, setProductReport] = useState<ProductReport | null>(null);
  const [inventoryReport, setInventoryReport] = useState<InventoryReport | null>(null);
  const [purchaseReport, setPurchaseReport] = useState<PurchaseReport | null>(null);
  const [expenseReport, setExpenseReport] = useState<ExpenseReport | null>(null);
  const [incomeReport, setIncomeReport] = useState<IncomeReport | null>(null);
  const [profitReport, setProfitReport] = useState<ProfitReport | null>(null);
  const [shiftReport, setShiftReport] = useState<ShiftReport | null>(null);
  const [employeeReport, setEmployeeReport] = useState<EmployeeReport | null>(null);
  const [analyticsData, setAnalyticsData] = useState<{
    hourly: any;
    affinity: any;
    retention: any;
  } | null>(null);
  const [pnlData, setPnlData] = useState<any>(null);
  const [balanceSheetData, setBalanceSheetData] = useState<any>(null);
  const [taxData, setTaxData] = useState<any>(null);

  const loadAll = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const base = new URLSearchParams();
      if (branchScope === 'ACTIVE' && activeBranch) base.set('branchId', activeBranch.id);
      if (dateFrom) base.set('dateFrom', dateFrom);
      if (dateTo) base.set('dateTo', dateTo);

      const withSearch = new URLSearchParams(base);
      if (search.trim()) withSearch.set('search', search.trim());

      const invParams = new URLSearchParams(withSearch);
      if (lowStockOnly) invParams.set('lowStockOnly', 'true');

      const statusParams = new URLSearchParams(withSearch);
      if (statusFilter) statusParams.set('status', statusFilter);

      const qBase = base.toString() ? `?${base.toString()}` : '';
      const qSearch = withSearch.toString() ? `?${withSearch.toString()}` : '';
      const qInv = invParams.toString() ? `?${invParams.toString()}` : '';
      const qStatus = statusParams.toString() ? `?${statusParams.toString()}` : '';

      const [s, p, inv, pur, exp, inc, prof, shf, emp, hourly, affinity, retention, pnl, balance, tax] =
        await Promise.all([
          apiRequest<SalesReport>(`/reports/sales${qBase}`),
          apiRequest<ProductReport>(`/reports/products${qSearch}`),
          apiRequest<InventoryReport>(`/reports/inventory${qInv}`),
          apiRequest<PurchaseReport>(`/reports/purchases${qStatus}`),
          apiRequest<ExpenseReport>(`/reports/expenses${qSearch}`),
          apiRequest<IncomeReport>(`/reports/incomes${qSearch}`),
          apiRequest<ProfitReport>(`/reports/profit${qBase}`),
          apiRequest<ShiftReport>(`/reports/shifts${qStatus}`),
          apiRequest<EmployeeReport>(`/reports/employees${qSearch}`),
          apiRequest<any>(`/reports/analytics/hourly-heatmap${qBase}`).catch(() => null),
          apiRequest<any>(`/reports/analytics/product-affinity${qBase}`).catch(() => null),
          apiRequest<any>(`/reports/analytics/customer-retention${qBase}`).catch(() => null),
          apiRequest<any>(`/reports/financial/pnl${qBase}`).catch(() => null),
          apiRequest<any>(`/reports/financial/balance-sheet${qBase}`).catch(() => null),
          apiRequest<any>(`/reports/financial/tax-summary${qBase}`).catch(() => null),
        ]);
      setSalesReport(s);
      setProductReport(p);
      setInventoryReport(inv);
      setPurchaseReport(pur);
      setExpenseReport(exp);
      setIncomeReport(inc);
      setProfitReport(prof);
      setShiftReport(shf);
      setEmployeeReport(emp);
      setAnalyticsData({ hourly, affinity, retention });
      setPnlData(pnl);
      setBalanceSheetData(balance);
      setTaxData(tax);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load reports');
    } finally {
      setLoading(false);
    }
  }, [activeTenant, activeBranch, branchScope, dateFrom, dateTo, search, statusFilter, lowStockOnly]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.nav.reports}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Sales velocity, catalog margins, inventory valuation, purchasing, expenses,
              profit estimation, employee performance, and cashier shift audits.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const type =
                  tab === 'pnl'
                    ? 'pnl'
                    : tab === 'inventory'
                    ? 'inventory'
                    : tab === 'employees'
                    ? 'employees'
                    : 'sales';
                const p = new URLSearchParams();
                if (branchScope === 'ACTIVE' && activeBranch) p.set('branchId', activeBranch.id);
                if (dateFrom) p.set('dateFrom', dateFrom);
                if (dateTo) p.set('dateTo', dateTo);
                p.set('type', type);
                window.open(`/api/v1/reports/export?${p.toString()}`, '_blank');
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm transition-all"
            >
              📥 Export CSV
            </button>
            {loading && <span className="text-xs font-medium text-slate-400">Refreshing...</span>}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {(
            [
              { key: 'sales', label: 'Sales Reports', icon: BarChart3 },
              { key: 'products', label: 'Product Reports', icon: Package },
              { key: 'inventory', label: 'Inventory Reports', icon: Warehouse },
              { key: 'purchases', label: 'Purchase Reports', icon: Truck },
              { key: 'expenses', label: 'Expense Reports', icon: TrendingDown },
              { key: 'incomes', label: 'Income Reports', icon: TrendingUp },
              { key: 'profit', label: 'Profit Reports', icon: DollarSign },
              { key: 'employees', label: 'Employee Reports', icon: Users },
              { key: 'shifts', label: 'Cashier Shifts', icon: Clock },
              { key: 'analytics', label: 'Advanced Analytics', icon: BarChart3 },
              { key: 'pnl', label: 'P&L Statement', icon: DollarSign },
              { key: 'balanceSheet', label: 'Balance Sheet', icon: Warehouse },
              { key: 'tax', label: 'Tax & VAT', icon: DollarSign },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setTab(item.key);
                  setStatusFilter('');
                }}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm ${
                  tab === item.key ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700'
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </div>

        {/* Global Filters */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-600">Scope</label>
            <select
              value={branchScope}
              onChange={(e) => setBranchScope(e.target.value as 'ACTIVE' | 'ALL')}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="ACTIVE">{activeBranch ? activeBranch.name : 'Current Branch'}</option>
              <option value="ALL">All Branches</option>
            </select>
          </div>

          {tab !== 'inventory' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600">From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600">To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
            </>
          )}

          {tab !== 'sales' && tab !== 'profit' && (
            <div className="min-w-[190px] flex-1">
              <label className="block text-xs font-semibold text-slate-600">Search</label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, SKU, Doc #, Cashier..."
                  className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-sm"
                />
              </div>
            </div>
          )}

          {tab === 'purchases' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600">Order Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">All</option>
                <option value="ORDERED">ORDERED</option>
                <option value="RECEIVED">RECEIVED</option>
              </select>
            </div>
          )}

          {tab === 'shifts' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600">Shift Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">All</option>
                <option value="OPEN">OPEN</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>
          )}

          {tab === 'inventory' && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600"
              />
              Low Stock Only
            </label>
          )}

          {(dateFrom || dateTo || search || statusFilter || lowStockOnly) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setSearch('');
                setStatusFilter('');
                setLowStockOnly(false);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Reset
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 1. DAILY & MONTHLY SALES REPORT */}
        {tab === 'sales' && salesReport && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Orders</p>
                <p className="mt-1 text-xl font-bold">{salesReport.summary.orderCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Gross Sales</p>
                <p className="mt-1 text-xl font-bold">
                  {formatCurrency(salesReport.summary.grossSales, salesReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Refunds</p>
                <p className="mt-1 text-xl font-bold text-rose-700">
                  {formatCurrency(salesReport.summary.totalRefunds, salesReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Net Sales</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {formatCurrency(salesReport.summary.netSales, salesReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Order Discounts</p>
                <p className="mt-1 text-xl font-bold text-slate-700">
                  {formatCurrency(salesReport.summary.totalDiscounts, salesReport.currencyCode)}
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900">By Payment Method</h2>
                <div className="mt-3 space-y-2">
                  {salesReport.byPaymentMethod.length === 0 ? (
                    <p className="text-sm text-slate-500">No payments in period.</p>
                  ) : (
                    salesReport.byPaymentMethod.map((pm) => (
                      <div
                        key={pm.method}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="font-semibold">
                          {pm.method}{' '}
                          <span className="text-xs font-normal text-slate-500">({pm.count})</span>
                        </span>
                        <span className="font-bold text-emerald-700">
                          {formatCurrency(pm.total, salesReport.currencyCode)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                <h2 className="text-sm font-bold text-slate-900">Daily &amp; Monthly Sales</h2>
                <div className="mt-3 grid gap-6 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                      Daily Sales
                    </p>
                    <div className="space-y-1.5 text-sm">
                      {salesReport.daily.length === 0 ? (
                        <p className="text-slate-500">No daily sales data.</p>
                      ) : (
                        salesReport.daily.map((d) => (
                          <div
                            key={d.date}
                            className="flex items-center justify-between border-b border-slate-100 py-1.5"
                          >
                            <span>
                              {d.date}{' '}
                              <span className="text-xs text-slate-500">({d.orders} orders)</span>
                            </span>
                            <span className="font-semibold text-emerald-700">
                              {formatCurrency(d.total, salesReport.currencyCode)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                      Monthly Sales
                    </p>
                    <div className="space-y-1.5 text-sm">
                      {salesReport.monthly.length === 0 ? (
                        <p className="text-slate-500">No monthly sales data.</p>
                      ) : (
                        salesReport.monthly.map((m) => (
                          <div
                            key={m.month}
                            className="flex items-center justify-between border-b border-slate-100 py-1.5"
                          >
                            <span>
                              {m.month}{' '}
                              <span className="text-xs text-slate-500">({m.orders} orders)</span>
                            </span>
                            <span className="font-semibold text-emerald-700">
                              {formatCurrency(m.total, salesReport.currencyCode)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. PRODUCT PERFORMANCE REPORT */}
        {tab === 'products' && productReport && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Total Revenue</p>
                <p className="mt-1 text-xl font-bold">
                  {formatCurrency(productReport.totalRevenue, productReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Total COGS</p>
                <p className="mt-1 text-xl font-bold text-slate-700">
                  {formatCurrency(productReport.totalCost, productReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Gross Profit</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {formatCurrency(productReport.totalProfit, productReport.currencyCode)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Qty Sold</th>
                    <th className="px-4 py-3">Revenue</th>
                    <th className="px-4 py-3">COGS</th>
                    <th className="px-4 py-3">Gross Profit</th>
                    <th className="px-4 py-3">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productReport.products.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No product sales match the current filters.
                      </td>
                    </tr>
                  ) : (
                    productReport.products.map((p) => (
                      <tr key={p.productId}>
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                        <td className="px-4 py-3">{Number(p.quantitySold)}</td>
                        <td className="px-4 py-3 font-semibold">
                          {formatCurrency(p.revenue, productReport.currencyCode)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatCurrency(p.cost, productReport.currencyCode)}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-700">
                          {formatCurrency(p.profit, productReport.currencyCode)}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                          {p.marginPct}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. INVENTORY REPORT */}
        {tab === 'inventory' && inventoryReport && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Total Cost Value</p>
                <p className="mt-1 text-xl font-bold">
                  {formatCurrency(inventoryReport.totalCostValue, inventoryReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Total Retail Value</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {formatCurrency(inventoryReport.totalRetailValue, inventoryReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Total Units</p>
                <p className="mt-1 text-xl font-bold">{Number(inventoryReport.totalUnits)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Low Stock Items</p>
                <p className="mt-1 text-xl font-bold text-amber-600">
                  {inventoryReport.lowStockCount}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">On Hand</th>
                    <th className="px-4 py-3">Alert Level</th>
                    <th className="px-4 py-3">Cost Value</th>
                    <th className="px-4 py-3">Retail Value</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventoryReport.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No tracked inventory items found.
                      </td>
                    </tr>
                  ) : (
                    inventoryReport.items.map((item, idx) => (
                      <tr key={`${item.productId}-${idx}`}>
                        <td className="px-4 py-3 font-mono text-xs">{item.sku}</td>
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{item.branchName}</td>
                        <td className="px-4 py-3 font-semibold">{Number(item.quantity)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {Number(item.lowStockAlert)}
                        </td>
                        <td className="px-4 py-3">
                          {formatCurrency(item.costValue, inventoryReport.currencyCode)}
                        </td>
                        <td className="px-4 py-3 text-emerald-700">
                          {formatCurrency(item.retailValue, inventoryReport.currencyCode)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              item.isLowStock
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {item.isLowStock ? 'Low Stock' : 'Healthy'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. PURCHASE REPORT */}
        {tab === 'purchases' && purchaseReport && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Purchase Orders</p>
                <p className="mt-1 text-xl font-bold">
                  {purchaseReport.summary.count}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ({purchaseReport.summary.receivedCount} received)
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Total Cost</p>
                <p className="mt-1 text-xl font-bold">
                  {formatCurrency(purchaseReport.summary.totalCost, purchaseReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Total Paid</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {formatCurrency(purchaseReport.summary.totalPaid, purchaseReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Balance Due</p>
                <p className="mt-1 text-xl font-bold text-rose-700">
                  {formatCurrency(
                    purchaseReport.summary.totalBalanceDue,
                    purchaseReport.currencyCode,
                  )}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Purchase #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Balance Due</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchaseReport.items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                        No purchases match the current filters.
                      </td>
                    </tr>
                  ) : (
                    purchaseReport.items.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold">
                          {p.purchaseNumber}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {new Date(p.purchaseDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">{p.supplierName}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{p.branchName}</td>
                        <td className="px-4 py-3">
                          {formatCurrency(p.totalAmount, p.currencyCode)}
                        </td>
                        <td className="px-4 py-3">{formatCurrency(p.paidAmount, p.currencyCode)}</td>
                        <td className="px-4 py-3 font-semibold text-rose-700">
                          {formatCurrency(p.balanceDue, p.currencyCode)}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold">{p.paymentStatus}</td>
                        <td className="px-4 py-3 text-xs font-semibold">{p.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. EXPENSE REPORT */}
        {tab === 'expenses' && expenseReport && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Total Expenses</p>
                <p className="mt-1 text-2xl font-bold text-rose-700">
                  {formatCurrency(expenseReport.totalExpenses, expenseReport.currencyCode)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {expenseReport.expenseCount} expense record(s)
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">By Expense Type</p>
                <div className="mt-2 space-y-1 text-xs">
                  {expenseReport.byExpenseType.length === 0 ? (
                    <p className="text-slate-400">No data</p>
                  ) : (
                    expenseReport.byExpenseType.map((et) => (
                      <div key={et.expenseTypeId} className="flex justify-between">
                        <span className="font-medium text-slate-700">
                          {et.name} ({et.count})
                        </span>
                        <span className="font-bold text-rose-700">
                          {formatCurrency(et.total, expenseReport.currencyCode)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">By Payment Method</p>
                <div className="mt-2 space-y-1 text-xs">
                  {expenseReport.byPaymentMethod.length === 0 ? (
                    <p className="text-slate-400">No data</p>
                  ) : (
                    expenseReport.byPaymentMethod.map((pm) => (
                      <div key={pm.method} className="flex justify-between">
                        <span className="font-medium text-slate-700">
                          {pm.method} ({pm.count})
                        </span>
                        <span className="font-bold text-slate-900">
                          {formatCurrency(pm.total, expenseReport.currencyCode)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Expense #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenseReport.expenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No expenses match the current filters.
                      </td>
                    </tr>
                  ) : (
                    expenseReport.expenses.map((ex) => (
                      <tr key={ex.id}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold">
                          {ex.expenseNumber}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {new Date(ex.expenseDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 font-medium">{ex.expenseTypeName}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{ex.branchName}</td>
                        <td className="px-4 py-3 text-slate-600">{ex.description || '—'}</td>
                        <td className="px-4 py-3 text-xs">{ex.paymentMethod}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-bold text-rose-700">
                          {formatCurrency(ex.amount, ex.currencyCode)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{ex.employeeName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. INCOME REPORT */}
        {tab === 'incomes' && incomeReport && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Net POS Sales</p>
                <p className="mt-1 text-xl font-bold">
                  {formatCurrency(incomeReport.netSalesRevenue, incomeReport.currencyCode)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Gross {formatCurrency(incomeReport.grossSalesRevenue, incomeReport.currencyCode)} •
                  Refunds {formatCurrency(incomeReport.totalRefunds, incomeReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Additional Income</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {formatCurrency(incomeReport.additionalIncome, incomeReport.currencyCode)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {incomeReport.additionalIncomeCount} record(s)
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Total Combined Business Income
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">
                  {formatCurrency(incomeReport.totalIncome, incomeReport.currencyCode)}
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900">Daily Combined Income</h2>
                <div className="mt-3 space-y-2 text-sm">
                  {incomeReport.byDate.length === 0 ? (
                    <p className="text-slate-500">No income in period.</p>
                  ) : (
                    incomeReport.byDate.map((row) => (
                      <div key={row.date} className="border-b border-slate-100 pb-2">
                        <div className="flex justify-between font-semibold">
                          <span>{row.date}</span>
                          <span className="text-emerald-700">
                            {formatCurrency(row.total, incomeReport.currencyCode)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          POS: {formatCurrency(row.salesIncome, incomeReport.currencyCode)} • Extra:{' '}
                          {formatCurrency(row.additionalIncome, incomeReport.currencyCode)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Income #</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {incomeReport.incomes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          No additional income entries match the current filters.
                        </td>
                      </tr>
                    ) : (
                      incomeReport.incomes.map((inc) => (
                        <tr key={inc.id}>
                          <td className="px-4 py-3 font-mono text-xs font-semibold">
                            {inc.incomeNumber}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                            {new Date(inc.incomeDate).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{inc.branchName}</td>
                          <td className="px-4 py-3 text-slate-700">{inc.description || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-bold text-emerald-700">
                            {formatCurrency(inc.amount, inc.currencyCode)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{inc.employeeName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 7. PROFIT ESTIMATION REPORT */}
        {tab === 'profit' && profitReport && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Net Sales Revenue</p>
                <p className="mt-1 text-xl font-bold">
                  {formatCurrency(profitReport.netSalesRevenue, profitReport.currencyCode)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Gross {formatCurrency(profitReport.grossSales, profitReport.currencyCode)} − Refunds{' '}
                  {formatCurrency(profitReport.totalRefunds, profitReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Cost of Goods Sold (COGS)
                </p>
                <p className="mt-1 text-xl font-bold text-slate-800">
                  {formatCurrency(profitReport.costOfGoodsSold, profitReport.currencyCode)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Gross Margin {profitReport.grossMarginPct}%
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Gross Profit &amp; Other
                </p>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {formatCurrency(profitReport.grossProfit, profitReport.currencyCode)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  +Extra {formatCurrency(profitReport.additionalIncome, profitReport.currencyCode)}{' '}
                  − Exp {formatCurrency(profitReport.totalExpenses, profitReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <p className="text-xs font-semibold uppercase text-emerald-800">
                  Estimated Net Profit
                </p>
                <p
                  className={`mt-1 text-2xl font-bold ${
                    Number(profitReport.estimatedNetProfit) >= 0
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {formatCurrency(profitReport.estimatedNetProfit, profitReport.currencyCode)}
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  Net Margin {profitReport.netMarginPct}%
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Net Sales</th>
                    <th className="px-4 py-3">COGS</th>
                    <th className="px-4 py-3">Additional Income</th>
                    <th className="px-4 py-3">Expenses</th>
                    <th className="px-4 py-3">Estimated Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profitReport.dailyProfit.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No financial activity in this period.
                      </td>
                    </tr>
                  ) : (
                    profitReport.dailyProfit.map((d) => (
                      <tr key={d.date}>
                        <td className="px-4 py-3 font-medium">{d.date}</td>
                        <td className="px-4 py-3">
                          {formatCurrency(d.netSales, profitReport.currencyCode)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatCurrency(d.cogs, profitReport.currencyCode)}
                        </td>
                        <td className="px-4 py-3 text-emerald-700">
                          {formatCurrency(d.additionalIncome, profitReport.currencyCode)}
                        </td>
                        <td className="px-4 py-3 text-rose-700">
                          {formatCurrency(d.expenses, profitReport.currencyCode)}
                        </td>
                        <td
                          className={`px-4 py-3 font-bold ${
                            Number(d.estimatedProfit) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {formatCurrency(d.estimatedProfit, profitReport.currencyCode)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 8. CASHIER SHIFT REPORT */}
        {tab === 'shifts' && shiftReport && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Shifts</p>
                <p className="mt-1 text-xl font-bold">
                  {shiftReport.summary.totalShifts}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ({shiftReport.summary.openShifts} open / {shiftReport.summary.closedShifts}{' '}
                    closed)
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Shift Sales Total</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {formatCurrency(shiftReport.summary.totalShiftSales, shiftReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Expected Cash</p>
                <p className="mt-1 text-xl font-bold">
                  {formatCurrency(shiftReport.summary.totalExpectedCash, shiftReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Actual Counted</p>
                <p className="mt-1 text-xl font-bold">
                  {formatCurrency(shiftReport.summary.totalActualCash, shiftReport.currencyCode)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Cash Variance</p>
                <p
                  className={`mt-1 text-xl font-bold ${
                    Number(shiftReport.summary.totalCashDifference) < 0
                      ? 'text-rose-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {formatCurrency(
                    shiftReport.summary.totalCashDifference,
                    shiftReport.currencyCode,
                  )}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Shift #</th>
                    <th className="px-4 py-3">Cashier</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Orders</th>
                    <th className="px-4 py-3">Sales Total</th>
                    <th className="px-4 py-3">Opening</th>
                    <th className="px-4 py-3">Expected</th>
                    <th className="px-4 py-3">Actual</th>
                    <th className="px-4 py-3">Diff</th>
                    <th className="px-4 py-3">Opened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shiftReport.shifts.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                        No cashier shifts match the current filters.
                      </td>
                    </tr>
                  ) : (
                    shiftReport.shifts.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold">
                          {s.shiftNumber}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{s.employeeName}</span>{' '}
                          <span className="text-xs text-slate-400">({s.employeeCode})</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{s.branchName}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              s.status === 'OPEN'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{s.orderCount}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">
                          {formatCurrency(s.salesTotal, shiftReport.currencyCode)}
                        </td>
                        <td className="px-4 py-3">
                          {formatCurrency(s.openingCash, shiftReport.currencyCode)}
                        </td>
                        <td className="px-4 py-3">
                          {formatCurrency(s.expectedCash, shiftReport.currencyCode)}
                        </td>
                        <td className="px-4 py-3">
                          {s.actualCash !== null
                            ? formatCurrency(s.actualCash, shiftReport.currencyCode)
                            : '—'}
                        </td>
                        <td
                          className={`px-4 py-3 font-bold ${
                            s.cashDifference !== null && Number(s.cashDifference) < 0
                              ? 'text-rose-700'
                              : 'text-slate-700'
                          }`}
                        >
                          {s.cashDifference !== null
                            ? formatCurrency(s.cashDifference, shiftReport.currencyCode)
                            : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {new Date(s.openedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 9. EMPLOYEE REPORTS */}
        {tab === 'employees' && employeeReport && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Total Staff</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {employeeReport.summary.totalEmployees}
                </p>
                <p className="mt-1 text-xs text-slate-400">Registered staff members</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Active Cashiers</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">
                  {employeeReport.summary.activeCashiers}
                </p>
                <p className="mt-1 text-xs text-slate-400">Processed &ge; 1 order</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Orders Handled</p>
                <p className="mt-1 text-2xl font-bold text-blue-600">
                  {employeeReport.summary.totalOrdersHandled}
                </p>
                <p className="mt-1 text-xs text-slate-400">Across selected filters</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Total Sales Volume</p>
                <DualAmount
                  amount={employeeReport.summary.totalSalesVolume}
                  currencyCode={employeeReport.currencyCode}
                  className="mt-1 text-xl font-bold text-slate-900"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-amber-600">
                  <Award className="h-3.5 w-3.5" />
                  <span>Top Performer</span>
                </div>
                <p className="mt-1 text-base font-bold text-slate-900 truncate">
                  {employeeReport.summary.topPerformer.name}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-emerald-600">
                  {formatCurrency(
                    employeeReport.summary.topPerformer.sales,
                    employeeReport.currencyCode,
                  )}{' '}
                  &bull; {employeeReport.summary.topPerformer.orderCount} orders
                </p>
              </div>
            </div>

            {/* Employees Performance Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Position</th>
                    <th className="px-4 py-3">Branches</th>
                    <th className="px-4 py-3">Orders</th>
                    <th className="px-4 py-3">Total Sales</th>
                    <th className="px-4 py-3">Avg. Basket (AOV)</th>
                    <th className="px-4 py-3">Discounts</th>
                    <th className="px-4 py-3">Shifts</th>
                    <th className="px-4 py-3">Drawer Diff</th>
                    <th className="px-4 py-3">Performance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employeeReport.employees.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                        No employees match the current filters.
                      </td>
                    </tr>
                  ) : (
                    employeeReport.employees.map((emp) => {
                      const salesNum = Number(emp.totalSales);
                      const diffNum = Number(emp.cashDifference);
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                                {emp.name
                                  .split(' ')
                                  .map((p) => p[0])
                                  .slice(0, 2)
                                  .join('')
                                  .toUpperCase()}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-900">{emp.name}</span>
                                <div className="font-mono text-[11px] text-slate-400">
                                  {emp.employeeCode}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-slate-700">
                            {emp.position}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            <div className="flex flex-wrap gap-1">
                              {emp.branches.map((b, i) => (
                                <span
                                  key={i}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            {emp.orderCount}
                          </td>
                          <td className="px-4 py-3 font-bold text-emerald-700">
                            <DualAmount
                              amount={emp.totalSales}
                              currencyCode={employeeReport.currencyCode}
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {formatCurrency(emp.averageOrderValue, employeeReport.currencyCode)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {Number(emp.totalDiscounts) > 0 ? (
                              <span className="font-semibold text-amber-700">
                                {formatCurrency(emp.totalDiscounts, employeeReport.currencyCode)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{emp.shiftCount}</td>
                          <td className="px-4 py-3">
                            {diffNum === 0 ? (
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                Balanced
                              </span>
                            ) : diffNum > 0 ? (
                              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                +{formatCurrency(emp.cashDifference, employeeReport.currencyCode)}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                                {formatCurrency(emp.cashDifference, employeeReport.currencyCode)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {salesNum >= 1000 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                <Award className="h-3 w-3" /> Top Tier
                              </span>
                            ) : salesNum >= 200 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                High Producer
                              </span>
                            ) : emp.orderCount > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                                Standby
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 9. ADVANCED ANALYTICS (VERSION 2) */}
        {tab === 'analytics' && analyticsData && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Peak Sales Hour</p>
                <p className="mt-2 text-2xl font-black text-blue-600">
                  {analyticsData.hourly?.peakHour ?? '12:00'}
                </p>
                <p className="mt-1 text-xs text-slate-500">Highest revenue concentration of the day</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Repeat Customer Rate</p>
                <p className="mt-2 text-2xl font-black text-emerald-600">
                  {analyticsData.retention?.repeatCustomerRate ?? '0.0%'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {analyticsData.retention?.repeatCustomers ?? 0} repeat of{' '}
                  {analyticsData.retention?.totalTrackedCustomers ?? 0} tracked customers
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Top Cross-Sell Bundle</p>
                <p className="mt-2 text-sm font-bold text-slate-800 line-clamp-1">
                  {analyticsData.affinity?.topAffinityPairs?.[0]?.productA ?? 'N/A'} +{' '}
                  {analyticsData.affinity?.topAffinityPairs?.[0]?.productB ?? ''}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Purchased together {analyticsData.affinity?.topAffinityPairs?.[0]?.count ?? 0} times
                </p>
              </div>
            </div>

            {/* Hourly Sales Distribution */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-base text-slate-900">24-Hour Sales Density & Staffing Heatmap</h3>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 pt-2">
                {analyticsData.hourly?.hours?.map((h: any) => {
                  const orders = Number(h.orderCount);
                  const bgClass =
                    orders >= 5
                      ? 'bg-blue-600 text-white'
                      : orders >= 2
                      ? 'bg-blue-400 text-white'
                      : orders >= 1
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-50 text-slate-400';
                  return (
                    <div
                      key={h.hour}
                      className={`p-2 rounded-lg text-center flex flex-col justify-between border border-slate-100 ${bgClass}`}
                    >
                      <span className="text-[10px] font-semibold">{h.label}</span>
                      <span className="text-xs font-extrabold my-1">{orders} ord</span>
                      <span className="text-[9px] opacity-80">${h.totalSales}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Market Basket Product Affinity */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-base text-slate-900">Frequently Bought Together (Basket Affinity)</h3>
              {analyticsData.affinity?.topAffinityPairs?.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {analyticsData.affinity.topAffinityPairs.map((pair: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between"
                    >
                      <div className="text-xs font-semibold text-slate-800">
                        <span>{pair.productA}</span>
                        <span className="mx-2 text-slate-400">&amp;</span>
                        <span>{pair.productB}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                        {pair.count} orders
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Not enough order history for basket affinity analysis.</p>
              )}
            </div>
          </div>
        )}

        {/* 10. FORMAL PROFIT & LOSS STATEMENT */}
        {tab === 'pnl' && pnlData && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Profit &amp; Loss Statement (P&amp;L)</h3>
                <p className="text-xs text-slate-500">Accrual-based income statement with gross &amp; net operating margins.</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold uppercase text-slate-400">Net Profit</span>
                <div className="text-2xl font-black text-emerald-600">${pnlData.netProfit}</div>
              </div>
            </div>

            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <tr className="font-semibold text-slate-800 bg-slate-50">
                  <td className="py-2.5 px-3">Gross Sales Revenue</td>
                  <td className="py-2.5 px-3 text-right">${pnlData.grossRevenue}</td>
                </tr>
                <tr className="text-slate-600">
                  <td className="py-2 px-3 pl-6">Less: Sales Returns &amp; Customer Refunds</td>
                  <td className="py-2 px-3 text-right text-rose-600">-${pnlData.returnsAndRefunds}</td>
                </tr>
                <tr className="font-bold text-slate-900 bg-slate-50/50">
                  <td className="py-2.5 px-3">Net Sales Revenue</td>
                  <td className="py-2.5 px-3 text-right">${pnlData.netRevenue}</td>
                </tr>
                <tr className="text-slate-600">
                  <td className="py-2 px-3 pl-6">Less: Cost of Goods Sold (COGS)</td>
                  <td className="py-2 px-3 text-right text-rose-600">-${pnlData.costOfGoodsSold}</td>
                </tr>
                <tr className="font-bold text-emerald-800 bg-emerald-50/40">
                  <td className="py-2.5 px-3">Gross Profit (Margin: {pnlData.grossMarginPercentage})</td>
                  <td className="py-2.5 px-3 text-right">${pnlData.grossProfit}</td>
                </tr>

                <tr className="font-semibold text-slate-800 bg-slate-50">
                  <td className="py-2.5 px-3" colSpan={2}>Operating Expenses</td>
                </tr>
                {Object.entries(pnlData.operatingExpensesBreakdown ?? {}).map(([category, amount]: any) => (
                  <tr key={category} className="text-slate-600">
                    <td className="py-1.5 px-3 pl-6">{category}</td>
                    <td className="py-1.5 px-3 text-right">-${amount}</td>
                  </tr>
                ))}
                <tr className="font-semibold text-slate-700">
                  <td className="py-2 px-3 pl-6">Total Operating Expenses</td>
                  <td className="py-2 px-3 text-right text-rose-600">-${pnlData.operatingExpenses}</td>
                </tr>

                <tr className="font-bold text-slate-900 bg-slate-50">
                  <td className="py-2.5 px-3">Operating Profit</td>
                  <td className="py-2.5 px-3 text-right">${pnlData.operatingProfit}</td>
                </tr>
                <tr className="text-slate-600">
                  <td className="py-2 px-3 pl-6">Plus: Additional Business Income</td>
                  <td className="py-2 px-3 text-right text-emerald-600">+${pnlData.additionalIncome}</td>
                </tr>
                <tr className="font-extrabold text-base text-emerald-700 bg-emerald-100/50">
                  <td className="py-3 px-3">Net Profit (Margin: {pnlData.netMarginPercentage})</td>
                  <td className="py-3 px-3 text-right">${pnlData.netProfit}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* 11. BALANCE SHEET STATEMENT */}
        {tab === 'balanceSheet' && balanceSheetData && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="pb-3 border-b border-slate-200">
              <h3 className="font-bold text-lg text-slate-900">Balance Sheet Statement</h3>
              <p className="text-xs text-slate-500">Snapshot of business assets, supplier liabilities, and net equity.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Assets */}
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-3">
                <h4 className="font-bold text-blue-900 uppercase text-xs">Current Assets</h4>
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between">
                    <span>Cash in Registers</span>
                    <span className="font-semibold">${balanceSheetData.assets?.cashInRegisters}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Inventory Valuation</span>
                    <span className="font-semibold">${balanceSheetData.assets?.inventoryValuation}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-blue-200 font-bold text-blue-900">
                    <span>Total Assets</span>
                    <span>${balanceSheetData.assets?.totalCurrentAssets}</span>
                  </div>
                </div>
              </div>

              {/* Liabilities */}
              <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/30 space-y-3">
                <h4 className="font-bold text-rose-900 uppercase text-xs">Current Liabilities</h4>
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between">
                    <span>Supplier Accounts Payable</span>
                    <span className="font-semibold text-rose-700">
                      ${balanceSheetData.liabilities?.accountsPayable}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-rose-200 font-bold text-rose-900">
                    <span>Total Liabilities</span>
                    <span>${balanceSheetData.liabilities?.totalCurrentLiabilities}</span>
                  </div>
                </div>
              </div>

              {/* Equity */}
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-3">
                <h4 className="font-bold text-emerald-900 uppercase text-xs">Business Net Equity</h4>
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Assets - Liabilities</span>
                  </div>
                  <div className="flex justify-between pt-4 border-t border-emerald-200 font-extrabold text-lg text-emerald-700">
                    <span>Net Equity</span>
                    <span>${balanceSheetData.equity?.netBusinessEquity}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 12. TAX & VAT DECLARATION */}
        {tab === 'tax' && taxData && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="pb-3 border-b border-slate-200">
              <h3 className="font-bold text-lg text-slate-900">General Department of Taxation (GDT) Summary</h3>
              <p className="text-xs text-slate-500">Cambodia Value Added Tax (VAT 10%) declaration reconciliation.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <span className="text-xs font-bold text-slate-500 uppercase">Output VAT (Sales)</span>
                <div className="text-xl font-bold text-slate-800">${taxData.salesTax?.outputVat}</div>
                <div className="text-xs text-slate-500">Taxable Sales: ${taxData.salesTax?.taxableSales}</div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <span className="text-xs font-bold text-slate-500 uppercase">Input VAT (Purchases)</span>
                <div className="text-xl font-bold text-slate-800">${taxData.purchaseTax?.inputVat}</div>
                <div className="text-xs text-slate-500">Taxable Purchases: ${taxData.purchaseTax?.taxablePurchases}</div>
              </div>

              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2">
                <span className="text-xs font-bold text-blue-700 uppercase">Net VAT Liability Payable</span>
                <div className="text-2xl font-black text-blue-900">${taxData.netVatLiability}</div>
                <div className="text-xs text-blue-600">Output VAT minus Input VAT</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
