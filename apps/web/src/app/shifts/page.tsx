'use client';

import { formatCurrency, type CurrencyCode } from '@cambodia-pos/shared';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  Eye,
  FileText,
  Filter,
  Lock,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Unlock,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTablePagination } from '@/components/DataTablePagination';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

const EXCHANGE_RATE = 4100;

interface ShiftRow {
  id: string;
  shiftNumber: string;
  openingCash: string;
  expectedCash: string;
  actualCash: string | null;
  closingCash?: string | null;
  cashDifference: string | null;
  notes?: string | null;
  openedAt: string;
  closedAt: string | null;
  status: 'OPEN' | 'CLOSED';
  branch: { id: string; name: string; branchCode?: string };
  employee: { id: string; name: string; employeeCode?: string };
  _count?: { orders: number };
}

interface ShiftDetail extends ShiftRow {
  orders?: Array<{
    id: string;
    orderNumber: string;
    totalAmount: string;
    currencyCode: CurrencyCode;
    status: string;
    createdAt: string;
    payments?: Array<{
      paymentMethod: string;
      amount: string;
      currencyCode: CurrencyCode;
    }>;
  }>;
}

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

export default function ShiftsPage() {
  const { activeTenant, activeBranch, hasPermission } = useAuth();
  const { t } = useI18n();
  const canManageShifts = hasPermission('shifts.manage');

  const cur = (activeTenant?.defaultCurrency ?? 'USD') as CurrencyCode;

  const [currentShift, setCurrentShift] = useState<ShiftRow | null>(null);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filters & Search
  const [branchScope, setBranchScope] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Open Shift Form State
  const [openModal, setOpenModal] = useState(false);
  const [openingCash, setOpeningCash] = useState('100.00');
  const [openingNotes, setOpeningNotes] = useState('');
  const [openingCashCur, setOpeningCashCur] = useState<CurrencyCode>(cur);
  const [openingBranchId, setOpeningBranchId] = useState('');
  const [openingSaving, setOpeningSaving] = useState(false);

  // Close Shift Form State
  const [actualCash, setActualCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [closingSaving, setClosingSaving] = useState(false);

  // Shift Detail Modal
  const [detail, setDetail] = useState<ShiftDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2000);
  };

  const loadAll = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const qs = branchScope === 'ACTIVE' && activeBranch ? `?branchId=${activeBranch.id}` : '';
      const [curr, hist] = await Promise.all([
        apiRequest<ShiftRow | null>(`/shifts/current${qs}`),
        apiRequest<ShiftRow[]>(`/shifts${qs}`),
      ]);
      setCurrentShift(curr);
      setShifts(hist);
      if (curr) {
        setActualCash(curr.expectedCash);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load shift records');
    } finally {
      setLoading(false);
    }
  }, [activeTenant, activeBranch, branchScope]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (activeBranch) {
      setOpeningBranchId(activeBranch.id);
    }
  }, [activeBranch]);

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const branchId = openingBranchId || activeBranch?.id;
    if (!branchId) {
      setError('Please select an active store branch.');
      return;
    }
    setError(null);
    setOpeningSaving(true);
    try {
      await apiRequest('/shifts/open', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          openingCash,
          notes: openingNotes.trim() ? openingNotes.trim() : undefined,
        }),
      });
      setFeedback('Cashier shift opened successfully.');
      setOpenModal(false);
      setOpeningNotes('');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to open shift');
    } finally {
      setOpeningSaving(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShift) return;
    setError(null);
    setClosingSaving(true);
    try {
      await apiRequest(`/shifts/${currentShift.id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          actualCash,
          closingCash: actualCash,
          notes: closingNotes.trim() ? closingNotes.trim() : undefined,
          closingNotes: closingNotes.trim() ? closingNotes.trim() : undefined,
        }),
      });
      setFeedback('Shift closed and drawer cash reconciled.');
      setClosingNotes('');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to close shift');
    } finally {
      setClosingSaving(false);
    }
  };

  const openShiftDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await apiRequest<ShiftDetail>(`/shifts/${id}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load shift report');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Live closing variance calculation
  const closingVariance = useMemo(() => {
    if (!currentShift) return null;
    const actual = parseFloat(actualCash || '0') || 0;
    const expected = parseFloat(currentShift.expectedCash || '0') || 0;
    const diff = actual - expected;
    return {
      actual,
      expected,
      diff,
      isBalanced: Math.abs(diff) < 0.005,
      isShortage: diff < -0.005,
      isOverage: diff > 0.005,
    };
  }, [currentShift, actualCash]);

  // Filtered shift history
  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (startDate && new Date(s.openedAt) < new Date(startDate)) return false;
      if (endDate && new Date(s.openedAt) > new Date(endDate + 'T23:59:59')) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = s.id.toLowerCase().includes(q);
        const matchesNumber = s.shiftNumber.toLowerCase().includes(q);
        const matchesCashier =
          s.employee.name.toLowerCase().includes(q) ||
          (s.employee.employeeCode?.toLowerCase().includes(q) ?? false);
        const matchesBranch =
          s.branch.name.toLowerCase().includes(q) ||
          (s.branch.branchCode?.toLowerCase().includes(q) ?? false);
        const matchesNotes = s.notes ? s.notes.toLowerCase().includes(q) : false;
        if (!matchesId && !matchesNumber && !matchesCashier && !matchesBranch && !matchesNotes)
          return false;
      }
      return true;
    });
  }, [shifts, statusFilter, search, startDate, endDate]);

  const paginatedShifts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredShifts.slice(start, start + pageSize);
  }, [filteredShifts, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, branchScope, startDate, endDate]);

  const formatDuration = (openedStr: string, closedStr: string | null) => {
    const start = new Date(openedStr).getTime();
    const end = closedStr ? new Date(closedStr).getTime() : Date.now();
    const diffMins = Math.max(1, Math.round((end - start) / 60000));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-6 w-6 text-emerald-600" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {t.shifts?.title ?? 'Cashier Shifts & Reconciliation'}
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {t.shifts?.subtitle ??
                'Manage cashier drawer sessions, opening floats, cash drawer sales, and closing reconciliation.'}
            </p>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
              title={t.common.refresh}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t.common.refresh}</span>
            </button>
            {canManageShifts && !currentShift && (
              <button
                type="button"
                onClick={() => setOpenModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                <Unlock className="h-4 w-4" />
                {t.shifts?.openShift ?? 'Open Shift'}
              </button>
            )}
          </div>
        </div>

        {/* Feedback / Error Alerts */}
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

        {/* 4 Shift KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Register State
              </span>
              <div
                className={`rounded-xl p-2.5 ${
                  currentShift ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {currentShift ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {currentShift ? (
                <>
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <span className="text-lg font-bold text-emerald-700">
                    {currentShift.shiftNumber}
                  </span>
                </>
              ) : (
                <span className="text-lg font-bold text-slate-600">Register Closed</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {currentShift
                ? `${currentShift.branch.name} · ${currentShift.employee.name}`
                : 'No active session running'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Starting Cash Float
              </span>
              <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                <Wallet className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <DualAmount
                amount={currentShift?.openingCash ?? '0'}
                currencyCode={cur}
                className="text-2xl font-bold text-slate-900"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">Drawer base at opening</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Expected Drawer Cash
              </span>
              <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <DualAmount
                amount={currentShift?.expectedCash ?? '0'}
                currencyCode={cur}
                className="text-2xl font-bold text-emerald-700"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Float + Cash Sales &minus; Refunds
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Orders
              </span>
              <div className="rounded-xl bg-purple-50 p-2.5 text-purple-600">
                <ShoppingBag className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {currentShift?._count?.orders ?? 0}
              </span>
              <span className="text-xs text-slate-500">sales logged in shift</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {currentShift ? `Opened ${formatDuration(currentShift.openedAt, null)} ago` : '—'}
            </p>
          </div>
        </div>

        {/* Current Active Shift / Open Register Hero Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {currentShift ? (
            <div className="space-y-6">
              {/* Active Shift Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold text-slate-900">
                        {currentShift.shiftNumber}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        {currentShift.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                      <span className="font-medium text-slate-700">{currentShift.branch.name}</span>
                      <span>&bull;</span>
                      <span>Cashier: {currentShift.employee.name}</span>
                      <span>&bull;</span>
                      <span>Opened: {new Date(currentShift.openedAt).toLocaleTimeString()} ({formatDuration(currentShift.openedAt, null)})</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href="/pos"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Open POS Terminal <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>

              {/* Drawer Cash Live Matrix */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    1. Opening Float
                  </span>
                  <div className="mt-2 text-xl font-bold text-slate-900">
                    {formatCurrency(currentShift.openingCash, cur)}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Counted at drawer start
                  </span>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    2. Net Cash Inflow
                  </span>
                  <div className="mt-2 text-xl font-bold text-emerald-700">
                    +{formatCurrency(
                      Math.max(
                        0,
                        parseFloat(currentShift.expectedCash) - parseFloat(currentShift.openingCash),
                      ),
                      cur,
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Cash sales &minus; cash refunds
                  </span>
                </div>

                <div className="rounded-xl bg-emerald-50/60 p-4 border border-emerald-100">
                  <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">
                    3. Current Expected Cash
                  </span>
                  <div className="mt-2 text-xl font-bold text-emerald-700">
                    {formatCurrency(currentShift.expectedCash, cur)}
                  </div>
                  <span className="text-[10px] text-emerald-600 block mt-0.5">
                    Target amount for drawer count
                  </span>
                </div>
              </div>

              {/* Close Shift Reconciliation Drawer */}
              {canManageShifts && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-slate-700" />
                      <h3 className="text-sm font-bold text-slate-900">
                        {t.shifts?.closeShift ?? 'Reconcile & Close Cashier Register'}
                      </h3>
                    </div>
                    {closingVariance && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          closingVariance.isBalanced
                            ? 'bg-emerald-100 text-emerald-800'
                            : closingVariance.isShortage
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {closingVariance.isBalanced
                          ? 'Balanced (Exact match)'
                          : closingVariance.isShortage
                          ? `Shortage: -${formatCurrency(Math.abs(closingVariance.diff), cur)}`
                          : `Overage: +${formatCurrency(closingVariance.diff, cur)}`}
                      </span>
                    )}
                  </div>

                  <form onSubmit={handleCloseShift} className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-semibold text-slate-700">
                            {t.shifts?.actualCash ?? 'Actual Physical Cash Count'} ({cur}){' '}
                            <span className="text-red-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setActualCash(currentShift.expectedCash)}
                            className="text-[11px] font-semibold text-emerald-700 hover:underline"
                          >
                            Match Expected ({formatCurrency(currentShift.expectedCash, cur)})
                          </button>
                        </div>
                        <input
                          required
                          value={actualCash}
                          onChange={(e) => setActualCash(e.target.value)}
                          placeholder="0.00"
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          {t.shifts?.reconciliationNotes ?? 'Closing Notes / Denominations'}
                        </label>
                        <input
                          value={closingNotes}
                          onChange={(e) => setClosingNotes(e.target.value)}
                          placeholder="Denominations counted, handover notes, or variance explanation..."
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={closingSaving}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
                      >
                        {closingSaving ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                        <span>{t.shifts?.reconcileAndClose ?? 'Reconcile & Close Register'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-6 py-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Lock className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {t.shifts?.noActiveShift ?? 'No Active Open Shift'}
                  </h2>
                  <p className="text-xs text-slate-500 max-w-md mt-0.5">
                    {t.shifts?.noActiveShiftSubtitle ??
                      'Open a shift for this store branch to accept cash orders and track cash drawer float.'}
                  </p>
                </div>
              </div>

              {canManageShifts && (
                <button
                  type="button"
                  onClick={() => setOpenModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                >
                  <Unlock className="h-4 w-4" />
                  <span>{t.shifts?.openDrawer ?? 'Open Cashier Shift'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Shift History Section */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {t.shifts?.shiftHistory ?? 'Shift History & Reconciliation Ledger'}
              </h2>
              <p className="text-xs text-slate-500">
                Complete chronological audit log of all register openings and closings.
              </p>
            </div>

            {/* Filter Strip */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Shift #, cashier, notes, branch..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'OPEN' | 'CLOSED')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All Status</option>
                <option value="OPEN">OPEN</option>
                <option value="CLOSED">CLOSED</option>
              </select>

              <select
                value={branchScope}
                onChange={(e) => setBranchScope(e.target.value as 'ACTIVE' | 'ALL')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none"
              >
                <option value="ACTIVE">{activeBranch?.name ?? 'Current Branch'}</option>
                <option value="ALL">All Branches</option>
              </select>

              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-xs">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 focus:outline-none"
                  aria-label="Start date filter"
                />
                <span className="text-slate-400">&ndash;</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 focus:outline-none"
                  aria-label="End date filter"
                />
              </div>

              {(search || startDate || endDate || statusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStartDate('');
                    setEndDate('');
                    setStatusFilter('ALL');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Shift Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Shift ID</th>
                    <th className="px-5 py-3.5">Shift #</th>
                    <th className="px-5 py-3.5">Cashier</th>
                    <th className="px-5 py-3.5">Branch</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Starting Float</th>
                    <th className="px-5 py-3.5">Expected Cash</th>
                    <th className="px-5 py-3.5">Closing Cash</th>
                    <th className="px-5 py-3.5">Variance</th>
                    <th className="px-5 py-3.5">Notes</th>
                    <th className="px-5 py-3.5">Time Frame</th>
                    <th className="px-5 py-3.5">Orders</th>
                    <th className="px-5 py-3.5 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={13} className="px-5 py-12 text-center text-slate-500">
                        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
                        <span className="mt-2 block text-xs">{t.common.loading}</span>
                      </td>
                    </tr>
                  ) : filteredShifts.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-5 py-12 text-center text-slate-500">
                        <Clock className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-2 text-sm font-medium text-slate-900">{t.common.noData}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          No shifts match the current search or filters.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedShifts.map((s) => {
                      const diffNum = s.cashDifference ? parseFloat(s.cashDifference) : 0;
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-5 py-4 font-mono text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500 font-medium">
                                {s.id.slice(0, 8)}...
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(s.id, s.id)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                                title="Copy full UUID"
                              >
                                {copiedId === s.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-5 py-4 font-mono font-semibold text-slate-900">
                            <button
                              type="button"
                              onClick={() => void openShiftDetail(s.id)}
                              className="font-bold text-emerald-700 hover:underline"
                            >
                              {s.shiftNumber}
                            </button>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 font-semibold text-xs text-slate-700">
                                {s.employee.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium text-slate-800 text-xs">
                                  {s.employee.name}
                                </div>
                                {s.employee.employeeCode && (
                                  <div className="font-mono text-[10px] text-slate-400">
                                    {s.employee.employeeCode}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-xs text-slate-600">
                            <div className="font-medium text-slate-800">{s.branch.name}</div>
                            {s.branch.branchCode && (
                              <div className="font-mono text-[10px] text-slate-400">
                                {s.branch.branchCode}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                s.status === 'OPEN'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {s.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-medium text-slate-700">
                            <DualAmount amount={s.openingCash} currencyCode={cur} />
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-900">
                            <DualAmount amount={s.expectedCash} currencyCode={cur} />
                          </td>
                          <td className="px-5 py-4 font-bold text-slate-900">
                            {s.closingCash !== null && s.closingCash !== undefined ? (
                              <DualAmount amount={s.closingCash} currencyCode={cur} />
                            ) : s.actualCash !== null ? (
                              <DualAmount amount={s.actualCash} currencyCode={cur} />
                            ) : (
                              <span className="text-slate-400 font-normal">&mdash;</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {s.cashDifference !== null ? (
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  Math.abs(diffNum) < 0.005
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : diffNum < 0
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                                }`}
                              >
                                {diffNum > 0 ? '+' : ''}
                                {formatCurrency(s.cashDifference, cur)}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">&mdash;</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-xs text-slate-500 max-w-[130px] truncate">
                            {s.notes ? (
                              <span
                                className="inline-flex items-center gap-1 text-slate-700"
                                title={s.notes}
                              >
                                <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">{s.notes}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">&mdash;</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-xs text-slate-500">
                            <div>{new Date(s.openedAt).toLocaleDateString()}</div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(s.openedAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {' '}&rarr;{' '}
                              {s.closedAt
                                ? new Date(s.closedAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Active'}{' '}
                              ({formatDuration(s.openedAt, s.closedAt)})
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {s._count?.orders ?? 0}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => void openShiftDetail(s.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
                            >
                              <Eye className="h-3.5 w-3.5 text-slate-400" />
                              <span>Slip</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <DataTablePagination
            currentPage={page}
            pageSize={pageSize}
            totalItems={filteredShifts.length}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            itemName="shifts"
          />
        </div>

        {/* Open Shift Modal */}
        {openModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                    <Unlock className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {t.shifts?.openShift ?? 'Open Cashier Shift'}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Set up opening cash float to begin cashier terminal operations.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleOpenShift} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    {t.shifts?.branch ?? 'Store Branch'}
                  </label>
                  <input
                    disabled
                    value={activeBranch?.name ?? 'Main Branch'}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    {t.shifts?.openingCash ?? 'Starting Cash Float'} ({cur}){' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    placeholder="100.00"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-base font-bold text-slate-900 focus:border-emerald-500 focus:outline-none"
                  />

                  {/* Quick Float Chips */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['50.00', '100.00', '200.00', '400.00'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setOpeningCash(preset)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {formatCurrency(preset, cur)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Opening Notes / Starting Remarks (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={openingNotes}
                    onChange={(e) => setOpeningNotes(e.target.value)}
                    placeholder="Morning float notes, register remarks, cash drawer condition..."
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setOpenModal(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={openingSaving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {openingSaving && <RefreshCw className="h-4 w-4 animate-spin" />}
                    <span>{t.shifts?.openDrawer ?? 'Open Register'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Shift Details & Reconciliation Slip Modal */}
        {detail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm print:p-0 print:bg-white">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto print:max-h-none print:shadow-none print:p-6">
              {/* Slip Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">
                        {t.shifts?.shiftDetails ?? 'Shift Reconciliation Report'}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          detail.status === 'OPEN'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {detail.status}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {detail.shiftNumber} &bull; {detail.branch.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px] text-slate-500">
                      <span>ID: {detail.id}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(detail.id, `modal-${detail.id}`)}
                        className="rounded p-0.5 text-slate-400 hover:text-slate-700 transition"
                        title="Copy UUID"
                      >
                        {copiedId === `modal-${detail.id}` ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Print Slip</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetail(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Information Grid */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-slate-50 p-4 text-xs">
                <div>
                  <span className="text-slate-400 block">Cashier</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block">
                    {detail.employee.name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Opened At</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block">
                    {new Date(detail.openedAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Closed At</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block">
                    {detail.closedAt ? new Date(detail.closedAt).toLocaleString() : 'Active'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Duration</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block">
                    {formatDuration(detail.openedAt, detail.closedAt)}
                  </span>
                </div>
              </div>

              {/* Shift Notes Banner if available */}
              {detail.notes && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900">
                  <span className="font-semibold block text-amber-950 mb-0.5">Shift Notes / Remarks:</span>
                  <p className="whitespace-pre-wrap">{detail.notes}</p>
                </div>
              )}

              {/* Cash Reconciliation Summary Matrix */}
              <div className="mt-5 rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                <div className="flex justify-between p-3.5 bg-slate-50/70 font-semibold text-slate-700">
                  <span>Starting Cash Float</span>
                  <span>{formatCurrency(detail.openingCash, cur)}</span>
                </div>
                <div className="flex justify-between p-3.5 text-slate-700">
                  <span>Net Cash Sales / Adjustments</span>
                  <span className="font-medium text-emerald-700">
                    +{formatCurrency(
                      Math.max(0, parseFloat(detail.expectedCash) - parseFloat(detail.openingCash)),
                      cur,
                    )}
                  </span>
                </div>
                <div className="flex justify-between p-3.5 font-bold text-slate-900 bg-slate-50/40">
                  <span>Expected Drawer Cash</span>
                  <span>{formatCurrency(detail.expectedCash, cur)}</span>
                </div>
                <div className="flex justify-between p-3.5 font-bold text-slate-900">
                  <span>Actual / Closing Cash Counted</span>
                  <span className="text-base">
                    {detail.closingCash !== null && detail.closingCash !== undefined
                      ? formatCurrency(detail.closingCash, cur)
                      : detail.actualCash !== null
                      ? formatCurrency(detail.actualCash, cur)
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between p-3.5 font-bold">
                  <span>Reconciliation Discrepancy</span>
                  <span
                    className={
                      detail.cashDifference && parseFloat(detail.cashDifference) < 0
                        ? 'text-rose-700'
                        : detail.cashDifference && parseFloat(detail.cashDifference) > 0
                        ? 'text-blue-700'
                        : 'text-emerald-700'
                    }
                  >
                    {detail.cashDifference !== null
                      ? `${parseFloat(detail.cashDifference) > 0 ? '+' : ''}${formatCurrency(
                          detail.cashDifference,
                          cur,
                        )}`
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Shift Orders List */}
              {detail.orders && detail.orders.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Orders Processed in Shift ({detail.orders.length})
                  </h3>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                    {detail.orders.map((o) => (
                      <div key={o.id} className="flex items-center justify-between p-2.5">
                        <div>
                          <span className="font-mono font-semibold text-slate-900">
                            {o.orderNumber}
                          </span>
                          <span className="text-slate-400 ml-2">
                            {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-900">
                          {formatCurrency(o.totalAmount, o.currencyCode)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4 print:hidden">
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="rounded-xl bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition"
                >
                  {t.common.close}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
