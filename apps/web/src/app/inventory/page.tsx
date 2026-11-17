'use client';

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  FileText,
  History,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  User,
  Warehouse,
  X,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTablePagination } from '@/components/DataTablePagination';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

interface BalanceRow {
  id: string;
  quantity: string;
  isLowStock: boolean;
  branch: { name: string; branchCode: string };
  product: {
    id: string;
    sku: string;
    barcode?: string | null;
    name: string;
    lowStockAlert: string;
    unit?: { abbreviation: string };
  };
}

interface MovementRow {
  id: string;
  tenantId?: string;
  branchId?: string;
  productId: string;
  movementType: string;
  quantityIn: string;
  quantityOut: string;
  balanceAfter: string;
  referenceType?: string | null;
  referenceId?: string | null;
  notes: string | null;
  createdBy?: string;
  createdAt: string;
  branch: { id?: string; name: string; branchCode?: string };
  product: { id: string; name: string; sku: string; barcode?: string | null };
  employee?: { id?: string; name: string; employeeCode?: string } | null;
}

interface AdjustmentRow {
  id: string;
  adjustmentNumber: string;
  reason: string;
  status: string;
  adjustmentDate: string;
  createdAt: string;
  branch: { name: string };
  employee: { name: string };
  approver?: { name: string } | null;
}

interface AdjustmentDetail extends AdjustmentRow {
  movements: Array<{
    id: string;
    movementType: string;
    quantityIn: string;
    quantityOut: string;
    balanceAfter: string;
    notes: string | null;
    createdAt: string;
    product: { id: string; sku: string; name: string };
  }>;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  trackInventory: boolean;
  lowStockAlert: string;
}

interface ProductHistoryInfo {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  unit?: { abbreviation: string };
  branchName: string;
  currentStock: string;
}

const MOVEMENT_TYPES = [
  'opening_stock',
  'purchase_in',
  'sale_out',
  'sale_return_in',
  'adjustment_in',
  'adjustment_out',
  'transfer_in',
  'transfer_out',
] as const;

type TabKey = 'overview' | 'movements' | 'adjustments' | 'low_stock';

