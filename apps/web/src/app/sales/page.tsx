'use client';

import {
  formatCurrency,
  PAYMENT_METHODS,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
  type PaymentMethod,
} from '@cambodia-pos/shared';
import { Download, Eye, Plus, Printer, RotateCcw, Search, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';
import { downloadOrderReceiptHtml } from '@/lib/receipt';

interface OrderSummary {
  id: string;
  orderNumber: string;
  totalAmount: string;
  paidAmount: string;
  currencyCode: CurrencyCode;
  status: string;
  createdAt: string;
  branch: { name: string };
  customer: { name: string } | null;
  cashierEmployee: { name: string };
}

interface OrderDetail extends OrderSummary {
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  changeAmount: string;
  completedAt?: string;
  branch: { name: string; phone?: string | null; address?: string | null };
  orderItems: Array<{
    id: string;
    productId: string;
    productNameSnapshot: string;
    skuSnapshot: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    product?: { id: string; trackInventory: boolean } | null;
  }>;
  payments: Array<{
    id: string;
    paymentMethod: string;
    amount: string;
    currencyCode: CurrencyCode;
    referenceNumber?: string | null;
    paidAt: string;
  }>;
  saleReturns?: Array<{
    id: string;
    returnNumber: string;
    refundAmount: string;
    refundMethod: string;
    restockStatus: string;
    returnReason: string;
    returnedAt: string;
    saleReturnItems?: Array<{
      id: string;
      orderItemId: string;
      quantity: string;
      restockQuantity: string;
    }>;
  }>;
}

interface PaymentRow {
  id: string;
  paymentMethod: string;
  amount: string;
  amountInOrderCurrency: string;
  currencyCode: CurrencyCode;
  referenceNumber: string | null;
  status: string;
  paidAt: string;
  order: {
    id: string;
    orderNumber: string;
    currencyCode: CurrencyCode;
    branch: { id: string; name: string };
  };
}

interface ReturnRow {
  id: string;
  returnNumber: string;
  returnReason: string;
  refundAmount: string;
  refundMethod: string;
  restockStatus: string;
  status: string;
  returnedAt: string;
  branch: { name: string };
  employee: { name: string };
  order: { id: string; orderNumber: string; currencyCode: CurrencyCode };
}

interface ReturnDetail {
  id: string;
  returnNumber: string;
  returnReason: string;
  refundAmount: string;
  refundMethod: string;
  restockStatus: string;
  status: string;
  returnedAt: string;
  branch: { name: string; phone?: string | null; address?: string | null };
  employee: { name: string; employeeCode?: string };
  order: {
    id: string;
    orderNumber: string;
    currencyCode: CurrencyCode;
    totalAmount: string;
    createdAt: string;
    customer?: { id: string; name: string; phone?: string | null } | null;
  };
  saleReturnItems: Array<{
    id: string;
    quantity: string;
    unitPrice: string;
    refundAmount: string;
    restockQuantity: string;
    product?: { id: string; name: string; sku: string; barcode?: string | null } | null;
  }>;
}

export default function SalesPage() {
  const { activeTenant, activeBranch, hasPermission } = useAuth();
  const { t } = useI18n();
  const canRefund = hasPermission('sales.refund');

  const [tab, setTab] = useState<'orders' | 'payments' | 'returns'>('orders');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');
  const [paymentCurrencyFilter, setPaymentCurrencyFilter] = useState('ALL');
  const [refundMethodFilter, setRefundMethodFilter] = useState('ALL');
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [returnsList, setReturnsList] = useState<ReturnRow[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<ReturnDetail | null>(null);
  const [salePickerOpen, setSalePickerOpen] = useState(false);
  const [salePickerSearch, setSalePickerSearch] = useState('');
  const [eligibleOrders, setEligibleOrders] = useState<OrderSummary[]>([]);
  const [returnModalOrder, setReturnModalOrder] = useState<OrderDetail | null>(null);
  const [returnReason, setReturnReason] = useState('Customer return');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');
  const [returnQtys, setReturnQtys] = useState<
    Record<string, { qty: string; restock: string; restockEnabled: boolean }>
  >({});
  const [returnModalError, setReturnModalError] = useState<string | null>(null);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeTenant) return;
    const orderQs = new URLSearchParams();
    if (activeBranch) orderQs.set('branchId', activeBranch.id);
    if (search) orderQs.set('search', search);
    if (statusFilter !== 'ALL') orderQs.set('status', statusFilter);

    const paymentQs = new URLSearchParams();
    if (activeBranch) paymentQs.set('branchId', activeBranch.id);
    if (search) paymentQs.set('search', search);
    if (paymentMethodFilter !== 'ALL') paymentQs.set('paymentMethod', paymentMethodFilter);
    if (paymentCurrencyFilter !== 'ALL') paymentQs.set('currencyCode', paymentCurrencyFilter);

    const returnQs = new URLSearchParams();
    if (activeBranch) returnQs.set('branchId', activeBranch.id);
    if (search) returnQs.set('search', search);
    if (refundMethodFilter !== 'ALL') returnQs.set('refundMethod', refundMethodFilter);

    const [ords, pays, rets] = await Promise.all([
      apiRequest<OrderSummary[]>(`/orders?${orderQs.toString()}`),
      apiRequest<PaymentRow[]>(`/payments?${paymentQs.toString()}`),
      apiRequest<ReturnRow[]>(`/returns?${returnQs.toString()}`),
    ]);
    setOrders(ords);
    setPayments(pays);
    setReturnsList(rets);
  }, [
    activeTenant,
    activeBranch,
    search,
    statusFilter,
    paymentMethodFilter,
    paymentCurrencyFilter,
    refundMethodFilter,
  ]);

  useEffect(() => {
    void loadData().catch(() => {});
  }, [loadData]);

  const openOrderDetail = async (id: string) => {
    setError(null);
    try {
      const detail = await apiRequest<OrderDetail>(`/orders/${id}`);
      setSelectedOrder(detail);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load order details');
    }
  };

  const openReturnDetail = async (returnId: string) => {
    setError(null);
    try {
      const detail = await apiRequest<ReturnDetail>(`/returns/${returnId}`);
      setSelectedReturn(detail);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load return details');
    }
  };

  const openSalePicker = async () => {
    if (!activeTenant) return;
    setError(null);
    setSalePickerSearch('');
    const qs = new URLSearchParams();
    if (activeBranch) qs.set('branchId', activeBranch.id);
    try {
      const list = await apiRequest<OrderSummary[]>(`/orders?${qs.toString()}`);
      setEligibleOrders(list.filter((o) => o.status !== 'RETURNED' && o.status !== 'VOIDED'));
      setSalePickerOpen(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load orders');
    }
  };

  const openReturnModal = (detail: OrderDetail) => {
    const initial: Record<string, { qty: string; restock: string; restockEnabled: boolean }> = {};
    for (const item of detail.orderItems) {
      const tracked = item.product ? item.product.trackInventory : true;
      initial[item.id] = { qty: '0', restock: '0', restockEnabled: tracked };
    }
    setReturnQtys(initial);
    setReturnReason('Customer return');
    setRefundMethod('CASH');
    setReturnModalError(null);
    setReturnModalOrder(detail);
    setSelectedOrder(null);
    setSalePickerOpen(false);
  };

  const openReturnForOrderId = async (id: string) => {
    setError(null);
    try {
      const detail = await apiRequest<OrderDetail>(`/orders/${id}`);
      openReturnModal(detail);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load sale for return');
    }
  };

  const alreadyReturnedMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!returnModalOrder?.saleReturns) return map;
    for (const sr of returnModalOrder.saleReturns) {
      for (const sri of sr.saleReturnItems ?? []) {
        map[sri.orderItemId] = (map[sri.orderItemId] ?? 0) + Number(sri.quantity);
      }
    }
    return map;
  }, [returnModalOrder]);

  const returnEstimate = useMemo(() => {
    if (!returnModalOrder) {
      return { lineRefunds: {} as Record<string, number>, estimatedRefund: 0, previouslyRefunded: 0 };
    }
    const lineRefunds: Record<string, number> = {};
    let returnSubtotal = 0;
    let willBeFullyReturned = true;

    for (const oi of returnModalOrder.orderItems) {
      const sold = Number(oi.quantity);
      const returnedBefore = alreadyReturnedMap[oi.id] ?? 0;
      const remaining = Math.max(0, sold - returnedBefore);
      const reqQty = Math.max(0, Number(returnQtys[oi.id]?.qty || '0'));
      const clampedQty = Math.min(reqQty, remaining);
      if (returnedBefore + clampedQty < sold - 1e-6) {
        willBeFullyReturned = false;
      }
      const lineRefund = sold > 0 ? (Number(oi.lineTotal) * clampedQty) / sold : 0;
      lineRefunds[oi.id] = lineRefund;
      returnSubtotal += lineRefund;
    }

    const previouslyRefunded = (returnModalOrder.saleReturns ?? []).reduce(
      (sum, sr) => sum + Number(sr.refundAmount),
      0,
    );
    const orderTotal = Number(returnModalOrder.totalAmount);
    const orderSubtotal = Number(returnModalOrder.subtotal);
    const remainingRefundable = Math.max(0, orderTotal - previouslyRefunded);

    let estimatedRefund = 0;
    if (returnSubtotal > 0) {
      if (willBeFullyReturned) {
        estimatedRefund = remainingRefundable;
      } else if (orderSubtotal > 0 && Math.abs(orderTotal - orderSubtotal) > 1e-6) {
        estimatedRefund = Math.min(remainingRefundable, (returnSubtotal * orderTotal) / orderSubtotal);
      } else {
        estimatedRefund = Math.min(remainingRefundable, returnSubtotal);
      }
    }

    if (returnModalOrder.currencyCode === 'KHR') {
      estimatedRefund = Math.round(estimatedRefund);
    } else {
      estimatedRefund = Math.round(estimatedRefund * 100) / 100;
    }

    return { lineRefunds, estimatedRefund, previouslyRefunded };
  }, [returnModalOrder, alreadyReturnedMap, returnQtys]);

  const submitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalOrder) return;
    setReturnModalError(null);

    const items = returnModalOrder.orderItems
      .map((oi) => {
        const entry = returnQtys[oi.id];
        const qtyNum = Number(entry?.qty ?? '0');
        if (!(qtyNum > 0)) return null;
        const tracked = oi.product ? oi.product.trackInventory : true;
        const restockQty = tracked && entry?.restockEnabled ? entry.restock : '0';
        return {
          orderItemId: oi.id,
          quantity: entry.qty.trim(),
          restockQuantity: restockQty.trim() || '0',
        };
      })
      .filter((x): x is { orderItemId: string; quantity: string; restockQuantity: string } => Boolean(x));

    if (items.length === 0) {
      setReturnModalError('Specify at least one item quantity greater than zero to return.');
      return;
    }

    setSubmittingReturn(true);
    try {
      const created = await apiRequest<{ returnNumber: string; refundAmount: string }>('/returns', {
        method: 'POST',
        body: JSON.stringify({
          orderId: returnModalOrder.id,
          returnReason,
          refundMethod,
          items,
        }),
      });
      const currency = returnModalOrder.currencyCode;
      setReturnModalOrder(null);
      setFeedback(
        `Return ${created.returnNumber} processed — refunded ${formatCurrency(created.refundAmount, currency)} via ${refundMethod}.`,
      );
      await loadData();
    } catch (err) {
      setReturnModalError(err instanceof ApiClientError ? err.message : 'Unable to process return');
    } finally {
      setSubmittingReturn(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <h1 className="text-2xl font-bold text-slate-900">{t.nav.sales}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {tab === 'orders' && (
              <select
                aria-label="Filter orders by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <option value="ALL">All Status</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="PARTIALLY_RETURNED">PARTIALLY_RETURNED</option>
                <option value="RETURNED">RETURNED</option>
              </select>
            )}
            {tab === 'payments' && (
              <>
                <select
                  aria-label="Filter payments by method"
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="ALL">All Methods</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter payments by currency"
                  value={paymentCurrencyFilter}
                  onChange={(e) => setPaymentCurrencyFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
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
            {tab === 'returns' && (
              <>
                <select
                  aria-label="Filter refunds by method"
                  value={refundMethodFilter}
                  onChange={(e) => setRefundMethodFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="ALL">All Refund Methods</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {canRefund && (
                  <button
                    type="button"
                    onClick={() => void openSalePicker()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                  >
                    <Plus className="h-4 w-4" /> New Return
                  </button>
                )}
              </>
            )}
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  tab === 'orders'
                    ? 'Order # or customer...'
                    : tab === 'payments'
                      ? 'Order # or Ref #...'
                      : 'Return # or Order #...'
                }
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-b border-slate-200 pb-3 print:hidden">
          {(['orders', 'payments', 'returns'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize ${
                tab === k ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {k === 'orders'
                ? `Orders (${orders.length})`
                : k === 'payments'
                  ? `Payments (${payments.length})`
                  : `Returns (${returnsList.length})`}
            </button>
          ))}
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

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden">
          <div className="overflow-x-auto">
            {tab === 'orders' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Order #</th>
                    <th className="px-4 py-3">{t.common.date}</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{o.orderNumber}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(o.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{o.branch.name}</td>
                      <td className="px-4 py-3 text-slate-600">{o.customer?.name ?? 'Walk-in'}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">
                        {formatCurrency(o.totalAmount, o.currencyCode)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void openOrderDetail(o.id)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" /> Details
                          </button>
                          {o.status !== 'RETURNED' && o.status !== 'VOIDED' && canRefund && (
                            <button
                              type="button"
                              onClick={() => void openReturnForOrderId(o.id)}
                              className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Return
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === 'payments' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Order #</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Reference #</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Paid At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-mono text-xs">
                        <button
                          type="button"
                          onClick={() => void openOrderDetail(p.order.id)}
                          className="font-semibold text-emerald-700 hover:underline"
                        >
                          {p.order.orderNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{p.order.branch.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">
                        <div>{formatCurrency(p.amount, p.currencyCode)}</div>
                        {p.currencyCode !== p.order.currencyCode && (
                          <div className="text-[11px] font-normal text-slate-500">
                            ≈ {formatCurrency(p.amountInOrderCurrency, p.order.currencyCode)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {p.referenceNumber || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(p.paidAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                        No payment records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Return #</th>
                    <th className="px-4 py-3">Order #</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Refund</th>
                    <th className="px-4 py-3">Restock</th>
                    <th className="px-4 py-3">Processed By</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Returned At</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {returnsList.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => void openReturnDetail(r.id)}
                          className="font-bold text-rose-700 hover:underline inline-flex items-center gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {r.returnNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <button
                          type="button"
                          onClick={() => void openOrderDetail(r.order.id)}
                          className="font-semibold text-emerald-700 hover:underline"
                        >
                          {r.order.orderNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.branch.name}</td>
                      <td className="px-4 py-3 text-slate-600">{r.returnReason}</td>
                      <td className="px-4 py-3 font-semibold text-rose-700">
                        {formatCurrency(r.refundAmount, r.order.currencyCode)} ({r.refundMethod})
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            r.restockStatus === 'RESTOCKED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {r.restockStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{r.employee.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(r.returnedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void openReturnDetail(r.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <Eye className="h-3 w-3" /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {returnsList.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-500">
                        No refund or return records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Order Detail & Receipt Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 print:static print:bg-white print:p-0">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl print:shadow-none">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-mono text-lg font-bold text-slate-900">
                    {selectedOrder.orderNumber}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedOrder.branch.name} · Cashier: {selectedOrder.cashierEmployee.name} ·{' '}
                    {selectedOrder.customer?.name ?? 'Walk-in'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(selectedOrder.completedAt || selectedOrder.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="text-sm text-slate-500 print:hidden"
                >
                  {t.common.close}
                </button>
              </div>
              <div className="mt-4 divide-y divide-slate-100 border-y border-dashed border-slate-200 py-2 text-sm">
                {selectedOrder.orderItems.map((oi) => (
                  <div key={oi.id} className="flex justify-between py-2">
                    <div>
                      <p className="font-medium text-slate-900">{oi.productNameSnapshot}</p>
                      <p className="text-xs text-slate-500">
                        {oi.skuSnapshot} · {oi.quantity} ×{' '}
                        {formatCurrency(oi.unitPrice, selectedOrder.currencyCode)}
                      </p>
                    </div>
                    <span className="font-semibold">
                      {formatCurrency(oi.lineTotal, selectedOrder.currencyCode)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>{t.common.subtotal}</span>
                  <span>{formatCurrency(selectedOrder.subtotal, selectedOrder.currencyCode)}</span>
                </div>
                {Number(selectedOrder.discountAmount) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>{t.common.discount}</span>
                    <span>
                      -{formatCurrency(selectedOrder.discountAmount, selectedOrder.currencyCode)}
                    </span>
                  </div>
                )}
                {Number(selectedOrder.taxAmount) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>{t.common.tax}</span>
                    <span>{formatCurrency(selectedOrder.taxAmount, selectedOrder.currencyCode)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-100 pt-1.5 text-sm font-bold text-slate-900">
                  <span>{t.common.total}</span>
                  <span>{formatCurrency(selectedOrder.totalAmount, selectedOrder.currencyCode)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{t.pos.paidAmount}</span>
                  <span>{formatCurrency(selectedOrder.paidAmount, selectedOrder.currencyCode)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{t.pos.changeAmount}</span>
                  <span>{formatCurrency(selectedOrder.changeAmount, selectedOrder.currencyCode)}</span>
                </div>
                <div className="pt-1 text-[11px] text-slate-500">
                  Payments:{' '}
                  {selectedOrder.payments
                    .map(
                      (p) =>
                        `${p.paymentMethod} ${formatCurrency(p.amount, p.currencyCode)}${
                          p.referenceNumber ? ` (${p.referenceNumber})` : ''
                        }`,
                    )
                    .join(', ')}
                </div>
                {selectedOrder.saleReturns && selectedOrder.saleReturns.length > 0 && (
                  <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/70 p-2.5 text-[11px] text-rose-900">
                    <p className="font-semibold">Refunds Issued</p>
                    <div className="mt-1 space-y-1">
                      {selectedOrder.saleReturns.map((sr) => (
                        <div key={sr.id} className="flex items-center justify-between gap-2">
                          <span>
                            {sr.returnNumber} · {sr.returnReason} ({sr.restockStatus})
                          </span>
                          <span className="font-semibold">
                            -{formatCurrency(sr.refundAmount, selectedOrder.currencyCode)} via{' '}
                            {sr.refundMethod}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3 print:hidden">
                <button
                  type="button"
                  onClick={() =>
                    downloadOrderReceiptHtml(selectedOrder, {
                      businessName: activeTenant?.name ?? 'Receipt',
                      logoUrl: activeTenant?.logoUrl,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" /> Download Receipt
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" /> {t.common.print}
                </button>
                {selectedOrder.status !== 'RETURNED' &&
                  selectedOrder.status !== 'VOIDED' &&
                  canRefund && (
                  <button
                    type="button"
                    onClick={() => openReturnModal(selectedOrder)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Return / Refund
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Original Sale Picker Modal (from Returns tab) */}
        {salePickerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Select Original Sale to Return</h2>
                <button type="button" onClick={() => setSalePickerOpen(false)}>
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={salePickerSearch}
                  onChange={(e) => setSalePickerSearch(e.target.value)}
                  placeholder="Search by Order # or customer name..."
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
                {eligibleOrders
                  .filter((o) => {
                    const q = salePickerSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      o.orderNumber.toLowerCase().includes(q) ||
                      (o.customer?.name ?? 'walk-in').toLowerCase().includes(q)
                    );
                  })
                  .map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-mono text-xs font-bold text-slate-900">
                          {o.orderNumber}{' '}
                          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 font-sans text-[10px] font-semibold text-slate-700">
                            {o.status}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {o.branch.name} · {o.customer?.name ?? 'Walk-in'} ·{' '}
                          {new Date(o.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-emerald-700">
                          {formatCurrency(o.totalAmount, o.currencyCode)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void openReturnForOrderId(o.id)}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  ))}
                {eligibleOrders.length === 0 && (
                  <p className="p-6 text-center text-sm text-slate-500">
                    No returnable sales available in this branch.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sale Return Modal */}
        {returnModalOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold">Return Items — {returnModalOrder.orderNumber}</h2>
                  <p className="text-xs text-slate-500">
                    Original Total: {formatCurrency(returnModalOrder.totalAmount, returnModalOrder.currencyCode)}
                    {returnEstimate.previouslyRefunded > 0 &&
                      ` · Previously Refunded: ${formatCurrency(
                        returnEstimate.previouslyRefunded.toFixed(2),
                        returnModalOrder.currencyCode,
                      )}`}
                  </p>
                </div>
                <button type="button" onClick={() => setReturnModalOrder(null)}>
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>

              {returnModalError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {returnModalError}
                </div>
              )}

              <form onSubmit={submitReturn} className="mt-4 space-y-4">
                <div className="space-y-2.5">
                  {returnModalOrder.orderItems.map((oi) => {
                    const sold = Number(oi.quantity);
                    const returnedBefore = alreadyReturnedMap[oi.id] ?? 0;
                    const remaining = Math.max(0, sold - returnedBefore);
                    const tracked = oi.product ? oi.product.trackInventory : true;
                    const entry = returnQtys[oi.id] ?? {
                      qty: '0',
                      restock: '0',
                      restockEnabled: tracked,
                    };
                    const estLineRefund = returnEstimate.lineRefunds[oi.id] ?? 0;

                    return (
                      <div key={oi.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                        <div className="grid grid-cols-12 items-start gap-2">
                          <div className="col-span-6">
                            <p className="font-semibold text-slate-900">{oi.productNameSnapshot}</p>
                            <p className="text-slate-500">
                              Sold: {oi.quantity}
                              {returnedBefore > 0 && ` · Returned: ${returnedBefore}`} ·{' '}
                              <span className="font-semibold text-slate-700">
                                Remaining: {remaining}
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Line Value: {formatCurrency(oi.lineTotal, returnModalOrder.currencyCode)}
                              {estLineRefund > 0 &&
                                ` · Line Refund ≈ ${formatCurrency(
                                  returnModalOrder.currencyCode === 'KHR'
                                    ? Math.round(estLineRefund)
                                    : estLineRefund.toFixed(2),
                                  returnModalOrder.currencyCode,
                                )}`}
                            </p>
                          </div>
                          <div className="col-span-3">
                            <label className="block text-[10px] font-semibold text-slate-500">
                              Return Qty
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={remaining}
                              step="any"
                              disabled={remaining <= 0}
                              value={entry.qty}
                              onChange={(e) => {
                                const val = e.target.value;
                                setReturnQtys((prev) => {
                                  const curr = prev[oi.id] ?? {
                                    qty: '0',
                                    restock: '0',
                                    restockEnabled: tracked,
                                  };
                                  return {
                                    ...prev,
                                    [oi.id]: {
                                      ...curr,
                                      qty: val,
                                      restock: tracked && curr.restockEnabled ? val : '0',
                                    },
                                  };
                                });
                              }}
                              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 disabled:bg-slate-100"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="block text-[10px] font-semibold text-slate-500">
                              Restock Qty
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={entry.qty || '0'}
                              step="any"
                              disabled={!tracked || !entry.restockEnabled || remaining <= 0}
                              value={tracked && entry.restockEnabled ? entry.restock : '0'}
                              onChange={(e) =>
                                setReturnQtys((prev) => ({
                                  ...prev,
                                  [oi.id]: {
                                    ...(prev[oi.id] ?? {
                                      qty: '0',
                                      restock: '0',
                                      restockEnabled: tracked,
                                    }),
                                    restock: e.target.value,
                                  },
                                }))
                              }
                              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 disabled:bg-slate-100"
                            />
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between border-t border-slate-200/80 pt-2">
                          {tracked ? (
                            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={entry.restockEnabled}
                                disabled={remaining <= 0}
                                onChange={(e) => {
                                  const enabled = e.target.checked;
                                  setReturnQtys((prev) => {
                                    const curr = prev[oi.id] ?? {
                                      qty: '0',
                                      restock: '0',
                                      restockEnabled: tracked,
                                    };
                                    return {
                                      ...prev,
                                      [oi.id]: {
                                        ...curr,
                                        restockEnabled: enabled,
                                        restock: enabled ? curr.qty : '0',
                                      },
                                    };
                                  });
                                }}
                                className="rounded border-slate-300"
                              />
                              Restock returned item(s) to branch inventory
                            </label>
                          ) : (
                            <span className="text-[11px] text-slate-500">
                              Inventory tracking disabled for this product (no stock change)
                            </span>
                          )}
                          {!entry.restockEnabled && tracked && (
                            <span className="text-[11px] font-semibold text-amber-700">
                              Damaged / No restock
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-rose-900">Estimated Refundable Amount</span>
                    <span className="text-base font-bold text-rose-700">
                      {formatCurrency(
                        returnModalOrder.currencyCode === 'KHR'
                          ? returnEstimate.estimatedRefund
                          : returnEstimate.estimatedRefund.toFixed(2),
                        returnModalOrder.currencyCode,
                      )}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Refund Method</label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Return Reason</label>
                    <input
                      required
                      minLength={2}
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      placeholder="Defective, wrong item, damaged..."
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnModalOrder(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReturn}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                  >
                    {submittingReturn ? t.common.saving : 'Confirm Refund'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 5. Return Details Modal */}
        {selectedReturn && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm print:static print:bg-white print:p-0">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl print:shadow-none">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono text-lg font-black text-slate-900">
                      {selectedReturn.returnNumber}
                    </h2>
                    <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                      {selectedReturn.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selectedReturn.branch.name} · Processed by: {selectedReturn.employee.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(selectedReturn.returnedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReturn(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Linked Original Order Info */}
              <div className="my-3 flex items-center justify-between rounded-2xl bg-slate-50 p-3.5 text-xs border border-slate-200">
                <div>
                  <span className="text-slate-500 font-medium">Original Order: </span>
                  <button
                    type="button"
                    onClick={() => {
                      const oid = selectedReturn.order.id;
                      setSelectedReturn(null);
                      void openOrderDetail(oid);
                    }}
                    className="font-mono font-bold text-emerald-700 hover:underline"
                  >
                    {selectedReturn.order.orderNumber}
                  </button>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Customer: {selectedReturn.order.customer?.name ?? 'Walk-in Customer'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 font-medium">Reason: </span>
                  <span className="font-semibold text-slate-800">{selectedReturn.returnReason}</span>
                  <p className="text-[11px] font-bold text-slate-600 mt-0.5">
                    Restock: {selectedReturn.restockStatus}
                  </p>
                </div>
              </div>

              {/* Returned Items Ledger */}
              <div className="my-3 space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Returned Items
                </h3>
                <div className="max-h-56 overflow-y-auto space-y-1.5 border-y border-slate-100 py-2 text-xs">
                  {selectedReturn.saleReturnItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl bg-slate-50/70 p-3 border border-slate-100"
                    >
                      <div>
                        <p className="font-bold text-slate-900">
                          {item.product?.name ?? 'Product'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {item.product?.sku ? `SKU: ${item.product.sku} · ` : ''}
                          Qty Returned: {item.quantity} · Restocked: {item.restockQuantity}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-rose-700">
                          -{formatCurrency(item.refundAmount, selectedReturn.order.currencyCode)}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Unit: {formatCurrency(item.unitPrice, selectedReturn.order.currencyCode)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Refund Tender Summary */}
              <div className="rounded-2xl bg-rose-50/80 p-3.5 text-xs border border-rose-200/80 space-y-1">
                <div className="flex justify-between font-medium text-slate-700">
                  <span>Refund Tender Method:</span>
                  <span className="font-bold text-slate-900">{selectedReturn.refundMethod}</span>
                </div>
                <div className="flex justify-between border-t border-rose-200/60 pt-1 text-sm font-black text-rose-800">
                  <span>Total Refund Paid:</span>
                  <span>
                    {formatCurrency(selectedReturn.refundAmount, selectedReturn.order.currencyCode)}
                  </span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="mt-5 flex justify-end gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Note
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReturn(null)}
                  className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-bold text-white hover:bg-slate-900"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
