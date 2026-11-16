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
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
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
  User,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTablePagination } from '@/components/DataTablePagination';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
type TabKey = 'orders' | 'payments';

interface PurchaseRow {
  id: string;
  tenantId?: string;
  branchId?: string;
  supplierId?: string;
  purchaseNumber: string;
  employeeId?: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  currencyCode: CurrencyCode;
  exchangeRate?: string;
  status: string;
  paymentStatus: PaymentStatus;
  purchaseDate: string;
  receivedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  branch: { id: string; name: string; branchCode?: string };
  supplier: { id: string; name: string; contactPerson?: string | null; phone?: string | null };
  employee?: { id: string; name: string; employeeCode?: string };
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
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  // Pagination & Copy
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchasePageSize, setPurchasePageSize] = useState(10);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentPageSize, setPaymentPageSize] = useState(10);

  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCopyId = (id: string) => {
    void navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

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
      else if (branchFilter !== 'ALL') qs.set('branchId', branchFilter);
      if (statusFilter !== 'ALL') qs.set('status', statusFilter);
      if (paymentStatusFilter !== 'ALL') qs.set('paymentStatus', paymentStatusFilter);
      if (supplierFilter !== 'ALL') qs.set('supplierId', supplierFilter);
      if (currencyFilter !== 'ALL') qs.set('currencyCode', currencyFilter);
      if (startDateFilter) qs.set('startDate', startDateFilter);
      if (endDateFilter) qs.set('endDate', endDateFilter);
      if (search.trim()) qs.set('search', search.trim());

      const payQs = new URLSearchParams();
      if (activeBranch) payQs.set('branchId', activeBranch.id);
      else if (branchFilter !== 'ALL') payQs.set('branchId', branchFilter);
      if (paymentMethodFilter !== 'ALL') payQs.set('paymentMethod', paymentMethodFilter);
      if (currencyFilter !== 'ALL') payQs.set('currencyCode', currencyFilter);
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
  }, [
    activeTenant,
    activeBranch,
    branchFilter,
    statusFilter,
    paymentStatusFilter,
    supplierFilter,
    currencyFilter,
    startDateFilter,
    endDateFilter,
    paymentMethodFilter,
    search,
  ]);

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

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (branchFilter !== 'ALL' && p.branchId && p.branchId !== branchFilter) return false;
      if (currencyFilter !== 'ALL' && p.currencyCode !== currencyFilter) return false;
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (paymentStatusFilter !== 'ALL' && p.paymentStatus !== paymentStatusFilter) return false;
      if (supplierFilter !== 'ALL' && p.supplierId && p.supplierId !== supplierFilter) return false;
      if (startDateFilter && new Date(p.purchaseDate) < new Date(startDateFilter)) return false;
      if (endDateFilter && new Date(p.purchaseDate) > new Date(endDateFilter + 'T23:59:59.999Z')) return false;

      if (!q) return true;
      return (
        p.purchaseNumber.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.supplier.name.toLowerCase().includes(q) ||
        (p.supplier.contactPerson ?? '').toLowerCase().includes(q) ||
        p.branch.name.toLowerCase().includes(q) ||
        (p.employee?.name ?? '').toLowerCase().includes(q)
      );
    });
  }, [
    purchases,
    branchFilter,
    currencyFilter,
    statusFilter,
    paymentStatusFilter,
    supplierFilter,
    startDateFilter,
    endDateFilter,
    q,
  ]);

  const paginatedPurchases = useMemo(() => {
    const start = (purchasePage - 1) * purchasePageSize;
    return filteredPurchases.slice(start, start + purchasePageSize);
  }, [filteredPurchases, purchasePage, purchasePageSize]);

  const filteredPayments = useMemo(() => {
    return payments.filter((pay) => {
      if (paymentMethodFilter !== 'ALL' && pay.paymentMethod !== paymentMethodFilter) return false;
      if (currencyFilter !== 'ALL' && pay.currencyCode !== currencyFilter) return false;
      if (!q) return true;
      return (
        (pay.purchase?.purchaseNumber ?? '').toLowerCase().includes(q) ||
        (pay.purchase?.supplier?.name ?? '').toLowerCase().includes(q) ||
        (pay.referenceNumber ?? '').toLowerCase().includes(q) ||
        pay.paymentMethod.toLowerCase().includes(q) ||
        pay.id.toLowerCase().includes(q)
      );
    });
  }, [payments, paymentMethodFilter, currencyFilter, q]);

  const paginatedPayments = useMemo(() => {
    const start = (paymentPage - 1) * paymentPageSize;
    return filteredPayments.slice(start, start + paymentPageSize);
  }, [filteredPayments, paymentPage, paymentPageSize]);

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
                {activeTenant?.branches && activeTenant.branches.length > 1 && (
                  <select
                    aria-label="Filter by branch"
                    value={branchFilter}
                    onChange={(e) => {
                      setBranchFilter(e.target.value);
                      setPurchasePage(1);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Branches</option>
                    {activeTenant.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  aria-label="Filter by supplier"
                  value={supplierFilter}
                  onChange={(e) => {
                    setSupplierFilter(e.target.value);
                    setPurchasePage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
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
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPurchasePage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">{t.purchasing.allReceiptStatus}</option>
                  <option value="ORDERED">{t.purchasing.ordered}</option>
                  <option value="RECEIVED">{t.purchasing.received}</option>
                </select>

                <select
                  aria-label="Filter by payment status"
                  value={paymentStatusFilter}
                  onChange={(e) => {
                    setPaymentStatusFilter(e.target.value);
                    setPurchasePage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">{t.purchasing.allPaymentStatus}</option>
                  <option value="UNPAID">{t.purchasing.unpaid}</option>
                  <option value="PARTIAL">{t.purchasing.partial}</option>
                  <option value="PAID">{t.purchasing.paid}</option>
                </select>

                <select
                  aria-label="Filter by currency"
                  value={currencyFilter}
                  onChange={(e) => {
                    setCurrencyFilter(e.target.value);
                    setPurchasePage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">All Currencies</option>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs shadow-sm">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={startDateFilter}
                    onChange={(e) => {
                      setStartDateFilter(e.target.value);
                      setPurchasePage(1);
                    }}
                    className="bg-transparent text-xs text-slate-700 focus:outline-none"
                    aria-label="Start date filter"
                  />
                  <span className="text-slate-400">&ndash;</span>
                  <input
                    type="date"
                    value={endDateFilter}
                    onChange={(e) => {
                      setEndDateFilter(e.target.value);
                      setPurchasePage(1);
                    }}
                    className="bg-transparent text-xs text-slate-700 focus:outline-none"
                    aria-label="End date filter"
                  />
                </div>
              </>
            ) : (
              <>
                {activeTenant?.branches && activeTenant.branches.length > 1 && (
                  <select
                    aria-label="Filter by branch"
                    value={branchFilter}
                    onChange={(e) => {
                      setBranchFilter(e.target.value);
                      setPaymentPage(1);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Branches</option>
                    {activeTenant.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  aria-label="Filter by payment method"
                  value={paymentMethodFilter}
                  onChange={(e) => {
                    setPaymentMethodFilter(e.target.value);
                    setPaymentPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">All Payment Methods</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by currency"
                  value={currencyFilter}
                  onChange={(e) => {
                    setCurrencyFilter(e.target.value);
                    setPaymentPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">All Currencies</option>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </>
            )}

            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPurchasePage(1);
                  setPaymentPage(1);
                }}
                placeholder={
                  tab === 'orders' ? 'Search Purchase # or supplier...' : 'Search ref, supplier, method...'
                }
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-7 text-xs shadow-sm focus:border-emerald-500 focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setPurchasePage(1);
                    setPaymentPage(1);
                  }}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {(branchFilter !== 'ALL' ||
              currencyFilter !== 'ALL' ||
              statusFilter !== 'ALL' ||
              paymentStatusFilter !== 'ALL' ||
              supplierFilter !== 'ALL' ||
              paymentMethodFilter !== 'ALL' ||
              startDateFilter ||
              endDateFilter ||
              search) && (
              <button
                type="button"
                onClick={() => {
                  setBranchFilter('ALL');
                  setCurrencyFilter('ALL');
                  setStatusFilter('ALL');
                  setPaymentStatusFilter('ALL');
                  setSupplierFilter('ALL');
                  setPaymentMethodFilter('ALL');
                  setStartDateFilter('');
                  setEndDateFilter('');
                  setSearch('');
                  setPurchasePage(1);
                  setPaymentPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition shadow-sm"
              >
                Clear
              </button>
            )}
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
              <div className="p-12 text-center text-sm text-slate-500">
                <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600 mb-2" />
                {t.common.loading}
              </div>
            ) : tab === 'orders' ? (
              <>
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Purchase &amp; ID</th>
                      <th className="px-4 py-3.5">{t.common.date} &amp; Receipt</th>
                      <th className="px-4 py-3.5">{t.purchasing.supplier} &amp; Branch</th>
                      <th className="px-4 py-3.5">Purchaser</th>
                      <th className="px-4 py-3.5">Cost Breakdown</th>
                      <th className="px-4 py-3.5">{t.purchasing.totalCost} &amp; Rate</th>
                      <th className="px-4 py-3.5">Paid / Due</th>
                      <th className="px-4 py-3.5">{t.purchasing.paymentStatus}</th>
                      <th className="px-4 py-3.5">{t.purchasing.receiptStatus}</th>
                      <th className="px-4 py-3.5 text-right">{t.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPurchases.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                          <Package className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                          <p className="text-sm font-medium text-slate-900">{t.common.noData}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {search || statusFilter !== 'ALL' || paymentStatusFilter !== 'ALL'
                              ? 'No purchase orders matched your filter criteria.'
                              : 'No purchase orders recorded yet.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      paginatedPurchases.map((p) => {
                        const due = subDecimals(p.totalAmount, p.paidAmount, 2);
                        const isUsd = p.currencyCode === 'USD';
                        const rateNum = Number(p.exchangeRate || '4100') || 4100;
                        const counterpart = isUsd
                          ? (Number(p.totalAmount) * rateNum).toFixed(0)
                          : (Number(p.totalAmount) / rateNum).toFixed(2);
                        const counterpartCur: CurrencyCode = isUsd ? 'KHR' : 'USD';

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition">
                            {/* Purchase # & UUID */}
                            <td className="px-4 py-3">
                              <div className="space-y-0.5">
                                <button
                                  type="button"
                                  onClick={() => void openDetailModal(p.id)}
                                  className="font-mono text-xs font-bold text-emerald-800 hover:underline block text-left"
                                >
                                  {p.purchaseNumber}
                                </button>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyId(p.id)}
                                    title={`UUID: ${p.id}`}
                                    className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded px-1 transition"
                                  >
                                    <span>{p.id.slice(0, 8)}...</span>
                                    {copiedId === p.id ? (
                                      <Check className="h-2.5 w-2.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-2.5 w-2.5" />
                                    )}
                                    {copiedId === p.id && (
                                      <span className="text-[10px] text-emerald-600 font-semibold">
                                        Copied
                                      </span>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* Date, Created At & Receipt */}
                            <td className="px-4 py-3 text-xs space-y-0.5">
                              <div className="font-medium text-slate-700">
                                {new Date(p.purchaseDate).toLocaleDateString()}
                              </div>
                              {p.receivedAt ? (
                                <div className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                                  <CheckCircle2 className="h-3 w-3" />
                                  <span>Rec: {new Date(p.receivedAt).toLocaleDateString()}</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                                  <Clock className="h-3 w-3" />
                                  <span>Pending receipt</span>
                                </div>
                              )}
                              <div className="text-[10px] text-slate-400">
                                Created: {new Date(p.createdAt || p.purchaseDate).toLocaleDateString()}
                              </div>
                            </td>

                            {/* Supplier & Branch */}
                            <td className="px-4 py-3 text-xs space-y-0.5">
                              <div className="font-semibold text-slate-900">{p.supplier.name}</div>
                              {p.supplier.contactPerson && (
                                <div className="text-[11px] text-slate-500">
                                  {p.supplier.contactPerson}
                                </div>
                              )}
                              <div className="flex items-center gap-1 text-[11px] text-slate-600">
                                <Building2 className="h-3 w-3 text-slate-400" />
                                <span>{p.branch.name}</span>
                                {p.branch.branchCode && (
                                  <span className="font-mono text-[10px] text-slate-400">
                                    ({p.branch.branchCode})
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Purchaser / Employee */}
                            <td className="px-4 py-3 text-xs">
                              <div className="flex items-center gap-1 text-slate-700 font-medium">
                                <User className="h-3 w-3 text-slate-400" />
                                <span>{p.employee?.name ?? '—'}</span>
                              </div>
                              {p.employee?.employeeCode && (
                                <span className="font-mono text-[10px] text-slate-400">
                                  {p.employee.employeeCode}
                                </span>
                              )}
                            </td>

                            {/* Cost Breakdown */}
                            <td className="px-4 py-3 text-xs space-y-0.5">
                              <div className="text-slate-600">
                                Sub: {formatCurrency(p.subtotal, p.currencyCode)}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {Number(p.discountAmount) > 0 && (
                                  <span className="text-emerald-600 mr-1.5">
                                    Disc: -{formatCurrency(p.discountAmount, p.currencyCode)}
                                  </span>
                                )}
                                {Number(p.taxAmount) > 0 && (
                                  <span className="text-slate-500">
                                    Tax: +{formatCurrency(p.taxAmount, p.currencyCode)}
                                  </span>
                                )}
                                {!(Number(p.discountAmount) > 0) && !(Number(p.taxAmount) > 0) && (
                                  <span className="text-slate-400">No disc/tax</span>
                                )}
                              </div>
                            </td>

                            {/* Total Cost & Counterpart / Rate */}
                            <td className="px-4 py-3 text-xs space-y-0.5">
                              <div className="font-bold text-slate-900 text-sm">
                                {formatCurrency(p.totalAmount, p.currencyCode)}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                &asymp; {formatCurrency(counterpart, counterpartCur)}
                              </div>
                              <div className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                                1 USD = {Number(p.exchangeRate || 4100).toLocaleString()} KHR
                              </div>
                            </td>

                            {/* Paid / Due */}
                            <td className="px-4 py-3 text-xs space-y-0.5">
                              <div className="text-slate-600">
                                Paid: {formatCurrency(p.paidAmount, p.currencyCode)}
                              </div>
                              {Number(due) > 0 ? (
                                <div className="font-semibold text-rose-600">
                                  Due: {formatCurrency(due, p.currencyCode)}
                                </div>
                              ) : (
                                <div className="text-[11px] font-semibold text-emerald-700">
                                  Settled
                                </div>
                              )}
                            </td>

                            {/* Payment Status */}
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${paymentStatusBadgeClass(
                                  p.paymentStatus,
                                )}`}
                              >
                                {p.paymentStatus}
                              </span>
                            </td>

                            {/* Receipt Status */}
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

                            {/* Actions */}
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void openDetailModal(p.id)}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                                >
                                  <Eye className="h-3 w-3" />
                                  {t.purchasing.purchaseDetails}
                                </button>
                                {p.status !== 'RECEIVED' && canCreate && (
                                  <button
                                    type="button"
                                    onClick={() => void handleReceive(p.id)}
                                    className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    {t.purchasing.receiveStock}
                                  </button>
                                )}
                                {Number(due) > 0 && canPay && (
                                  <button
                                    type="button"
                                    onClick={() => openPaymentModal(p)}
                                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
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
                <DataTablePagination
                  currentPage={purchasePage}
                  pageSize={purchasePageSize}
                  totalItems={filteredPurchases.length}
                  onPageChange={setPurchasePage}
                  onPageSizeChange={(sz) => {
                    setPurchasePageSize(sz);
                    setPurchasePage(1);
                  }}
                  itemName="purchases"
                />
              </>
            ) : (
              <>
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
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
                        <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                          <CreditCard className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                          <p className="text-sm font-medium text-slate-900">{t.common.noData}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {search || paymentMethodFilter !== 'ALL'
                              ? 'No payments matched your filter criteria.'
                              : 'No supplier payments recorded yet.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      paginatedPayments.map((pay) => (
                        <tr key={pay.id} className="hover:bg-slate-50/50 transition">
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
                <DataTablePagination
                  currentPage={paymentPage}
                  pageSize={paymentPageSize}
                  totalItems={filteredPayments.length}
                  onPageChange={setPaymentPage}
                  onPageSizeChange={(sz) => {
                    setPaymentPageSize(sz);
                    setPaymentPage(1);
                  }}
                  itemName="payments"
                />
              </>
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
                    <button
                      type="button"
                      onClick={() => handleCopyId(selectedPurchase.id)}
                      title={`UUID: ${selectedPurchase.id}`}
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded px-1 transition"
                    >
                      <span>{selectedPurchase.id.slice(0, 8)}...</span>
                      {copiedId === selectedPurchase.id ? (
                        <Check className="h-2.5 w-2.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-2.5 w-2.5" />
                      )}
                      {copiedId === selectedPurchase.id && (
                        <span className="text-[10px] text-emerald-600 font-semibold">Copied</span>
                      )}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Supplier: <strong>{selectedPurchase.supplier.name}</strong>
                    {selectedPurchase.supplier.phone ? ` (${selectedPurchase.supplier.phone})` : ''} · Branch:{' '}
                    {selectedPurchase.branch.name}
                    {selectedPurchase.employee && ` · Purchaser: ${selectedPurchase.employee.name}`}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Ordered: {new Date(selectedPurchase.purchaseDate).toLocaleString()}
                    {selectedPurchase.receivedAt &&
                      ` · Received: ${new Date(selectedPurchase.receivedAt).toLocaleString()}`}
                    {selectedPurchase.createdAt &&
                      ` · Created: ${new Date(selectedPurchase.createdAt).toLocaleString()}`}
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