export default function InventoryPage() {
  const { activeTenant, activeBranch, hasPermission } = useAuth();
  const { t } = useI18n();
  const canAdjust = hasPermission('inventory.adjust');

  const [tab, setTab] = useState<TabKey>('overview');
  const [search, setSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('ALL');
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pagination State
  const [movementPage, setMovementPage] = useState(1);
  const [movementPageSize, setMovementPageSize] = useState(25);

  const handleCopyId = (id: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
  };

  // New Stock Adjustment Modal State
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [submittingAdj, setSubmittingAdj] = useState(false);
  const [adjReason, setAdjReason] = useState('Cycle count correction');
  const [adjItems, setAdjItems] = useState<
    Array<{ productId: string; direction: 'IN' | 'OUT'; quantity: string; notes: string }>
  >([]);

  // Adjustment Details Voucher Modal
  const [selectedAdjustment, setSelectedAdjustment] = useState<AdjustmentDetail | null>(null);
  const [voucherModal, setVoucherModal] = useState(false);
  const [loadingVoucher, setLoadingVoucher] = useState(false);

  // Product Stock History Ledger Modal
  const [historyModal, setHistoryModal] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<ProductHistoryInfo | null>(null);
  const [historyMovements, setHistoryMovements] = useState<MovementRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadAll = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const balQs = new URLSearchParams();
      if (activeBranch) balQs.set('branchId', activeBranch.id);

      const movQs = new URLSearchParams();
      if (activeBranch) movQs.set('branchId', activeBranch.id);

      const adjQs = new URLSearchParams();
      if (activeBranch) adjQs.set('branchId', activeBranch.id);

      const [bals, movs, adjs, prods] = await Promise.all([
        apiRequest<BalanceRow[]>(`/inventory/balances?${balQs.toString()}`),
        apiRequest<MovementRow[]>(`/inventory/movements?${movQs.toString()}`),
        apiRequest<AdjustmentRow[]>(`/inventory/adjustments?${adjQs.toString()}`),
        apiRequest<ProductOption[]>('/products?status=ACTIVE'),
      ]);
      setBalances(bals);
      setMovements(movs);
      setAdjustments(adjs);
      setProducts(prods.filter((p) => p.trackInventory));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load inventory data');
    } finally {
      setLoading(false);
    }
  }, [activeTenant, activeBranch]);

  useEffect(() => {
    void loadAll().catch(() => {});
  }, [loadAll]);

  // Open New Adjustment Modal
  const openAdjustmentModal = (prefillProductId?: string, direction: 'IN' | 'OUT' = 'IN', qty = '1') => {
    setAdjError(null);
    setAdjReason(direction === 'IN' ? 'Stock count variance recovery' : 'Stock count variance deduction');
    const targetProd = prefillProductId
      ? products.find((p) => p.id === prefillProductId) ?? products[0]
      : products[0];

    setAdjItems(
      targetProd
        ? [{ productId: targetProd.id, direction, quantity: qty, notes: '' }]
        : [],
    );
    setAdjOpen(true);
  };

  const submitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranch) return;
    setAdjError(null);
    if (adjItems.length === 0) {
      setAdjError('Add at least one tracked product to adjust.');
      return;
    }
    setSubmittingAdj(true);
    try {
      await apiRequest('/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          branchId: activeBranch.id,
          reason: adjReason,
          items: adjItems.map((it) => ({
            productId: it.productId,
            direction: it.direction,
            quantity: it.quantity,
            ...(it.notes.trim() ? { notes: it.notes.trim() } : {}),
          })),
        }),
      });
      setAdjOpen(false);
      setFeedback('Stock adjustment applied and movement ledger recorded.');
      await loadAll();
    } catch (err) {
      setAdjError(err instanceof ApiClientError ? err.message : 'Stock adjustment failed');
    } finally {
      setSubmittingAdj(false);
    }
  };

  // Open Adjustment Details Voucher
  const openAdjustmentVoucher = async (adjId: string) => {
    setLoadingVoucher(true);
    setVoucherModal(true);
    try {
      const data = await apiRequest<AdjustmentDetail>(`/inventory/adjustments/${adjId}`);
      setSelectedAdjustment(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load adjustment voucher');
    } finally {
      setLoadingVoucher(false);
    }
  };

  // Open Product Stock History Ledger
  const openStockHistory = async (b: BalanceRow) => {
    setHistoryProduct({
      id: b.product.id,
      name: b.product.name,
      sku: b.product.sku,
      barcode: b.product.barcode,
      unit: b.product.unit,
      branchName: b.branch.name,
      currentStock: b.quantity,
    });
    setHistoryModal(true);
    setLoadingHistory(true);
    try {
      const qs = new URLSearchParams();
      qs.set('productId', b.product.id);
      if (activeBranch) qs.set('branchId', activeBranch.id);
      const data = await apiRequest<MovementRow[]>(`/inventory/movements?${qs.toString()}`);
      setHistoryMovements(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load stock history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Filter Logic
  const q = search.trim().toLowerCase();

  const filteredBalances = balances.filter(
    (b) =>
      !q ||
      b.product.name.toLowerCase().includes(q) ||
      b.product.sku.toLowerCase().includes(q) ||
      (b.product.barcode ?? '').toLowerCase().includes(q) ||
      b.branch.name.toLowerCase().includes(q),
  );

  const lowStockBalances = balances.filter((b) => b.isLowStock);
  const filteredLowStock = lowStockBalances.filter(
    (b) =>
      !q ||
      b.product.name.toLowerCase().includes(q) ||
      b.product.sku.toLowerCase().includes(q) ||
      (b.product.barcode ?? '').toLowerCase().includes(q) ||
      b.branch.name.toLowerCase().includes(q),
  );

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const matchesSearch =
        !q ||
        m.id.toLowerCase().includes(q) ||
        m.product.name.toLowerCase().includes(q) ||
        m.product.sku.toLowerCase().includes(q) ||
        (m.product.barcode ?? '').toLowerCase().includes(q) ||
        (m.notes ?? '').toLowerCase().includes(q) ||
        m.branch.name.toLowerCase().includes(q) ||
        (m.referenceType ?? '').toLowerCase().includes(q) ||
        (m.referenceId ?? '').toLowerCase().includes(q) ||
        (m.employee?.name ?? '').toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (movementTypeFilter !== 'ALL' && m.movementType !== movementTypeFilter) return false;
      return true;
    });
  }, [movements, q, movementTypeFilter]);

  const paginatedMovements = useMemo(() => {
    const start = (movementPage - 1) * movementPageSize;
    return filteredMovements.slice(start, start + movementPageSize);
  }, [filteredMovements, movementPage, movementPageSize]);

  const filteredAdjustments = adjustments.filter(
    (a) =>
      !q ||
      a.adjustmentNumber.toLowerCase().includes(q) ||
      a.reason.toLowerCase().includes(q) ||
      a.employee.name.toLowerCase().includes(q) ||
      a.branch.name.toLowerCase().includes(q),
  );

  // Metric Counters
  const totalTrackedSKUs = balances.length;
  const totalUnitsOnHand = balances.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
  const lowStockCount = balances.filter((b) => b.isLowStock && Number(b.quantity) > 0).length;
  const outOfStockCount = balances.filter((b) => Number(b.quantity) <= 0).length;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.inventory.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{t.inventory.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
              {t.common.refresh}
            </button>
            {canAdjust && (
              <button
                type="button"
                onClick={() => openAdjustmentModal()}
                disabled={products.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {t.inventory.newAdjustment}
              </button>
            )}
          </div>
        </div>

        {/* Global Inventory Metric Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div
            onClick={() => setTab('overview')}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Tracked Products
              </span>
              <Package className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{totalTrackedSKUs}</p>
            <span className="text-xs text-slate-500">Active inventory SKUs</span>
          </div>

          <div
            onClick={() => setTab('overview')}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total On-Hand
              </span>
              <Warehouse className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-600">
              {totalUnitsOnHand.toLocaleString()}
            </p>
            <span className="text-xs text-slate-500">Units in physical stock</span>
          </div>

          <div
            onClick={() => setTab('low_stock')}
            className={`cursor-pointer rounded-xl border p-4 shadow-sm transition ${
              tab === 'low_stock'
                ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-400'
                : 'border-slate-200 bg-white hover:border-amber-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Low Stock Alerts
              </span>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-600">{lowStockCount}</p>
            <span className="text-xs text-amber-700">Below minimum threshold</span>
          </div>

          <div
            onClick={() => setTab('low_stock')}
            className={`cursor-pointer rounded-xl border p-4 shadow-sm transition ${
              tab === 'low_stock'
                ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-400'
                : 'border-slate-200 bg-white hover:border-rose-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                Out of Stock
              </span>
              <XCircle className="h-4 w-4 text-rose-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-rose-600">{outOfStockCount}</p>
            <span className="text-xs text-rose-700">Depleted items</span>
          </div>
        </div>

        {/* Tab Navigation & Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab('overview')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                tab === 'overview'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Warehouse className="h-4 w-4" />
              {t.inventory.stockOverview} ({balances.length})
            </button>

            <button
              type="button"
              onClick={() => setTab('low_stock')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                tab === 'low_stock'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              {t.inventory.lowStockProducts} ({lowStockBalances.length})
            </button>

            <button
              type="button"
              onClick={() => setTab('movements')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                tab === 'movements'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ArrowLeftRight className="h-4 w-4" />
              {t.inventory.stockMovements} ({movements.length})
            </button>

            <button
              type="button"
              onClick={() => setTab('adjustments')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                tab === 'adjustments'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              {t.inventory.stockAdjustments} ({adjustments.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab === 'movements' && (
              <select
                aria-label="Filter movements by type"
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All Movement Types</option>
                {MOVEMENT_TYPES.map((mt) => (
                  <option key={mt} value={mt}>
                    {mt}
                  </option>
                ))}
              </select>
            )}

            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  tab === 'overview' || tab === 'low_stock'
                    ? 'Product name, SKU, barcode...'
                    : tab === 'movements'
                      ? 'Product, SKU, reason...'
                      : 'Adjustment # or reason...'
                }
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {feedback && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {feedback}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Tab Content Tables */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            {loading ? (
              <p className="p-8 text-center text-sm text-slate-500">{t.common.loading}</p>
            ) : tab === 'overview' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU / Barcode</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">{t.inventory.onHand}</th>
                    <th className="px-4 py-3">{t.inventory.alertThreshold}</th>
                    <th className="px-4 py-3">{t.inventory.health}</th>
                    <th className="px-4 py-3 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBalances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        {t.common.noData}
                      </td>
                    </tr>
                  ) : (
                    filteredBalances.map((b) => {
                      const qty = Number(b.quantity) || 0;
                      const alertVal = Number(b.product.lowStockAlert) || 0;
                      const isOut = qty <= 0;
                      const isLow = !isOut && qty <= alertVal;

                      return (
                        <tr key={b.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{b.product.name}</div>
                            <div className="text-xs text-slate-400">Unit: {b.product.unit?.abbreviation ?? 'pcs'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-mono text-xs font-medium text-slate-800">{b.product.sku}</div>
                            {b.product.barcode && (
                              <div className="text-[11px] text-slate-500">{b.product.barcode}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{b.branch.name}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-base font-bold ${
                                isOut
                                  ? 'text-rose-600'
                                  : isLow
                                    ? 'text-amber-600'
                                    : 'text-slate-900'
                              }`}
                            >
                              {b.quantity} {b.product.unit?.abbreviation ?? ''}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{b.product.lowStockAlert}</td>
                          <td className="px-4 py-3">
                            {isOut ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                                <XCircle className="h-3 w-3" />
                                {t.inventory.outOfStock}
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                <AlertTriangle className="h-3 w-3" />
                                {t.inventory.lowStock}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                {t.inventory.inStock}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() => void openStockHistory(b)}
                                title="View product stock movement history"
                                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <History className="h-3 w-3 text-slate-500" />
                                {t.inventory.stockHistory}
                              </button>
                              {canAdjust && (
                                <button
                                  type="button"
                                  onClick={() => openAdjustmentModal(b.product.id)}
                                  title="Quick stock adjustment"
                                  className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                >
                                  <SlidersHorizontal className="h-3 w-3" />
                                  Adjust
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : tab === 'low_stock' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-amber-50 text-xs font-semibold uppercase text-amber-900">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">On Hand</th>
                    <th className="px-4 py-3">Threshold</th>
                    <th className="px-4 py-3">Replenishment Deficit</th>
                    <th className="px-4 py-3">Urgency</th>
                    <th className="px-4 py-3 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLowStock.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No low-stock items detected. All tracked products meet inventory alert levels.
                      </td>
                    </tr>
                  ) : (
                    filteredLowStock.map((b) => {
                      const qty = Number(b.quantity) || 0;
                      const alertVal = Number(b.product.lowStockAlert) || 0;
                      const deficit = Math.max(0, alertVal - qty);
                      const isOut = qty <= 0;

                      return (
                        <tr key={b.id} className="hover:bg-amber-50/30">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {b.product.name}
                            <span className="ml-1 text-xs font-normal text-slate-400">
                              ({b.product.unit?.abbreviation ?? 'pcs'})
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700">{b.product.sku}</td>
                          <td className="px-4 py-3 text-slate-600">{b.branch.name}</td>
                          <td className="px-4 py-3 font-bold text-rose-600">
                            {b.quantity} {b.product.unit?.abbreviation ?? ''}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{b.product.lowStockAlert}</td>
                          <td className="px-4 py-3 font-semibold text-amber-700">
                            +{deficit} {b.product.unit?.abbreviation ?? 'units'} needed
                          </td>
                          <td className="px-4 py-3">
                            {isOut ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                                <XCircle className="h-3 w-3" />
                                CRITICAL (0 left)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                <AlertTriangle className="h-3 w-3" />
                                LOW STOCK
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() => void openStockHistory(b)}
                                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                History
                              </button>
                              {canAdjust && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAdjustmentModal(
                                      b.product.id,
                                      'IN',
                                      (deficit > 0 ? deficit : 10).toString(),
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                                >
                                  <Plus className="h-3 w-3" />
                                  Restock / Adjust
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : tab === 'movements' ? (
              <>
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Movement &amp; ID</th>
                      <th className="px-4 py-3.5">Product &amp; SKU</th>
                      <th className="px-4 py-3.5">Branch</th>
                      <th className="px-4 py-3.5">{t.inventory.movementType}</th>
                      <th className="px-4 py-3.5 text-right">{t.inventory.quantityIn}</th>
                      <th className="px-4 py-3.5 text-right">{t.inventory.quantityOut}</th>
                      <th className="px-4 py-3.5 text-right">{t.inventory.balanceAfter}</th>
                      <th className="px-4 py-3.5">Reference</th>
                      <th className="px-4 py-3.5">Logged By &amp; Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMovements.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                          {t.common.noData}
                        </td>
                      </tr>
                    ) : (
                      paginatedMovements.map((m) => {
                        const isIncrease = Number(m.quantityIn) > 0;
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/50 transition">
                            {/* Movement & ID */}
                            <td className="px-4 py-3">
                              <div className="space-y-0.5">
                                <div className="text-xs font-medium text-slate-800">
                                  {new Date(m.createdAt).toLocaleString()}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyId(m.id)}
                                    title={`Movement ID: ${m.id}`}
                                    className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded px-1 transition"
                                  >
                                    <span>ID: {m.id.slice(0, 8)}...</span>
                                    {copiedId === m.id ? (
                                      <Check className="h-2.5 w-2.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-2.5 w-2.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* Product & SKU */}
                            <td className="px-4 py-3">
                              <div className="space-y-0.5">
                                <div className="font-semibold text-slate-900">{m.product.name}</div>
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                  <span className="font-mono rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                                    SKU: {m.product.sku}
                                  </span>
                                  {m.product.barcode && (
                                    <span className="font-mono text-slate-400">
                                      {m.product.barcode}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyId(m.productId)}
                                    title={`Product ID: ${m.productId}`}
                                    className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded px-1 transition"
                                  >
                                    <span>Prod ID: {m.productId.slice(0, 8)}...</span>
                                    {copiedId === m.productId ? (
                                      <Check className="h-2.5 w-2.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-2.5 w-2.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* Branch */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 text-slate-700 font-medium">
                                <Building2 className="h-3 w-3 text-slate-400" />
                                <span>{m.branch.name}</span>
                              </div>
                              {m.branch.branchCode && (
                                <span className="font-mono text-[10px] text-slate-400">
                                  ({m.branch.branchCode})
                                </span>
                              )}
                            </td>

                            {/* Type */}
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold ${
                                  isIncrease
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {isIncrease ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {m.movementType}
                              </span>
                            </td>

                            {/* Qty In */}
                            <td className="px-4 py-3 text-right">
                              <div className="font-mono font-semibold text-emerald-700">
                                {Number(m.quantityIn) > 0
                                  ? `+${Number(m.quantityIn).toLocaleString(undefined, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 4,
                                    })}`
                                  : '0'}
                              </div>
                            </td>

                            {/* Qty Out */}
                            <td className="px-4 py-3 text-right">
                              <div className="font-mono font-semibold text-rose-700">
                                {Number(m.quantityOut) > 0
                                  ? `-${Number(m.quantityOut).toLocaleString(undefined, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 4,
                                    })}`
                                  : '0'}
                              </div>
                            </td>

                            {/* Balance After */}
                            <td className="px-4 py-3 text-right">
                              <div className="font-mono font-bold text-slate-900">
                                {Number(m.balanceAfter).toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 4,
                                })}
                              </div>
                            </td>

                            {/* Reference */}
                            <td className="px-4 py-3 text-xs">
                              {m.referenceType ? (
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-slate-800">
                                    {m.referenceType}
                                  </div>
                                  {m.referenceId && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyId(m.referenceId!)}
                                      title={`Ref ID: ${m.referenceId}`}
                                      className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded px-1 transition"
                                    >
                                      <span>Ref: {m.referenceId.slice(0, 8)}...</span>
                                      {copiedId === m.referenceId ? (
                                        <Check className="h-2.5 w-2.5 text-emerald-600" />
                                      ) : (
                                        <Copy className="h-2.5 w-2.5" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            {/* Logged By & Notes */}
                            <td className="px-4 py-3 text-xs">
                              <div className="flex items-center gap-1 text-slate-700 font-medium">
                                <User className="h-3 w-3 text-slate-400" />
                                <span>{m.employee?.name ?? '—'}</span>
                              </div>
                              {m.notes ? (
                                <div className="mt-0.5 text-[11px] text-slate-500 italic max-w-xs truncate" title={m.notes}>
                                  {m.notes}
                                </div>
                              ) : (
                                <div className="text-[11px] text-slate-400">—</div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                <DataTablePagination
                  currentPage={movementPage}
                  pageSize={movementPageSize}
                  totalItems={filteredMovements.length}
                  onPageChange={setMovementPage}
                  onPageSizeChange={(sz) => {
                    setMovementPageSize(sz);
                    setMovementPage(1);
                  }}
                  itemName="stock movements"
                />
              </>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t.inventory.adjustmentNumber}</th>
                    <th className="px-4 py-3">{t.common.date}</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">{t.inventory.reason}</th>
                    <th className="px-4 py-3">Adjusted By</th>
                    <th className="px-4 py-3">Approver</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAdjustments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        {t.common.noData}
                      </td>
                    </tr>
                  ) : (
                    filteredAdjustments.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-emerald-800">
                          {a.adjustmentNumber}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {new Date(a.adjustmentDate || a.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{a.branch.name}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{a.reason}</td>
                        <td className="px-4 py-3 text-slate-600">{a.employee.name}</td>
                        <td className="px-4 py-3 text-slate-600">{a.approver?.name ?? a.employee.name}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            {a.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void openAdjustmentVoucher(a.id)}
                            className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {t.inventory.viewVoucher}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* New Stock Adjustment Modal */}
        {adjOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {t.inventory.newAdjustment} ({activeBranch?.name ?? 'Main Branch'})
                </h2>
                <button
                  type="button"
                  onClick={() => setAdjOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {adjError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {adjError}
                </div>
              )}

              <form onSubmit={submitAdjustment} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Adjustment Reason / Justification
                  </label>
                  <input
                    required
                    minLength={2}
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    placeholder="e.g. Cycle count variance, damaged stock, expired batch disposal..."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Tracked Line Items</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAdjItems((prev) => [
                          ...prev,
                          {
                            productId: products[0]?.id ?? '',
                            direction: 'IN',
                            quantity: '1',
                            notes: '',
                          },
                        ])
                      }
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      + Add Product
                    </button>
                  </div>

                  {adjItems.map((item, idx) => (
                    <div key={idx} className="space-y-2 rounded-lg bg-slate-50 p-2.5">
                      <div className="grid grid-cols-12 items-center gap-2">
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            const next = [...adjItems];
                            next[idx] = { ...item, productId: e.target.value };
                            setAdjItems(next);
                          }}
                          className="col-span-5 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                        </select>
                        <select
                          value={item.direction}
                          onChange={(e) => {
                            const next = [...adjItems];
                            next[idx] = { ...item, direction: e.target.value as 'IN' | 'OUT' };
                            setAdjItems(next);
                          }}
                          className={`col-span-3 rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold ${
                            item.direction === 'IN'
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-rose-50 text-rose-800'
                          }`}
                        >
                          <option value="IN">Increase (+ IN)</option>
                          <option value="OUT">Decrease (- OUT)</option>
                        </select>
                        <input
                          required
                          type="number"
                          min="0.0001"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => {
                            const next = [...adjItems];
                            next[idx] = { ...item, quantity: e.target.value };
                            setAdjItems(next);
                          }}
                          placeholder="Qty"
                          className="col-span-3 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={adjItems.length <= 1}
                          onClick={() => setAdjItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="col-span-1 flex items-center justify-center text-red-500 disabled:opacity-30"
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <input
                        value={item.notes}
                        onChange={(e) => {
                          const next = [...adjItems];
                          next[idx] = { ...item, notes: e.target.value };
                          setAdjItems(next);
                        }}
                        placeholder="Item-level audit note (optional, e.g. Shelf B2 variance)"
                        className="w-full rounded border border-slate-200 bg-white px-2.5 py-1 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setAdjOpen(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submittingAdj}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {submittingAdj ? t.common.saving : 'Apply Adjustment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Stock Adjustment Voucher Modal */}
        {voucherModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-lg font-bold text-slate-900">
                    Stock Adjustment Voucher: {selectedAdjustment?.adjustmentNumber}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setVoucherModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {loadingVoucher ? (
                <p className="p-8 text-center text-sm text-slate-500">{t.common.loading}</p>
              ) : selectedAdjustment ? (
                <div className="mt-4 space-y-4">
                  {/* Voucher Header Info */}
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-4 text-xs">
                    <div>
                      <span className="font-semibold text-slate-500">Branch:</span>
                      <p className="font-bold text-slate-800">{selectedAdjustment.branch.name}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Date:</span>
                      <p className="font-bold text-slate-800">
                        {new Date(selectedAdjustment.adjustmentDate || selectedAdjustment.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Adjusted By:</span>
                      <p className="font-bold text-slate-800">{selectedAdjustment.employee.name}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Status:</span>
                      <p>
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">
                          {selectedAdjustment.status}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                    <span className="font-semibold text-slate-500">Audit Justification / Reason:</span>
                    <p className="mt-0.5 font-medium text-slate-800">{selectedAdjustment.reason}</p>
                  </div>

                  {/* Movements Line Items */}
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Adjusted Items & Ledger Impact
                    </h3>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                        <thead className="bg-slate-50 font-semibold text-slate-600">
                          <tr>
                            <th className="px-3 py-2">Product</th>
                            <th className="px-3 py-2">SKU</th>
                            <th className="px-3 py-2">Direction</th>
                            <th className="px-3 py-2">Quantity</th>
                            <th className="px-3 py-2">Balance After</th>
                            <th className="px-3 py-2">Line Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedAdjustment.movements.map((m) => {
                            const isAdd = Number(m.quantityIn) > 0;
                            return (
                              <tr key={m.id}>
                                <td className="px-3 py-2 font-medium text-slate-900">{m.product.name}</td>
                                <td className="px-3 py-2 font-mono text-slate-600">{m.product.sku}</td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`rounded px-1.5 py-0.5 font-semibold ${
                                      isAdd ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                    }`}
                                  >
                                    {isAdd ? '+ INCREASE' : '- DECREASE'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-bold">
                                  {isAdd ? `+${m.quantityIn}` : `-${m.quantityOut}`}
                                </td>
                                <td className="px-3 py-2 font-bold text-slate-900">{m.balanceAfter}</td>
                                <td className="px-3 py-2 text-slate-500">{m.notes || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Print Voucher
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoucherModal(false)}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
                    >
                      {t.common.close}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Product Stock History Ledger Modal */}
        {historyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-emerald-600" />
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Stock Movement History: {historyProduct?.name}
                    </h2>
                    <p className="text-xs text-slate-500">
                      SKU: <span className="font-mono font-medium">{historyProduct?.sku}</span>
                      {historyProduct?.barcode && ` · Barcode: ${historyProduct.barcode}`} · Branch:{' '}
                      <span className="font-semibold">{historyProduct?.branchName}</span> · Current On-Hand:{' '}
                      <span className="font-bold text-emerald-700">
                        {historyProduct?.currentStock} {historyProduct?.unit?.abbreviation ?? ''}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4">
                {loadingHistory ? (
                  <p className="p-8 text-center text-sm text-slate-500">{t.common.loading}</p>
                ) : historyMovements.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No historical movements recorded for this product yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50 font-semibold uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2.5">Date & Time</th>
                          <th className="px-3 py-2.5">Movement Type</th>
                          <th className="px-3 py-2.5">Quantity Change</th>
                          <th className="px-3 py-2.5">Balance After</th>
                          <th className="px-3 py-2.5">Operator</th>
                          <th className="px-3 py-2.5">Notes / Ref</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyMovements.map((m) => {
                          const isAdd = Number(m.quantityIn) > 0;
                          return (
                            <tr key={m.id} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 text-slate-600">
                                {new Date(m.createdAt).toLocaleString()}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                                    isAdd
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {m.movementType}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-bold">
                                {isAdd ? (
                                  <span className="text-emerald-700">+{m.quantityIn}</span>
                                ) : (
                                  <span className="text-rose-700">-{m.quantityOut}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-bold text-slate-900">{m.balanceAfter}</td>
                              <td className="px-3 py-2 text-slate-600">{m.employee?.name ?? '—'}</td>
                              <td className="px-3 py-2 text-slate-500">{m.notes || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setHistoryModal(false)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
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
