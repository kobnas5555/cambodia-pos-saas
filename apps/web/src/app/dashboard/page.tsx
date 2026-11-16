'use client';

import {
  convertCurrency,
  formatCurrency,
  type CurrencyCode,
} from '@cambodia-pos/shared';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  DollarSign,
  Package,
  Receipt,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest } from '@/lib/api';

interface DashboardData {
  currencyCode: CurrencyCode;
  exchangeRate?: string;
  totalSales: string;
  revenue: string;
  grossSales?: string;
  netRevenue?: string;
  totalOrders: number;
  averageOrderValue?: string;
  totalExpenses: string;
  additionalIncome: string;
  estimatedProfit: string;
  profitMargin?: string;
  lowStockCount: number;
  lowStockItems: Array<{
    productId: string;
    name: string;
    sku: string;
    branchName: string;
    quantity: string;
    lowStockAlert: string;
    isCritical?: boolean;
  }>;
  recentTransactions: Array<{
    id: string;
    orderNumber: string;
    branchName: string;
    customerName: string;
    customerPhone?: string | null;
    totalAmount: string;
    currencyCode: CurrencyCode;
    status: string;
    createdAt: string;
    paymentMethod?: string;
    paymentMethods?: string[];
  }>;
  salesChart: Array<{ date: string; amount: string; orders?: number }>;
}

