'use client';

import {
  formatCurrency,
  PAYMENT_METHODS,
  type CurrencyCode,
  type PaymentMethod,
} from '@cambodia-pos/shared';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  DollarSign,
  Edit2,
  ListOrdered,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Tags,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

const EXCHANGE_RATE = 4100;

interface ExpenseTypeRow {
  id: string;
  tenantId?: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
  updatedAt?: string;
  _count?: { expenses: number };
}

interface ExpenseRow {
  id: string;
  tenantId?: string;
  branchId?: string;
  expenseTypeId?: string;
  employeeId?: string;
  expenseNumber: string;
  description: string | null;
  amount: string;
  currencyCode: CurrencyCode;
  exchangeRate?: string;
  paymentMethod: string;
  expenseDate: string;
  createdAt?: string;
  expenseType: { id: string; name: string };
  branch: { id: string; name: string };
  employee?: { id: string; name: string } | null;
}

interface IncomeRow {
  id: string;
  incomeNumber: string;
  description: string | null;
  amount: string;
  currencyCode: CurrencyCode;
  incomeDate: string;
  branch: { id: string; name: string };
  employee?: { id: string; name: string } | null;
}

interface FinancialTransactionRow {
  id: string;
  transactionType:
    | 'SALE_PAYMENT'
    | 'SALE_RETURN'
    | 'ADDITIONAL_INCOME'
    | 'EXPENSE'
    | 'PURCHASE_PAYMENT';
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
  occurredAt: string;
}

interface TransactionsPayload {
  currencyCode: CurrencyCode;
  totalInflow: string;
  totalOutflow: string;
  netAmount: string;
  transactions: FinancialTransactionRow[];
}

interface ExpenseBreakdownItem {
  expenseTypeId: string;
  expenseTypeName: string;
  count: number;
  total: string;
}

interface FinanceSummary {
  currencyCode: CurrencyCode;
  grossSales?: string;
  salesRevenue: string;
  totalRefunds: string;
  additionalIncome: string;
  totalExpenses: string;
  purchasePayments?: string;
  totalInflow?: string;
  totalOutflow?: string;
  netCashflow: string;
  netPositionIncludingPurchases?: string;
  expenseBreakdown?: ExpenseBreakdownItem[];
}

type FinanceTab = 'overview' | 'transactions' | 'expenses' | 'incomes' | 'types';

const TX_TYPE_LABELS: Record<FinancialTransactionRow['transactionType'], string> = {
  SALE_PAYMENT: 'Sale Payment',
  SALE_RETURN: 'Refund',
  ADDITIONAL_INCOME: 'Additional Income',
  EXPENSE: 'Expense',
  PURCHASE_PAYMENT: 'Supplier Payment',
};

const todayInputValue = () => new Date().toISOString().slice(0, 10);

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

