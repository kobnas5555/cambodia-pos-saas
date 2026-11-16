'use client';

import {
  formatCurrency,
  PAYMENT_METHODS,
  SUPPORTED_CURRENCIES,
  subDecimals,
  type CurrencyCode,
  type PaymentMethod,
} from '@cambodia-pos/shared';
import {
  AlertTriangle,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Eye,
  FileText,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
type TabKey = 'orders' | 'payments';

interface PurchaseRow {
  id: string;
  purchaseNumber: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  currencyCode: CurrencyCode;
  status: string;
  paymentStatus: PaymentStatus;
  purchaseDate: string;
  receivedAt: string | null;
  branch: { id: string; name: string };
  supplier: { id: string; name: string };
  employee?: { id: string; name: string };
}

interface PurchasePaymentRow {
  id: string;
  purchaseId: string;
  amount: string;
  currencyCode: CurrencyCode;
  paymentMethod: string;
  referenceNumber: string | null;
  status: string;
  paidAt: string;
  purchase?: {
    id: string;
    purchaseNumber: string;
    totalAmount: string;
    currencyCode: CurrencyCode;
    supplier?: { id: string; name: string };
    branch?: { id: string; name: string };
  };
}

interface PurchaseDetail extends PurchaseRow {
  supplier: { id: string; name: string; phone?: string | null; contactPerson?: string | null };
  purchaseItems: Array<{
    id: string;
    productId: string;
    productNameSnapshot: string;
    quantity: string;
    unitCost: string;
    discountAmount: string;
    taxAmount: string;
    lineTotal: string;
    product?: { id: string; sku: string; name: string };
  }>;
  purchasePayments: Array<{
    id: string;
    amount: string;
    currencyCode: CurrencyCode;
    paymentMethod: string;
    referenceNumber: string | null;
    status: string;
    paidAt: string;
  }>;
}

interface SupplierOption {
  id: string;
  name: string;
  status?: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  costPrice: string;
}

function paymentStatusBadgeClass(status: PaymentStatus) {
  if (status === 'PAID') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'PARTIAL') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

export default function PurchasingPage() {
  const { activeTenant, activeBranch, hasPermission } = useAuth();
  const { t } = useI18n();
  const canCreate = hasPermission('purchases.create');
  const canPay = hasPermission('purchases.pay');

  const [tab, setTab] = useState<TabKey>('orders');
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [payments, setPayments] = useState<PurchasePaymentRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');

  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Details Modal
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>('USD');
  const [receiveImmediately, setReceiveImmediately] = useState(true);
  const [purchaseDiscount, setPurchaseDiscount] = useState('0');
  const [purchaseTax, setPurchaseTax] = useState('0');
  const [lines, setLines] = useState<Array<{ productId: string; quantity: string; unitCost: string }>>([]);
  const [recordInitialPayment, setRecordInitialPayment] = useState(false);
  const [initialPayAmount, setInitialPayAmount] = useState('0');
  const [initialPayCurrency, setInitialPayCurrency] = useState<CurrencyCode>('USD');
  const [initialPayMethod, setInitialPayMethod] = useState<PaymentMethod>('CASH');
  const [initialPayRef, setInitialPayRef] = useState('');

  // Payment Modal
  const [payPurchase, setPayPurchase] = useState<PurchaseRow | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [submittingPay, setSubmittingPay] = useState(false);
  const [payAmount, setPayAmount] = useState('0');
  const [payCurrency, setPayCurrency] = useState<CurrencyCode>('USD');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [payReference, setPayReference] = useState('');

  const loadAll = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (activeBranch) qs.set('branchId', activeBranch.id);
      if (statusFilter !== 'ALL') qs.set('status', statusFilter);
      if (paymentStatusFilter !== 'ALL') qs.set('paymentStatus', paymentStatusFilter);
      if (supplierFilter !== 'ALL') qs.set('supplierId', supplierFilter);
      if (search.trim()) qs.set('search', search.trim());

      const payQs = new URLSearchParams();
      if (activeBranch) payQs.set('branchId', activeBranch.id);
      if (paymentMethodFilter !== 'ALL') payQs.set('paymentMethod', paymentMethodFilter);
      if (search.trim()) payQs.set('search', search.trim());

      const [purs, payList, sups, prods] = await Promise.all([
        apiRequest<PurchaseRow[]>(`/purchases?${qs.toString()}`),
        apiRequest<PurchasePaymentRow[]>(`/purchases/payments?${payQs.toString()}`),
        apiRequest<SupplierOption[]>('/suppliers'),
        apiRequest<ProductOption[]>('/products?status=ACTIVE'),
      ]);
      setPurchases(purs);
      setPayments(payList);
      setSuppliers(sups.filter((s) => !s.status || s.status === 'ACTIVE'));
      setProducts(prods);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load purchasing data');
    } finally {
      setLoading(false);
    }
  }, [activeTenant, activeBranch, statusFilter, paymentStatusFilter, supplierFilter, paymentMethodFilter, search]);

  useEffect(() => {
    void loadAll().catch(() => {});
  }, [loadAll]);

  const draftTotals = useMemo(() => {
    const subtotal = lines.reduce(
      (sum, l) => sum + Number(l.quantity || '0') * Number(l.unitCost || '0'),
      0,
    );
    const total = Math.max(0, subtotal - Number(purchaseDiscount || '0') + Number(purchaseTax || '0'));
    return { subtotal, total };
  }, [lines, purchaseDiscount, purchaseTax]);

  const openCreateModal = () => {
    setCreateError(null);
    const defaultCur = (activeTenant?.defaultCurrency as CurrencyCode) ?? 'USD';
    setCurrencyCode(defaultCur);
    setSupplierId(suppliers[0]?.id ?? '');
    setReceiveImmediately(true);
    setPurchaseDiscount('0');
    setPurchaseTax('0');
    setRecordInitialPayment(false);
    setInitialPayAmount('0');
    setInitialPayCurrency(defaultCur);
    setInitialPayMethod('CASH');
    setInitialPayRef('');
    const firstProd = products[0];
    setLines(
      firstProd
        ? [{ productId: firstProd.id, quantity: '1', unitCost: firstProd.costPrice }]
        : [],
    );
    setCreateOpen(true);
  };

  const openDetailModal = async (purchaseId: string) => {
    setError(null);
    setLoadingDetail(true);
    try {
      const detail = await apiRequest<PurchaseDetail>(`/purchases/${purchaseId}`);
      setSelectedPurchase(detail);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load purchase details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const openPaymentModal = (p: PurchaseRow) => {
    const due = subDecimals(p.totalAmount, p.paidAmount, 2);
    setPayError(null);
    setPayPurchase(p);
    setPayAmount(due);
    setPayCurrency(p.currencyCode);
    setPayMethod('CASH');
    setPayReference('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranch) return;
    setCreateError(null);
    if (!supplierId) {
      setCreateError('Please select a supplier.');
      return;
    }
    if (lines.length === 0) {
      setCreateError('Add at least one purchased product.');
      return;
    }
    setSubmittingCreate(true);
    try {
      const created = await apiRequest<PurchaseRow>('/purchases', {
        method: 'POST',
        body: JSON.stringify({
          branchId: activeBranch.id,
          supplierId,
          currencyCode,
          discountAmount: purchaseDiscount || '0',
          taxAmount: purchaseTax || '0',
          receiveImmediately,
          items: lines,
          ...(recordInitialPayment && Number(initialPayAmount) > 0
            ? {
                initialPayment: {
                  amount: initialPayAmount,
                  currencyCode: initialPayCurrency,
                  paymentMethod: initialPayMethod,
                  referenceNumber: initialPayRef.trim() || undefined,
                },
              }
            : {}),
        }),
      });
      setCreateOpen(false);
      setFeedback(
        `Purchase order ${created.purchaseNumber} created (${created.status} · ${created.paymentStatus}).`,
      );
      await loadAll();
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : 'Unable to create purchase');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleReceive = async (purchaseId: string) => {
    setError(null);
    try {
      await apiRequest(`/purchases/${purchaseId}/receive`, { method: 'POST' });
      setFeedback('Purchase items received into warehouse and branch stock updated.');
      if (selectedPurchase?.id === purchaseId) {
        const refreshed = await apiRequest<PurchaseDetail>(`/purchases/${purchaseId}`);
        setSelectedPurchase(refreshed);
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to receive purchase');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payPurchase) return;
    setPayError(null);
    setSubmittingPay(true);
    try {
      await apiRequest(`/purchases/${payPurchase.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: payAmount,
          currencyCode: payCurrency,
          paymentMethod: payMethod,
          referenceNumber: payReference.trim() || undefined,
        }),
      });
      const paidId = payPurchase.id;
      setPayPurchase(null);
      setFeedback('Supplier payment recorded successfully.');
      if (selectedPurchase?.id === paidId) {
        const refreshed = await apiRequest<PurchaseDetail>(`/purchases/${paidId}`);
        setSelectedPurchase(refreshed);
      }
      await loadAll();
    } catch (err) {
      setPayError(err instanceof ApiClientError ? err.message : 'Payment failed');
    } finally {
      setSubmittingPay(false);
    }
  };

  // KPI Calculations
  const cur = (activeTenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const totalPurchasesCount = purchases.length;
  const totalCostSum = purchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
  const totalDueSum = purchases.reduce((sum, p) => sum + Math.max(0, Number(subDecimals(p.totalAmount, p.paidAmount, 2))), 0);
  const awaitingReceiptCount = purchases.filter((p) => p.status === 'ORDERED').length;

  const q = search.trim().toLowerCase();

  const filteredPurchases = purchases.filter((p) => {
    if (!q) return true;
    return (
      p.purchaseNumber.toLowerCase().includes(q) ||
      p.supplier.name.toLowerCase().includes(q) ||
      p.branch.name.toLowerCase().includes(q)
    );
  });

  const filteredPayments = payments.filter((pay) => {
    if (!q) return true;
    return (
      (pay.purchase?.purchaseNumber ?? '').toLowerCase().includes(q) ||
      (pay.purchase?.supplier?.name ?? '').toLowerCase().includes(q) ||
      (pay.referenceNumber ?? '').toLowerCase().includes(q) ||
      pay.paymentMethod.toLowerCase().includes(q)
    );
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.purchasing.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{t.purchasing.subtitle}</p>
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
            {canCreate && (
              <button
                type="button"
                onClick={openCreateModal}
                disabled={suppliers.length === 0 || products.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {t.purchasing.createPurchase}
              </button>
            )}
          </div>
        </div>

        {/* Purchasing KPI Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div
            onClick={() => {
              setTab('orders');
              setStatusFilter('ALL');
              setPaymentStatusFilter('ALL');
            }}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Orders
              </span>
              <ShoppingCart className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{totalPurchasesCount}</p>
            <span className="text-xs text-slate-500">Supplier order vouchers</span>
          </div>

          <div
            onClick={() => setTab('orders')}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Procurement
              </span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-600">
              {formatCurrency(totalCostSum.toFixed(2), cur)}
            </p>
            <span className="text-xs text-slate-500">Total replenishment spend</span>
          </div>

          <div
            onClick={() => {
              setTab('orders');
              setPaymentStatusFilter('UNPAID');
            }}
            className={`cursor-pointer rounded-xl border p-4 shadow-sm transition ${
              paymentStatusFilter === 'UNPAID'
                ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-400'
                : 'border-slate-200 bg-white hover:border-rose-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                Accounts Payable
              </span>
              <CreditCard className="h-4 w-4 text-rose-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-rose-600">
              {formatCurrency(totalDueSum.toFixed(2), cur)}
            </p>
            <span className="text-xs text-rose-700">Outstanding supplier debt</span>
          </div>

          <div
            onClick={() => {
              setTab('orders');
              setStatusFilter('ORDERED');
            }}
            className={`cursor-pointer rounded-xl border p-4 shadow-sm transition ${
              statusFilter === 'ORDERED'
                ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-400'
                : 'border-slate-200 bg-white hover:border-amber-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Awaiting Delivery
              </span>
              <Truck className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-600">{awaitingReceiptCount}</p>
            <span className="text-xs text-amber-700">Pending stock intake</span>
          </div>
        </div>

        {(suppliers.length === 0 || products.length === 0) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Add at least one active <strong>Supplier</strong> and one active <strong>Product</strong> in the Products catalog before creating purchases.
          </div>
        )}

        {/* Tab Selection & Filtering Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab('orders')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                tab === 'orders'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FileText className="h-4 w-4" />
              {t.purchasing.purchaseList} ({purchases.length})
            </button>

            <button
              type="button"
              onClick={() => setTab('payments')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                tab === 'payments'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <CreditCard className="h-4 w-4" />
              {t.purchasing.supplierPayments} ({payments.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab === 'orders' ? (
              <>
                <select
                  aria-label="Filter by supplier"
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">{t.purchasing.allSuppliers}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by receipt status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">{t.purchasing.allReceiptStatus}</option>
                  <option value="ORDERED">{t.purchasing.ordered}</option>
                  <option value="RECEIVED">{t.purchasing.received}</option>
                </select>

                <select
                  aria-label="Filter by payment status"
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">{t.purchasing.allPaymentStatus}</option>
                  <option value="UNPAID">{t.purchasing.unpaid}</option>
                  <option value="PARTIAL">{t.purchasing.partial}</option>
                  <option value="PAID">{t.purchasing.paid}</option>
                </select>
              </>
            ) : (
              <select
                aria-label="Filter by payment method"
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All Payment Methods</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
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
                  tab === 'orders' ? 'Search Purchase # or supplier...' : 'Search ref, supplier, method...'
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
            ) : tab === 'orders' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t.purchasing.purchaseNumber}</th>
                    <th className="px-4 py-3">{t.common.date}</th>
                    <th className="px-4 py-3">{t.purchasing.supplier}</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">{t.purchasing.totalCost}</th>
                    <th className="px-4 py-3">Paid / Due</th>
                    <th className="px-4 py-3">{t.purchasing.paymentStatus}</th>
                    <th className="px-4 py-3">{t.purchasing.receiptStatus}</th>
                    <th className="px-4 py-3 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                        {t.common.noData}
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map((p) => {
                      const due = subDecimals(p.totalAmount, p.paidAmount, 2);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => void openDetailModal(p.id)}
                              className="font-mono text-xs font-bold text-emerald-800 hover:underline"
                            >
                              {p.purchaseNumber}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {new Date(p.purchaseDate).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{p.supplier.name}</td>
                          <td className="px-4 py-3 text-slate-600">{p.branch.name}</td>
                          <td className="px-4 py-3 font-bold text-slate-900">
                            {formatCurrency(p.totalAmount, p.currencyCode)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            <div>Paid: {formatCurrency(p.paidAmount, p.currencyCode)}</div>
                            {Number(due) > 0 ? (
                              <div className="font-semibold text-rose-600">
                                Due: {formatCurrency(due, p.currencyCode)}
                              </div>
                            ) : (
                              <div className="text-[11px] text-emerald-700">Settled</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${paymentStatusBadgeClass(
                                p.paymentStatus,
                              )}`}
                            >
                              {p.paymentStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                p.status === 'RECEIVED'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {p.status === 'RECEIVED' ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <Clock className="h-3 w-3" />
                              )}
                              {p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void openDetailModal(p.id)}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Eye className="h-3 w-3" />
                                {t.purchasing.purchaseDetails}
                              </button>
                              {p.status !== 'RECEIVED' && canCreate && (
                                <button
                                  type="button"
                                  onClick={() => void handleReceive(p.id)}
                                  className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  {t.purchasing.receiveStock}
                                </button>
                              )}
                              {Number(due) > 0 && canPay && (
                                <button
                                  type="button"
                                  onClick={() => openPaymentModal(p)}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  <CreditCard className="h-3 w-3" />
                                  {t.purchasing.recordPayment}
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
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t.common.date}</th>
                    <th className="px-4 py-3">{t.purchasing.purchaseNumber}</th>
                    <th className="px-4 py-3">{t.purchasing.supplier}</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Payment Method</th>
                    <th className="px-4 py-3">Reference #</th>
                    <th className="px-4 py-3">{t.purchasing.paidAmount}</th>
                    <th className="px-4 py-3">{t.common.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        {t.common.noData}
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {new Date(pay.paidAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {pay.purchase ? (
                            <button
                              type="button"
                              onClick={() => void openDetailModal(pay.purchase!.id)}
                              className="font-mono text-xs font-bold text-emerald-800 hover:underline"
                            >
                              {pay.purchase.purchaseNumber}
                            </button>
                          ) : (
                            <span className="font-mono text-xs text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {pay.purchase?.supplier?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{pay.purchase?.branch?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-800">
                            {pay.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {pay.referenceNumber || '—'}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-700">
                          {formatCurrency(pay.amount, pay.currencyCode)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            {pay.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Purchase Details Modal */}
        {selectedPurchase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-600" />
                    <h2 className="font-mono text-lg font-bold text-slate-900">
                      {selectedPurchase.purchaseNumber}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Supplier: <strong>{selectedPurchase.supplier.name}</strong>
                    {selectedPurchase.supplier.phone ? ` (${selectedPurchase.supplier.phone})` : ''} · Branch:{' '}
                    {selectedPurchase.branch.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Ordered: {new Date(selectedPurchase.purchaseDate).toLocaleString()}
                    {selectedPurchase.receivedAt &&
                      ` · Received: ${new Date(selectedPurchase.receivedAt).toLocaleString()}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPurchase(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Status Badges */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    selectedPurchase.status === 'RECEIVED'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {selectedPurchase.status === 'RECEIVED' ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Clock className="h-3.5 w-3.5" />
                  )}
                  Receipt: {selectedPurchase.status}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${paymentStatusBadgeClass(
                    selectedPurchase.paymentStatus,
                  )}`}
                >
                  Payment: {selectedPurchase.paymentStatus}
                </span>
              </div>

              {/* Purchase Line Items */}
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Itemized Procurement Lines
                </h3>
                <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 font-semibold text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Quantity</th>
                        <th className="px-3 py-2">Unit Cost</th>
                        <th className="px-3 py-2 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedPurchase.purchaseItems.map((pi) => (
                        <tr key={pi.id}>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-900">{pi.productNameSnapshot}</div>
                            {pi.product?.sku && (
                              <div className="font-mono text-[11px] text-slate-500">{pi.product.sku}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-700">{pi.quantity}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {formatCurrency(pi.unitCost, selectedPurchase.currencyCode)}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-900">
                            {formatCurrency(pi.lineTotal, selectedPurchase.currencyCode)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="mt-3 rounded-xl bg-slate-50 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>{t.common.subtotal}</span>
                  <span>{formatCurrency(selectedPurchase.subtotal, selectedPurchase.currencyCode)}</span>
                </div>
                {Number(selectedPurchase.discountAmount) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>{t.common.discount}</span>
                    <span className="font-medium text-rose-600">
                      -{formatCurrency(selectedPurchase.discountAmount, selectedPurchase.currencyCode)}
                    </span>
                  </div>
                )}
                {Number(selectedPurchase.taxAmount) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>{t.common.tax} / Freight</span>
                    <span>{formatCurrency(selectedPurchase.taxAmount, selectedPurchase.currencyCode)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-900">
                  <span>{t.purchasing.totalCost}</span>
                  <span>{formatCurrency(selectedPurchase.totalAmount, selectedPurchase.currencyCode)}</span>
                </div>
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span>{t.purchasing.paidAmount}</span>
                  <span>{formatCurrency(selectedPurchase.paidAmount, selectedPurchase.currencyCode)}</span>
                </div>
                <div className="flex justify-between font-bold text-rose-700">
                  <span>{t.purchasing.dueAmount}</span>
                  <span>
                    {formatCurrency(
                      subDecimals(selectedPurchase.totalAmount, selectedPurchase.paidAmount, 2),
                      selectedPurchase.currencyCode,
                    )}
                  </span>
                </div>
              </div>

              {/* Payments History Ledger on this Purchase */}
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Disbursements &amp; Settlement Ledger
                </h3>
                {selectedPurchase.purchasePayments.length === 0 ? (
                  <p className="mt-1 rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500">
                    No payment disbursements recorded yet.
                  </p>
                ) : (
                  <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50 font-semibold text-slate-600">
                        <tr>
                          <th className="px-3 py-2">Paid Date</th>
                          <th className="px-3 py-2">Method</th>
                          <th className="px-3 py-2">Reference #</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedPurchase.purchasePayments.map((pp) => (
                          <tr key={pp.id}>
                            <td className="px-3 py-2 text-slate-600">
                              {new Date(pp.paidAt).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-800">
                              {pp.paymentMethod}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-500">
                              {pp.referenceNumber || '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-700">
                              {formatCurrency(pp.amount, pp.currencyCode)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {t.purchasing.printVoucher}
                </button>
                {selectedPurchase.status !== 'RECEIVED' && canCreate && (
                  <button
                    type="button"
                    onClick={() => void handleReceive(selectedPurchase.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t.purchasing.receiveStock}
                  </button>
                )}
                {Number(subDecimals(selectedPurchase.totalAmount, selectedPurchase.paidAmount, 2)) > 0 &&
                  canPay && (
                    <button
                      type="button"
                      onClick={() => openPaymentModal(selectedPurchase)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      {t.purchasing.recordPayment}
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setSelectedPurchase(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t.common.close}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Purchase Modal */}
        {createOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-lg font-bold text-slate-900">{t.purchasing.createPurchase}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {createError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {createError}
                </div>
              )}

              <form onSubmit={handleCreate} className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Supplier Vendor</label>
                    <select
                      required
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Procurement Currency</label>
                    <select
                      value={currencyCode}
                      onChange={(e) => setCurrencyCode(e.target.value as CurrencyCode)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Purchased Products &amp; Unit Costs</span>
                    <button
                      type="button"
                      onClick={() =>
                        setLines((prev) => [
                          ...prev,
                          {
                            productId: products[0]?.id ?? '',
                            quantity: '1',
                            unitCost: products[0]?.costPrice ?? '0',
                          },
                        ])
                      }
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      + Add Item
                    </button>
                  </div>

                  {lines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 items-center gap-2 rounded-lg bg-slate-50 p-2.5">
                      <select
                        value={line.productId}
                        onChange={(e) => {
                          const prod = products.find((p) => p.id === e.target.value);
                          const next = [...lines];
                          next[idx] = {
                            ...line,
                            productId: e.target.value,
                            unitCost: prod?.costPrice ?? line.unitCost,
                          };
                          setLines(next);
                        }}
                        className="col-span-5 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                      <input
                        required
                        type="number"
                        min="0.0001"
                        step="any"
                        value={line.quantity}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx] = { ...line, quantity: e.target.value };
                          setLines(next);
                        }}
                        placeholder="Qty"
                        className="col-span-3 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                      <input
                        required
                        type="number"
                        min="0"
                        step="any"
                        value={line.unitCost}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx] = { ...line, unitCost: e.target.value };
                          setLines(next);
                        }}
                        placeholder="Unit Cost"
                        className="col-span-3 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={lines.length <= 1}
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        className="col-span-1 flex items-center justify-center text-red-500 disabled:opacity-30"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Order Discount ({currencyCode})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={purchaseDiscount}
                      onChange={(e) => setPurchaseDiscount(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Tax / Freight Inflow ({currencyCode})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={purchaseTax}
                      onChange={(e) => setPurchaseTax(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>Total Purchase Cost</span>
                    <span>
                      {formatCurrency(
                        currencyCode === 'KHR'
                          ? Math.round(draftTotals.total)
                          : draftTotals.total.toFixed(2),
                        currencyCode,
                      )}
                    </span>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={receiveImmediately}
                    onChange={(e) => setReceiveImmediately(e.target.checked)}
                    className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  Receive stock immediately into {activeBranch?.name ?? 'Main Branch'}
                </label>

                <div className="rounded-xl border border-slate-200 p-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={recordInitialPayment}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setRecordInitialPayment(checked);
                        if (checked) {
                          setInitialPayAmount(
                            currencyCode === 'KHR'
                              ? String(Math.round(draftTotals.total))
                              : draftTotals.total.toFixed(2),
                          );
                          setInitialPayCurrency(currencyCode);
                        }
                      }}
                      className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    Record initial supplier payment now (otherwise marked UNPAID)
                  </label>

                  {recordInitialPayment && (
                    <div className="mt-3 grid grid-cols-12 gap-2">
                      <select
                        value={initialPayMethod}
                        onChange={(e) => setInitialPayMethod(e.target.value as PaymentMethod)}
                        className="col-span-4 rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <select
                        value={initialPayCurrency}
                        onChange={(e) => setInitialPayCurrency(e.target.value as CurrencyCode)}
                        className="col-span-3 rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      >
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={initialPayAmount}
                        onChange={(e) => setInitialPayAmount(e.target.value)}
                        placeholder="Amount"
                        className="col-span-5 rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                      {initialPayMethod !== 'CASH' && (
                        <input
                          value={initialPayRef}
                          onChange={(e) => setInitialPayRef(e.target.value)}
                          placeholder="Bank / Transaction Ref # (optional)"
                          className="col-span-12 rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submittingCreate}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {submittingCreate ? t.common.saving : t.common.create}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Record Supplier Payment Modal */}
        {payPurchase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Record Payment — {payPurchase.purchaseNumber}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Total: {formatCurrency(payPurchase.totalAmount, payPurchase.currencyCode)} · Paid:{' '}
                    {formatCurrency(payPurchase.paidAmount, payPurchase.currencyCode)} · Due:{' '}
                    <span className="font-bold text-rose-600">
                      {formatCurrency(
                        subDecimals(payPurchase.totalAmount, payPurchase.paidAmount, 2),
                        payPurchase.currencyCode,
                      )}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPayPurchase(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {payError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {payError}
                </div>
              )}

              <form onSubmit={handleRecordPayment} className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-700">Payment Amount</label>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="any"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Currency</label>
                    <select
                      value={payCurrency}
                      onChange={(e) => setPayCurrency(e.target.value as CurrencyCode)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Payment Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {payMethod !== 'CASH' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Bank / Transaction Reference # (optional)
                    </label>
                    <input
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      placeholder="e.g. ABA Approval Code or Check #"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setPayPurchase(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submittingPay}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {submittingPay ? t.common.saving : 'Record Payment'}
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