export default function DashboardPage() {
  const { user, activeTenant, activeBranch } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<'revenue' | 'orders'>('revenue');
  const [chartDays, setChartDays] = useState<7 | 14>(14);

  const fetchDashboardData = () => {
    if (!activeTenant) return;
    setIsLoading(true);
    const qs = activeBranch ? `?branchId=${activeBranch.id}` : '';
    apiRequest<DashboardData>(`/reports/dashboard${qs}`)
      .then((res) => {
        setData(res);
      })
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeTenant, activeBranch]);

  const baseCur = (data?.currencyCode ?? activeTenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const secondaryCur: CurrencyCode = baseCur === 'USD' ? 'KHR' : 'USD';
  const exRate = data?.exchangeRate ?? '4100';

  // Compute counterpart currency string
  const getCounterpart = (amountStr: string) => {
    try {
      const converted = convertCurrency(amountStr || '0', baseCur, secondaryCur, exRate);
      return formatCurrency(converted, secondaryCur);
    } catch {
      return '';
    }
  };

  // Slice chart by days
  const visibleChartData = (data?.salesChart ?? []).slice(-chartDays);

  const maxRevenueVal = Math.max(
    1,
    ...visibleChartData.map((c) => Number(c.amount) || 0),
  );

  const maxOrdersVal = Math.max(
    1,
    ...visibleChartData.map((c) => Number(c.orders) || 0),
  );

  const isProfitPositive = Number(data?.estimatedProfit ?? 0) >= 0;

  // Chart summary stats
  const totalPeriodRevenue = visibleChartData.reduce(
    (sum, d) => sum + Number(d.amount || 0),
    0,
  );
  const totalPeriodOrders = visibleChartData.reduce(
    (sum, d) => sum + (d.orders || 0),
    0,
  );
  const avgDailyRevenue = visibleChartData.length > 0
    ? totalPeriodRevenue / visibleChartData.length
    : 0;

  // Greeting helper
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* 1. Overview Header */}
        <div className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 p-6 text-white shadow-md sm:p-8">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-100">
                <span className="rounded-full bg-emerald-900/60 px-3 py-1 backdrop-blur-sm">
                  {activeTenant?.name ?? 'Workspace'}
                </span>
                <span>•</span>
                <span className="rounded-full bg-teal-900/60 px-3 py-1 backdrop-blur-sm">
                  {activeBranch?.name ?? 'All Branches'}
                </span>
                <span>•</span>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-emerald-200">
                  1 USD = {Number(exRate).toLocaleString()} KHR
                </span>
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                {greeting}, {user?.name ?? 'Cashier'}
              </h1>
              <p className="text-sm text-emerald-100/90">
                Here is your store summary and real-time operational performance for today.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={fetchDashboardData}
                disabled={isLoading}
                title="Refresh dashboard stats"
                className="flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-900/40 px-3.5 py-2.5 text-xs font-bold text-emerald-100 transition hover:bg-emerald-900/60 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <Link
                href="/inventory/transfers"
                className="hidden items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-white/20 sm:inline-flex"
              >
                <Truck className="h-4 w-4 text-emerald-200" />
                Transfers
              </Link>
              <Link
                href="/pos"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-emerald-800 shadow-md transition hover:bg-emerald-50 active:scale-95"
              >
                <ShoppingCart className="h-4 w-4 text-emerald-700" />
                Open POS Terminal
              </Link>
            </div>
          </div>
        </div>

        {/* 2. Core KPI Cards: Total Sales, Total Orders, Revenue, Expenses, Estimated Profit, Low-Stock */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {/* KPI 1: Total Sales (Gross) */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {t.dashboard.totalSales}
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Coins className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-xl font-black text-slate-900">
                {formatCurrency(data?.totalSales ?? '0.00', baseCur)}
              </p>
              <p className="text-xs font-semibold text-slate-400">
                ≈ {getCounterpart(data?.totalSales ?? '0.00')}
              </p>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              Gross sales before returns
            </div>
          </div>

          {/* KPI 2: Total Orders */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {t.dashboard.totalOrders}
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Receipt className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-xl font-black text-slate-900">
                {data?.totalOrders ?? 0}
              </p>
              <p className="text-xs font-semibold text-slate-500">
                AOV: {formatCurrency(data?.averageOrderValue ?? '0.00', baseCur)}
              </p>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              Avg. basket size
            </div>
          </div>

          {/* KPI 3: Revenue (Net) */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {t.dashboard.revenue}
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-xl font-black text-teal-700">
                {formatCurrency(data?.revenue ?? '0.00', baseCur)}
              </p>
              <p className="text-xs font-semibold text-slate-400">
                ≈ {getCounterpart(data?.revenue ?? '0.00')}
              </p>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              Net of customer refunds
            </div>
          </div>

          {/* KPI 4: Expenses */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {t.dashboard.totalExpenses}
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <Wallet className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-xl font-black text-rose-700">
                {formatCurrency(data?.totalExpenses ?? '0.00', baseCur)}
              </p>
              <p className="text-xs font-semibold text-slate-400">
                ≈ {getCounterpart(data?.totalExpenses ?? '0.00')}
              </p>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              Operational store costs
            </div>
          </div>

          {/* KPI 5: Estimated Profit */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {t.dashboard.estimatedProfit}
                </span>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    isProfitPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  {isProfitPositive ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                </div>
              </div>
              <p
                className={`mt-2 text-xl font-black ${
                  isProfitPositive ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatCurrency(data?.estimatedProfit ?? '0.00', baseCur)}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                    isProfitPositive
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {data?.profitMargin ?? '0.0'}% Margin
                </span>
              </div>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              Revenue - COGS - Expenses
            </div>
          </div>

          {/* KPI 6: Low-Stock Products */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {t.dashboard.lowStock}
                </span>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    (data?.lowStockCount ?? 0) > 0
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-emerald-50 text-emerald-600'
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </div>
              <p
                className={`mt-2 text-xl font-black ${
                  (data?.lowStockCount ?? 0) > 0 ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {data?.lowStockCount ?? 0}
              </p>
              <p className="text-xs font-semibold text-slate-400">
                {(data?.lowStockCount ?? 0) > 0 ? 'Restock needed' : 'All stocks healthy'}
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
              <span className="text-slate-500">Tracked catalog</span>
              <Link href="/inventory" className="font-bold text-emerald-600 hover:underline">
                View →
              </Link>
            </div>
          </div>
        </div>

        {/* 3. Sales Charts & Quick Navigation */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Sales & Orders Chart (2 Columns) */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                  {t.dashboard.salesCharts}
                </h2>
                <p className="text-xs text-slate-500">
                  Daily revenue trajectory and transaction density
                </p>
              </div>

              {/* Controls: Metric Switcher & Days Toggle */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold text-slate-600">
                  <button
                    type="button"
                    onClick={() => setChartMetric('revenue')}
                    className={`rounded-lg px-3 py-1 transition ${
                      chartMetric === 'revenue'
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Revenue ({baseCur})
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMetric('orders')}
                    className={`rounded-lg px-3 py-1 transition ${
                      chartMetric === 'orders'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Orders
                  </button>
                </div>

                <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold text-slate-600">
                  <button
                    type="button"
                    onClick={() => setChartDays(7)}
                    className={`rounded-lg px-2.5 py-1 transition ${
                      chartDays === 7
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    7D
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartDays(14)}
                    className={`rounded-lg px-2.5 py-1 transition ${
                      chartDays === 14
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    14D
                  </button>
                </div>
              </div>
            </div>

            {/* Visual Bar Graph */}
            {visibleChartData.length > 0 ? (
              <div className="mt-6">
                <div className="flex h-52 items-end gap-2 pt-6">
                  {visibleChartData.map((bar) => {
                    const isRevenue = chartMetric === 'revenue';
                    const numVal = isRevenue ? Number(bar.amount || 0) : bar.orders || 0;
                    const maxVal = isRevenue ? maxRevenueVal : maxOrdersVal;
                    const pct = Math.max(8, Math.round((numVal / maxVal) * 100));

                    return (
                      <div
                        key={bar.date}
                        className="group relative flex flex-1 flex-col items-center gap-2"
                      >
                        {/* Hover Tooltip */}
                        <div className="pointer-events-none absolute -top-12 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-[11px] font-semibold text-white shadow-lg group-hover:block">
                          <p>{bar.date}</p>
                          <p className="text-emerald-300">
                            {formatCurrency(bar.amount, baseCur)} ({bar.orders ?? 0} orders)
                          </p>
                        </div>

                        {/* Top Label */}
                        <span className="text-[10px] font-semibold text-slate-400 group-hover:text-slate-700">
                          {isRevenue ? `$${Math.round(numVal)}` : numVal}
                        </span>

                        {/* Bar */}
                        <div className="w-full flex-1 max-w-[42px] flex items-end">
                          <div
                            className={`w-full rounded-t-lg transition-all duration-300 group-hover:opacity-85 ${
                              isRevenue
                                ? 'bg-gradient-to-t from-emerald-600 to-teal-500'
                                : 'bg-gradient-to-t from-blue-600 to-indigo-500'
                            }`}
                            style={{ height: `${pct}%` }}
                          />
                        </div>

                        {/* Date Label */}
                        <span className="text-[10px] font-bold text-slate-500">
                          {bar.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Summary Strip */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4 text-xs">
                  <div>
                    <span className="text-slate-400">Period Revenue: </span>
                    <span className="font-bold text-slate-800">
                      {formatCurrency(totalPeriodRevenue.toFixed(2), baseCur)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Orders: </span>
                    <span className="font-bold text-slate-800">{totalPeriodOrders}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Daily Average: </span>
                    <span className="font-bold text-slate-800">
                      {formatCurrency(avgDailyRevenue.toFixed(2), baseCur)}
                    </span>
                  </div>
                  <Link
                    href="/reports"
                    className="flex items-center gap-1 font-bold text-emerald-700 hover:underline"
                  >
                    Advanced Analytics <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center text-center text-sm text-slate-400">
                <Receipt className="mb-2 h-8 w-8 text-slate-300" />
                <p>Complete sales at POS to render daily chart trends.</p>
              </div>
            )}
          </div>

          {/* Quick Actions & Low-Stock Alerts (1 Column) */}
          <div className="space-y-6">
            {/* Low-Stock Products Card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-900">{t.dashboard.lowStock}</h2>
                </div>
                <Link
                  href="/inventory"
                  className="text-xs font-bold text-emerald-600 hover:underline"
                >
                  Manage →
                </Link>
              </div>

              <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
                {data && data.lowStockItems.length > 0 ? (
                  data.lowStockItems.map((item) => (
                    <div
                      key={`${item.productId}-${item.branchName}`}
                      className={`flex items-center justify-between rounded-xl p-3 text-xs ${
                        item.isCritical
                          ? 'border border-rose-200 bg-rose-50/70'
                          : 'border border-amber-200 bg-amber-50/60'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <p className="font-bold text-slate-900 truncate">{item.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {item.sku} • {item.branchName}
                        </p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <span
                          className={`font-black ${
                            item.isCritical ? 'text-rose-700' : 'text-amber-800'
                          }`}
                        >
                          {item.quantity} left
                        </span>
                        <p className="text-[10px] text-slate-400">Alert: {item.lowStockAlert}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500">
                    <CheckCircle2 className="mx-auto mb-1.5 h-6 w-6 text-emerald-500" />
                    All inventory products are above minimum alert levels.
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions Shortcuts */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 mb-3">{t.dashboard.quickActions}</h2>
              <div className="space-y-2">
                {[
                  {
                    href: '/pos',
                    label: 'New POS Sale',
                    desc: 'Instant checkout & KHQR',
                    icon: ShoppingCart,
                    color: 'text-emerald-600 bg-emerald-50',
                  },
                  {
                    href: '/inventory/transfers',
                    label: 'Branch Transfer',
                    desc: 'Inter-store transit requisition',
                    icon: Truck,
                    color: 'text-blue-600 bg-blue-50',
                  },
                  {
                    href: '/finance',
                    label: 'Record Expense',
                    desc: 'Log store operational cost',
                    icon: Wallet,
                    color: 'text-rose-600 bg-rose-50',
                  },
                  {
                    href: '/products',
                    label: 'Manage Products',
                    desc: 'Catalog, pricing & SKUs',
                    icon: Package,
                    color: 'text-amber-600 bg-amber-50',
                  },
                ].map((act) => {
                  const Icon = act.icon;
                  return (
                    <Link
                      key={act.href}
                      href={act.href}
                      className="group flex items-center justify-between rounded-xl border border-slate-200/80 p-3 transition hover:border-emerald-300 hover:bg-emerald-50/40"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold ${act.color}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 group-hover:text-emerald-800">
                            {act.label}
                          </p>
                          <p className="text-[11px] text-slate-400">{act.desc}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-600 transition" />
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 4. Recent Transactions */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Clock className="h-5 w-5 text-emerald-600" />
                {t.dashboard.recentTransactions}
              </h2>
              <p className="text-xs text-slate-500">
                Live stream of the latest completed and processed sales orders
              </p>
            </div>
            <Link
              href="/sales"
              className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline"
            >
              View All Orders <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Order Number</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data && data.recentTransactions.length > 0 ? (
                  data.recentTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                          {tx.orderNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-medium">
                        {tx.branchName}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-800">
                        {tx.customerName}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                          <CreditCard className="h-3 w-3 text-slate-500" />
                          {tx.paymentMethod ?? 'CASH'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 text-xs">
                        {formatCurrency(tx.totalAmount, tx.currencyCode)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            tx.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : tx.status === 'PENDING'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-400">
                        {new Date(tx.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                      No customer transactions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