export default function FinancePage() {
  const { activeTenant, activeBranch, hasPermission } = useAuth();
  const { t } = useI18n();
  const canManage = hasPermission('finance.manage');

  const [tab, setTab] = useState<FinanceTab>('overview');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [txData, setTxData] = useState<TransactionsPayload | null>(null);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseTypeRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [incomes, setIncomes] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filters
  const [branchScope, setBranchScope] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [txDirection, setTxDirection] = useState<'' | 'INFLOW' | 'OUTFLOW'>('');
  const [txType, setTxType] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [expTypeFilter, setExpTypeFilter] = useState('');

  // Expense Type Modal (create & edit)
  const [typeModal, setTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<ExpenseTypeRow | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeDesc, setTypeDesc] = useState('');
  const [typeStatus, setTypeStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [typeError, setTypeError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = (id: string) => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
  };

  // Expense Modal
  const [expModal, setExpModal] = useState(false);
  const [expTypeId, setExpTypeId] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCur, setExpCur] = useState<CurrencyCode>('USD');
  const [expMethod, setExpMethod] = useState<PaymentMethod>('CASH');
  const [expDate, setExpDate] = useState(todayInputValue());
  const [expDesc, setExpDesc] = useState('');
  const [expError, setExpError] = useState<string | null>(null);

  // Income Modal
  const [incModal, setIncModal] = useState(false);
  const [incAmount, setIncAmount] = useState('');
  const [incCur, setIncCur] = useState<CurrencyCode>('USD');
  const [incDate, setIncDate] = useState(todayInputValue());
  const [incDesc, setIncDesc] = useState('');
  const [incError, setIncError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const activeExpenseTypes = useMemo(
    () => expenseTypes.filter((et) => et.status === 'ACTIVE'),
    [expenseTypes],
  );

  const loadAll = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const baseParams = new URLSearchParams();
      if (branchScope === 'ACTIVE' && activeBranch) baseParams.set('branchId', activeBranch.id);
      if (dateFrom) baseParams.set('dateFrom', dateFrom);
      if (dateTo) baseParams.set('dateTo', dateTo);

      const expParams = new URLSearchParams(baseParams);
      if (search.trim()) expParams.set('search', search.trim());
      if (expTypeFilter) expParams.set('expenseTypeId', expTypeFilter);
      if (methodFilter) expParams.set('paymentMethod', methodFilter);

      const incParams = new URLSearchParams(baseParams);
      if (search.trim()) incParams.set('search', search.trim());

      const txParams = new URLSearchParams(baseParams);
      if (search.trim()) txParams.set('search', search.trim());
      if (txDirection) txParams.set('direction', txDirection);
      if (txType) txParams.set('type', txType);
      if (methodFilter) txParams.set('paymentMethod', methodFilter);

      const sumQs = baseParams.toString() ? `?${baseParams.toString()}` : '';
      const expQs = expParams.toString() ? `?${expParams.toString()}` : '';
      const incQs = incParams.toString() ? `?${incParams.toString()}` : '';
      const txQs = txParams.toString() ? `?${txParams.toString()}` : '';

      const [sum, types, exps, incs, txs] = await Promise.all([
        apiRequest<FinanceSummary>(`/finance/summary${sumQs}`),
        apiRequest<ExpenseTypeRow[]>('/finance/expense-types'),
        apiRequest<ExpenseRow[]>(`/finance/expenses${expQs}`),
        apiRequest<IncomeRow[]>(`/finance/incomes${incQs}`),
        apiRequest<TransactionsPayload>(`/finance/transactions${txQs}`),
      ]);
      setSummary(sum);
      setExpenseTypes(types);
      setExpenses(exps);
      setIncomes(incs);
      setTxData(txs);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load financial data');
    } finally {
      setLoading(false);
    }
  }, [
    activeTenant,
    activeBranch,
    branchScope,
    dateFrom,
    dateTo,
    search,
    expTypeFilter,
    methodFilter,
    txDirection,
    txType,
  ]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const setDatePreset = (preset: 'today' | '7d' | '30d' | 'month' | 'all') => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (preset === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setDateFrom(d.toISOString().slice(0, 10));
      setDateTo(todayStr);
    } else if (preset === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setDateFrom(d.toISOString().slice(0, 10));
      setDateTo(todayStr);
    } else if (preset === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      setDateFrom(startOfMonth);
      setDateTo(todayStr);
    } else {
      setDateFrom('');
      setDateTo('');
    }
  };

  const openCreateTypeModal = () => {
    setEditingType(null);
    setTypeName('');
    setTypeDesc('');
    setTypeStatus('ACTIVE');
    setTypeError(null);
    setTypeModal(true);
  };

  const openEditTypeModal = (row: ExpenseTypeRow) => {
    setEditingType(row);
    setTypeName(row.name);
    setTypeDesc(row.description ?? '');
    setTypeStatus(row.status);
    setTypeError(null);
    setTypeModal(true);
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    setTypeError(null);
    setSaving(true);
    try {
      if (editingType) {
        await apiRequest(`/finance/expense-types/${editingType.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: typeName.trim(),
            description: typeDesc.trim() || null,
            status: typeStatus,
          }),
        });
        setFeedback('Expense type updated.');
      } else {
        await apiRequest('/finance/expense-types', {
          method: 'POST',
          body: JSON.stringify({
            name: typeName.trim(),
            description: typeDesc.trim() || null,
          }),
        });
        setFeedback('Expense type created.');
      }
      setTypeModal(false);
      await loadAll();
    } catch (err) {
      setTypeError(err instanceof ApiClientError ? err.message : 'Unable to save expense type');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTypeStatus = async (row: ExpenseTypeRow) => {
    const nextStatus = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await apiRequest(`/finance/expense-types/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setFeedback(`Expense type ${row.name} marked ${nextStatus}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update status');
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranch) {
      setExpError('Please select an active branch first.');
      return;
    }
    setExpError(null);
    setSaving(true);
    try {
      await apiRequest('/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          branchId: activeBranch.id,
          expenseTypeId: expTypeId,
          amount: expAmount,
          currencyCode: expCur,
          paymentMethod: expMethod,
          expenseDate: expDate || undefined,
          description: expDesc || null,
        }),
      });
      setExpModal(false);
      setExpAmount('');
      setExpDesc('');
      setExpDate(todayInputValue());
      setFeedback('Expense recorded successfully.');
      await loadAll();
    } catch (err) {
      setExpError(err instanceof ApiClientError ? err.message : 'Unable to record expense');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranch) {
      setIncError('Please select an active branch first.');
      return;
    }
    setIncError(null);
    setSaving(true);
    try {
      await apiRequest('/finance/incomes', {
        method: 'POST',
        body: JSON.stringify({
          branchId: activeBranch.id,
          amount: incAmount,
          currencyCode: incCur,
          incomeDate: incDate || undefined,
          description: incDesc,
        }),
      });
      setIncModal(false);
      setIncAmount('');
      setIncDesc('');
      setIncDate(todayInputValue());
      setFeedback('Additional income recorded.');
      await loadAll();
    } catch (err) {
      setIncError(err instanceof ApiClientError ? err.message : 'Unable to record income');
    } finally {
      setSaving(false);
    }
  };

  const baseCur = summary?.currencyCode ?? activeTenant?.defaultCurrency ?? 'USD';
  const breakdown = summary?.expenseBreakdown ?? [];
  const maxBreakdown = breakdown.reduce((m, b) => Math.max(m, Number(b.total)), 0);

  // Computed Margin
  const totalInflowNum = parseFloat(summary?.totalInflow ?? summary?.salesRevenue ?? '0') || 0;
  const netCashflowNum = parseFloat(summary?.netCashflow ?? '0') || 0;
  const marginPct = totalInflowNum > 0 ? Math.round((netCashflowNum / totalInflowNum) * 100) : 0;

  // Filtered sums for Expenses and Incomes tables
  const totalFilteredExpensesUsd = useMemo(() => {
    return expenses.reduce((sum, ex) => {
      const amt = parseFloat(ex.amount || '0') || 0;
      return sum + (ex.currencyCode === 'KHR' ? amt / EXCHANGE_RATE : amt);
    }, 0);
  }, [expenses]);

  const totalFilteredIncomeUsd = useMemo(() => {
    return incomes.reduce((sum, inc) => {
      const amt = parseFloat(inc.amount || '0') || 0;
      return sum + (inc.currencyCode === 'KHR' ? amt / EXCHANGE_RATE : amt);
    }, 0);
  }, [incomes]);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header & Quick Action */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="h-6 w-6 text-emerald-600" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {t.finance.title}
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-600">{t.finance.subtitle}</p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2 print:hidden">
              <button
                type="button"
                onClick={() => {
                  setExpTypeId(activeExpenseTypes[0]?.id ?? '');
                  setExpCur((activeTenant?.defaultCurrency as CurrencyCode) ?? 'USD');
                  setExpDate(todayInputValue());
                  setExpError(null);
                  setExpModal(true);
                }}
                disabled={activeExpenseTypes.length === 0 || !activeBranch}
                title={
                  activeExpenseTypes.length === 0
                    ? 'Create an active expense type first'
                    : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 transition"
              >
                <Plus className="h-4 w-4" /> {t.finance.addExpense}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIncCur((activeTenant?.defaultCurrency as CurrencyCode) ?? 'USD');
                  setIncDate(todayInputValue());
                  setIncError(null);
                  setIncModal(true);
                }}
                disabled={!activeBranch}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                <Plus className="h-4 w-4" /> {t.finance.addIncome}
              </button>
              <button
                type="button"
                onClick={openCreateTypeModal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
              >
                <Plus className="h-4 w-4" /> {t.finance.addExpenseType}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
                title="Print Report"
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Print Report</span>
              </button>
            </div>
          )}
        </div>

        {/* Notifications */}
        {feedback && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{feedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              &times;
            </button>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-700 hover:text-red-900"
            >
              &times;
            </button>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 print:hidden">
          {(
            [
              { key: 'overview', label: t.finance.overviewTab, icon: Wallet },
              {
                key: 'transactions',
                label: `${t.finance.transactionsTab} (${txData?.transactions.length ?? 0})`,
                icon: ListOrdered,
              },
              {
                key: 'expenses',
                label: `${t.finance.expensesTab} (${expenses.length})`,
                icon: TrendingDown,
              },
              {
                key: 'incomes',
                label: `${t.finance.incomesTab} (${incomes.length})`,
                icon: TrendingUp,
              },
              {
                key: 'types',
                label: `${t.finance.expenseTypesTab} (${expenseTypes.length})`,
                icon: Tags,
              },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                tab === key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Filter bar with Date Presets */}
        {tab !== 'types' && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Date Presets Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                <span className="text-slate-400 mr-1 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Date:
                </span>
                {(
                  [
                    { id: 'today', label: 'Today' },
                    { id: '7d', label: 'Last 7 Days' },
                    { id: '30d', label: 'Last 30 Days' },
                    { id: 'month', label: 'This Month' },
                    { id: 'all', label: 'All Time' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDatePreset(p.id)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Branch Scope selector */}
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Scope:</span>
                <select
                  value={branchScope}
                  onChange={(e) => setBranchScope(e.target.value as 'ACTIVE' | 'ALL')}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ACTIVE">
                    {activeBranch ? activeBranch.name : 'Current Branch'}
                  </option>
                  <option value="ALL">All Branches (Consolidated)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
              {tab !== 'overview' && (
                <div className="min-w-[200px] flex-1">
                  <label className="block text-xs font-semibold text-slate-600">Search</label>
                  <div className="relative mt-1">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Doc #, description, category..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600">From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600">To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {tab === 'transactions' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Direction</label>
                    <select
                      value={txDirection}
                      onChange={(e) =>
                        setTxDirection(e.target.value as '' | 'INFLOW' | 'OUTFLOW')
                      }
                      className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">All Flows</option>
                      <option value="INFLOW">Inflow (+)</option>
                      <option value="OUTFLOW">Outflow (-)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Type</label>
                    <select
                      value={txType}
                      onChange={(e) => setTxType(e.target.value)}
                      className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">All Types</option>
                      <option value="SALE_PAYMENT">Sale Payment</option>
                      <option value="SALE_RETURN">Refund</option>
                      <option value="ADDITIONAL_INCOME">Additional Income</option>
                      <option value="EXPENSE">Expense</option>
                      <option value="PURCHASE_PAYMENT">Supplier Payment</option>
                    </select>
                  </div>
                </>
              )}

              {tab === 'expenses' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600">Expense Type</label>
                  <select
                    value={expTypeFilter}
                    onChange={(e) => setExpTypeFilter(e.target.value)}
                    className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">All Types</option>
                    {expenseTypes.map((et) => (
                      <option key={et.id} value={et.id}>
                        {et.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(tab === 'transactions' || tab === 'expenses') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600">Method</label>
                  <select
                    value={methodFilter}
                    onChange={(e) => setMethodFilter(e.target.value)}
                    className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">All Methods</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(dateFrom ||
                dateTo ||
                search ||
                txDirection ||
                txType ||
                methodFilter ||
                expTypeFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setSearch('');
                    setTxDirection('');
                    setTxType('');
                    setMethodFilter('');
                    setExpTypeFilter('');
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

        {/* OVERVIEW / FINANCIAL SUMMARY TAB */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* 4 Executive KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Net Sales Revenue
                  </span>
                  <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <DualAmount
                    amount={summary?.salesRevenue ?? '0'}
                    currencyCode={baseCur}
                    className="text-2xl font-bold text-slate-900"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 border-t border-slate-100 pt-2">
                  Gross {formatCurrency(summary?.grossSales ?? summary?.salesRevenue ?? '0', baseCur)}{' '}
                  &bull; Refunds {formatCurrency(summary?.totalRefunds ?? '0', baseCur)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Additional Income
                  </span>
                  <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                    <DollarSign className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <DualAmount
                    amount={summary?.additionalIncome ?? '0'}
                    currencyCode={baseCur}
                    className="text-2xl font-bold text-emerald-700"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 border-t border-slate-100 pt-2">
                  Total Cash Inflow: {formatCurrency(summary?.totalInflow ?? '0', baseCur)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Operating Expenses
                  </span>
                  <div className="rounded-xl bg-rose-50 p-2 text-rose-600">
                    <TrendingDown className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <DualAmount
                    amount={summary?.totalExpenses ?? '0'}
                    currencyCode={baseCur}
                    className="text-2xl font-bold text-rose-700"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 border-t border-slate-100 pt-2">
                  Supplier Payments:{' '}
                  {formatCurrency(summary?.purchasePayments ?? '0', baseCur)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Operating Net Cashflow
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      marginPct >= 0
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {marginPct}% margin
                  </span>
                </div>
                <div className="mt-3">
                  <DualAmount
                    amount={summary?.netCashflow ?? '0'}
                    currencyCode={baseCur}
                    className={`text-2xl font-bold ${
                      Number(summary?.netCashflow ?? 0) >= 0
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 border-t border-slate-100 pt-2">
                  Net Pos. (Purchases):{' '}
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(
                      summary?.netPositionIncludingPurchases ??
                        summary?.netCashflow ??
                        '0',
                      baseCur,
                    )}
                  </span>
                </p>
              </div>
            </div>

            {/* Income Statement / P&L Breakdown Table */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Financial Performance & Cashflow Statement
                  </h2>
                  <p className="text-xs text-slate-500">
                    Scope: {branchScope === 'ACTIVE' ? activeBranch?.name : 'Consolidated (All Branches)'} &bull; Currency: {baseCur}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition print:hidden"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Statement
                </button>
              </div>

              <div className="mt-4 divide-y divide-slate-100 text-sm">
                {/* INFLOWS */}
                <div className="py-2.5">
                  <div className="font-semibold text-xs text-slate-500 uppercase tracking-wider mb-2">
                    1. Cash Inflows (Revenue & Non-Retail)
                  </div>
                  <div className="flex justify-between py-1 text-slate-700">
                    <span>Gross Retail Sales</span>
                    <span>{formatCurrency(summary?.grossSales ?? summary?.salesRevenue ?? '0', baseCur)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-rose-600">
                    <span>Less: Customer Returns & Refunds</span>
                    <span>- {formatCurrency(summary?.totalRefunds ?? '0', baseCur)}</span>
                  </div>
                  <div className="flex justify-between py-1 font-medium text-slate-900 border-t border-dashed border-slate-200">
                    <span>Net Sales Revenue</span>
                    <span>{formatCurrency(summary?.salesRevenue ?? '0', baseCur)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-emerald-700">
                    <span>Additional Operating Income</span>
                    <span>+ {formatCurrency(summary?.additionalIncome ?? '0', baseCur)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold text-slate-900 bg-slate-50 px-2 rounded-lg mt-1">
                    <span>Total Cash Inflow</span>
                    <span className="text-emerald-700">{formatCurrency(summary?.totalInflow ?? '0', baseCur)}</span>
                  </div>
                </div>

                {/* OUTFLOWS */}
                <div className="py-2.5">
                  <div className="font-semibold text-xs text-slate-500 uppercase tracking-wider mb-2">
                    2. Cash Outflows (Operational & Procurement)
                  </div>
                  <div className="flex justify-between py-1 text-rose-700">
                    <span>Branch Operating Expenses</span>
                    <span>- {formatCurrency(summary?.totalExpenses ?? '0', baseCur)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-slate-700">
                    <span>Supplier Purchase Payments</span>
                    <span>- {formatCurrency(summary?.purchasePayments ?? '0', baseCur)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold text-slate-900 bg-slate-50 px-2 rounded-lg mt-1">
                    <span>Total Cash Outflow</span>
                    <span className="text-rose-700">{formatCurrency(summary?.totalOutflow ?? '0', baseCur)}</span>
                  </div>
                </div>

                {/* NET POSITION */}
                <div className="pt-3">
                  <div className="flex justify-between py-1.5 text-base font-bold text-slate-900">
                    <span>Operating Net Cashflow (Inflow - Expenses)</span>
                    <span className={netCashflowNum >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                      {formatCurrency(summary?.netCashflow ?? '0', baseCur)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-sm font-semibold text-slate-700">
                    <span>Net Position (After Supplier Payments)</span>
                    <span>
                      {formatCurrency(summary?.netPositionIncludingPurchases ?? summary?.netCashflow ?? '0', baseCur)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Expense Breakdown by Type */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Expenses by Category</h2>
                  <p className="text-xs text-slate-500">
                    Converted to tenant base currency ({baseCur}) for selected scope.
                  </p>
                </div>
                {loading && <span className="text-xs text-slate-400">Refreshing...</span>}
              </div>

              {breakdown.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No expenses recorded in this period.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {breakdown.map((row) => {
                    const pct =
                      maxBreakdown > 0 ? Math.round((Number(row.total) / maxBreakdown) * 100) : 0;
                    return (
                      <div key={row.expenseTypeId} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-800">
                            {row.expenseTypeName}{' '}
                            <span className="text-xs text-slate-400">({row.count} records)</span>
                          </span>
                          <span className="font-bold text-rose-700">
                            {formatCurrency(row.total, baseCur)}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-rose-500"
                            style={{ width: `${Math.max(pct, 4)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* UNIFIED FINANCIAL TRANSACTIONS TAB */}
        {tab === 'transactions' && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Filtered Inflow</p>
                <div className="mt-1">
                  <DualAmount
                    amount={txData?.totalInflow ?? '0'}
                    currencyCode={txData?.currencyCode ?? baseCur}
                    className="text-xl font-bold text-emerald-700"
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Filtered Outflow</p>
                <div className="mt-1">
                  <DualAmount
                    amount={txData?.totalOutflow ?? '0'}
                    currencyCode={txData?.currencyCode ?? baseCur}
                    className="text-xl font-bold text-rose-700"
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Net Flow</p>
                <div className="mt-1">
                  <DualAmount
                    amount={txData?.netAmount ?? '0'}
                    currencyCode={txData?.currencyCode ?? baseCur}
                    className={`text-xl font-bold ${
                      Number(txData?.netAmount ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Ref #</th>
                    <th className="px-4 py-3">Flow</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(txData?.transactions ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                        No financial transactions match the current filters.
                      </td>
                    </tr>
                  ) : (
                    (txData?.transactions ?? []).map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/50 transition">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {new Date(tx.occurredAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                          {tx.referenceNumber}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              tx.direction === 'INFLOW'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {tx.direction === 'INFLOW' ? (
                              <ArrowDownLeft className="h-3 w-3" />
                            ) : (
                              <ArrowUpRight className="h-3 w-3" />
                            )}
                            {TX_TYPE_LABELS[tx.transactionType]}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{tx.category}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{tx.description}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{tx.branchName}</td>
                        <td className="px-4 py-3 text-xs">{tx.paymentMethod ?? '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <DualAmount
                            amount={tx.amount}
                            currencyCode={tx.currencyCode}
                            className={`font-bold ${
                              tx.direction === 'INFLOW' ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{tx.employeeName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* EXPENSES TAB */}
        {tab === 'expenses' && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Expense #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No expenses recorded.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((ex) => (
                      <tr key={ex.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                          <div>{ex.expenseNumber}</div>
                          <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400 font-normal">
                            <span>#{ex.id.slice(0, 8)}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyId(ex.id)}
                              title="Copy Expense ID"
                              className="rounded p-0.5 hover:bg-slate-200"
                            >
                              {copiedId === ex.id ? (
                                <Check className="h-2.5 w-2.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-2.5 w-2.5 text-slate-400" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {new Date(ex.expenseDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{ex.branch.name}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                            {ex.expenseType.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{ex.description || '—'}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-600">
                          {ex.paymentMethod}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <DualAmount
                            amount={ex.amount}
                            currencyCode={ex.currencyCode}
                            className="font-bold text-rose-700"
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {ex.employee?.name ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Expenses Summary Footer */}
            {expenses.length > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700 border border-slate-200">
                <span>Total Filtered Expenses ({expenses.length} records):</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-rose-700">
                    {formatCurrency(totalFilteredExpensesUsd, 'USD')}
                  </span>
                  <span className="block text-[10px] font-normal text-slate-500">
                    &asymp; {formatCurrency(totalFilteredExpensesUsd * EXCHANGE_RATE, 'KHR')}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ADDITIONAL INCOME TAB */}
        {tab === 'incomes' && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Income #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {incomes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No additional income recorded.
                      </td>
                    </tr>
                  ) : (
                    incomes.map((inc) => (
                      <tr key={inc.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                          {inc.incomeNumber}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {new Date(inc.incomeDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{inc.branch.name}</td>
                        <td className="px-4 py-3 text-slate-700 font-medium text-xs">
                          {inc.description || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <DualAmount
                            amount={inc.amount}
                            currencyCode={inc.currencyCode}
                            className="font-bold text-emerald-700"
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {inc.employee?.name ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Income Summary Footer */}
            {incomes.length > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700 border border-slate-200">
                <span>Total Filtered Income ({incomes.length} records):</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-emerald-700">
                    {formatCurrency(totalFilteredIncomeUsd, 'USD')}
                  </span>
                  <span className="block text-[10px] font-normal text-slate-500">
                    &asymp; {formatCurrency(totalFilteredIncomeUsd * EXCHANGE_RATE, 'KHR')}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* EXPENSE TYPES TAB */}
        {tab === 'types' && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Expenses Logged</th>
                  <th className="px-4 py-3">Status</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenseTypes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManage ? 5 : 4}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No expense types configured yet.
                    </td>
                  </tr>
                ) : (
                  expenseTypes.map((et) => (
                    <tr key={et.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{et.name}</div>
                        <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                          <span>#{et.id.slice(0, 8)}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyId(et.id)}
                            title="Copy Expense Type ID"
                            className="rounded p-0.5 hover:bg-slate-200"
                          >
                            {copiedId === et.id ? (
                              <Check className="h-2.5 w-2.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-2.5 w-2.5 text-slate-400" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{et.description || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{et._count?.expenses ?? 0}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            et.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {et.status}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditTypeModal(et)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                            >
                              <Edit2 className="h-3 w-3" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleTypeStatus(et)}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                                et.status === 'ACTIVE'
                                  ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                                  : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {et.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Expense Type Modal (Create / Edit) */}
        {typeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-slate-900">
                {editingType ? 'Edit Expense Type' : t.finance.addExpenseType}
              </h2>
              {typeError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {typeError}
                </div>
              )}
              <form onSubmit={handleSaveType} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Category Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={typeName}
                    onChange={(e) => setTypeName(e.target.value)}
                    placeholder="Electricity / Rent / Delivery / Office Supplies"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Description</label>
                  <input
                    value={typeDesc}
                    onChange={(e) => setTypeDesc(e.target.value)}
                    placeholder="Brief description of expenses under this category"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                {editingType && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Status</label>
                    <select
                      value={typeStatus}
                      onChange={(e) => setTypeStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setTypeModal(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
                    <span>{t.common.save}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Record Expense Modal */}
        {expModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-slate-900">{t.finance.addExpense}</h2>
              <p className="text-xs text-slate-500">Record a branch-level operational expenditure.</p>
              {expError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {expError}
                </div>
              )}
              <form onSubmit={handleCreateExpense} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Expense Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={expTypeId}
                    onChange={(e) => setExpTypeId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    {activeExpenseTypes.map((et) => (
                      <option key={et.id} value={et.id}>
                        {et.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Amount <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      placeholder="0.00"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Currency</label>
                    <select
                      value={expCur}
                      onChange={(e) => setExpCur(e.target.value as CurrencyCode)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="KHR">KHR (៛)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Payment Method
                    </label>
                    <select
                      value={expMethod}
                      onChange={(e) => setExpMethod(e.target.value as PaymentMethod)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Date</label>
                    <input
                      type="date"
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Description</label>
                  <input
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    placeholder="Invoice # or expenditure details"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setExpModal(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 transition"
                  >
                    {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
                    <span>{t.common.save}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Record Additional Income Modal */}
        {incModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-slate-900">{t.finance.addIncome}</h2>
              <p className="text-xs text-slate-500">Log non-POS additional revenue for this store.</p>
              {incError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {incError}
                </div>
              )}
              <form onSubmit={handleCreateIncome} className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Amount <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={incAmount}
                      onChange={(e) => setIncAmount(e.target.value)}
                      placeholder="0.00"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Currency</label>
                    <select
                      value={incCur}
                      onChange={(e) => setIncCur(e.target.value as CurrencyCode)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="KHR">KHR (៛)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Date</label>
                  <input
                    type="date"
                    value={incDate}
                    onChange={(e) => setIncDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={incDesc}
                    onChange={(e) => setIncDesc(e.target.value)}
                    placeholder="Delivery fee rebate / Recycling / Service income / Scrap sale"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIncModal(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
                    <span>{t.common.save}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
