'use client';

import {
  formatCurrency,
  PAYMENT_METHODS,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
  type PaymentMethod,
} from '@cambodia-pos/shared';
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  Download,
  Eye,
  FileText,
  Package,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingUp,
  User,
  Users,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTablePagination } from '@/components/DataTablePagination';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';
import { downloadOrderReceiptHtml } from '@/lib/receipt';

interface OrderSummary {
  id: string;
  tenantId?: string;
  branchId?: string;
  customerId?: string | null;
  cashierEmployeeId?: string;
  shiftId?: string | null;
  orderNumber: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  changeAmount: string;
  currencyCode: CurrencyCode;
  exchangeRate: string;
  status: string;
  notes?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  branch: { id?: string; name: string; branchCode?: string; phone?: string | null; address?: string | null };
  customer: { id?: string; name: string; customerCode?: string; phone?: string | null } | null;
  cashierEmployee: { id?: string; name: string; employeeCode?: string };
  shift?: { id: string; shiftNumber: string; status: string } | null;
  _count?: { orderItems: number; payments: number; saleReturns?: number };
}

interface OrderItemRow {
  id: string;
  orderId: string;
  productId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  quantity: string;
  unitPrice: string;
  unitCostSnapshot: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
  order?: {
    id: string;
    orderNumber: string;
    currencyCode: CurrencyCode;
    status: string;
    createdAt: string;
    branch?: { id: string; name: string; branchCode?: string };
    customer?: { id: string; name: string; customerCode?: string } | null;
  };
  product?: {
    id: string;
    name: string;
    sku: string;
    barcode?: string | null;
    trackInventory: boolean;
  };
}

interface OrderDetail extends OrderSummary {
  orderItems: Array<{
    id: string;
    productId: string;
    productNameSnapshot: string;
    skuSnapshot: string;
    quantity: string;
    unitPrice: string;
    unitCostSnapshot?: string;
    discountAmount: string;
    taxAmount: string;
    lineTotal: string;
    product?: { id: string; trackInventory: boolean } | null;
  }>;
  payments: Array<{
    id: string;
    paymentMethod: string;
    amount: string;
    currencyCode: CurrencyCode;
    exchangeRate?: string;
    amountInOrderCurrency?: string;
    referenceNumber?: string | null;
    status: string;
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
  tenantId?: string;
  orderId?: string;
  paymentMethod: string;
  amount: string;
  amountInOrderCurrency: string;
  currencyCode: CurrencyCode;
  exchangeRate?: string;
  referenceNumber: string | null;
  status: string;
  paidAt: string;
  createdAt?: string;
  order: {
    id: string;
    orderNumber: string;
    currencyCode: CurrencyCode;
    branch: { id: string; name: string; branchCode?: string };
    cashierEmployee?: { id: string; name: string; employeeCode?: string };
  };
}

interface ReturnRow {
  id: string;
  tenantId?: string;
  branchId?: string;
  orderId?: string;
  returnNumber: string;
  employeeId?: string;
  returnReason: string;
  subtotal: string;
  refundAmount: string;
  refundMethod: string;
  restockStatus: string;
  status: string;
  returnedAt: string;
  createdAt?: string;
  branch: { id?: string; name: string; branchCode?: string };
  employee: { id?: string; name: string; employeeCode?: string };
  order: { id: string; orderNumber: string; currencyCode: CurrencyCode; totalAmount?: string };
  saleReturnItems?: Array<{ id: string; quantity: string; unitPrice: string; refundAmount: string; restockQuantity: string }>;
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

const EXCHANGE_RATE = 4100;

export default function SalesPage() {
  const { activeTenant, activeBranch, hasPermission } = useAuth();
  const { t } = useI18n();
  const canRefund = hasPermission('sales.refund');

  const [tab, setTab] = useState<'orders' | 'items' | 'payments' | 'returns'>('orders');
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [orderCurrencyFilter, setOrderCurrencyFilter] = useState('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');
  const [paymentCurrencyFilter, setPaymentCurrencyFilter] = useState('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL');
  const [paymentStartDate, setPaymentStartDate] = useState('');
  const [paymentEndDate, setPaymentEndDate] = useState('');
  const [refundMethodFilter, setRefundMethodFilter] = useState('ALL');
  const [returnRestockFilter, setReturnRestockFilter] = useState('ALL');
  const [returnStatusFilter, setReturnStatusFilter] = useState('ALL');
  const [returnStartDate, setReturnStartDate] = useState('');
  const [returnEndDate, setReturnEndDate] = useState('');

  // Pagination states
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(10);
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(10);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentPageSize, setPaymentPageSize] = useState(10);
  const [returnPage, setReturnPage] = useState(1);
  const [returnPageSize, setReturnPageSize] = useState(10);

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [returnsList, setReturnsList] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const orderQs = new URLSearchParams();
      if (activeBranch) {
        orderQs.set('branchId', activeBranch.id);
      } else if (branchFilter !== 'ALL') {
        orderQs.set('branchId', branchFilter);
      }
      if (search.trim()) orderQs.set('search', search.trim());
      if (statusFilter !== 'ALL') orderQs.set('status', statusFilter);
      if (orderCurrencyFilter !== 'ALL') orderQs.set('currencyCode', orderCurrencyFilter);

      const itemQs = new URLSearchParams();
      if (activeBranch) itemQs.set('branchId', activeBranch.id);
      else if (branchFilter !== 'ALL') itemQs.set('branchId', branchFilter);
      if (search.trim()) itemQs.set('search', search.trim());

      const paymentQs = new URLSearchParams();
      if (activeBranch) paymentQs.set('branchId', activeBranch.id);
      else if (branchFilter !== 'ALL') paymentQs.set('branchId', branchFilter);
      if (search.trim()) paymentQs.set('search', search.trim());
      if (paymentMethodFilter !== 'ALL') paymentQs.set('paymentMethod', paymentMethodFilter);
      if (paymentCurrencyFilter !== 'ALL') paymentQs.set('currencyCode', paymentCurrencyFilter);
      if (paymentStatusFilter !== 'ALL') paymentQs.set('status', paymentStatusFilter);
      if (paymentStartDate) paymentQs.set('startDate', paymentStartDate);
      if (paymentEndDate) paymentQs.set('endDate', paymentEndDate);

      const returnQs = new URLSearchParams();
      if (activeBranch) returnQs.set('branchId', activeBranch.id);
      else if (branchFilter !== 'ALL') returnQs.set('branchId', branchFilter);
      if (search.trim()) returnQs.set('search', search.trim());
      if (refundMethodFilter !== 'ALL') returnQs.set('refundMethod', refundMethodFilter);
      if (returnRestockFilter !== 'ALL') returnQs.set('restockStatus', returnRestockFilter);
      if (returnStatusFilter !== 'ALL') returnQs.set('status', returnStatusFilter);
      if (returnStartDate) returnQs.set('startDate', returnStartDate);
      if (returnEndDate) returnQs.set('endDate', returnEndDate);

      const [ords, items, pays, rets] = await Promise.all([
        apiRequest<OrderSummary[]>(`/orders?${orderQs.toString()}`),
        apiRequest<OrderItemRow[]>(`/orders/items?${itemQs.toString()}`),
        apiRequest<PaymentRow[]>(`/payments?${paymentQs.toString()}`),
        apiRequest<ReturnRow[]>(`/returns?${returnQs.toString()}`),
      ]);
      setOrders(ords);
      setOrderItems(items);
      setPayments(pays);
      setReturnsList(rets);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load sales data');
    } finally {
      setLoading(false);
    }
  }, [
    activeTenant,
    activeBranch,
    branchFilter,
    search,
    statusFilter,
    orderCurrencyFilter,
    paymentMethodFilter,
    paymentCurrencyFilter,
    paymentStatusFilter,
    paymentStartDate,
    paymentEndDate,
    refundMethodFilter,
    returnRestockFilter,
    returnStatusFilter,
    returnStartDate,
    returnEndDate,
  ]);

  useEffect(() => {
    void loadData().catch(() => {});
  }, [loadData]);

  // Reset pages when filters change
  useEffect(() => {
    setOrderPage(1);
    setItemPage(1);
    setPaymentPage(1);
    setReturnPage(1);
  }, [search, branchFilter, statusFilter, orderCurrencyFilter, tab]);

  const handleCopyId = (id: string) => {
    void navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

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

  // KPIs
  const kpis = useMemo(() => {
    let grossUsd = 0;
    let completedCount = 0;
    let refundedCount = 0;
    let totalRefundedUsd = 0;
    let totalUnitsSold = 0;

    orders.forEach((o) => {
      const amt = parseFloat(o.totalAmount || '0') || 0;
      const inUsd = o.currencyCode === 'KHR' ? amt / EXCHANGE_RATE : amt;
      grossUsd += inUsd;
      if (o.status === 'COMPLETED') completedCount += 1;
      if (o.status === 'RETURNED' || o.status === 'PARTIALLY_RETURNED') refundedCount += 1;
    });

    orderItems.forEach((oi) => {
      totalUnitsSold += parseFloat(oi.quantity || '0') || 0;
    });

    returnsList.forEach((r) => {
      const refAmt = parseFloat(r.refundAmount || '0') || 0;
      const inUsd = r.order.currencyCode === 'KHR' ? refAmt / EXCHANGE_RATE : refAmt;
      totalRefundedUsd += inUsd;
    });

    const avgBasket = orders.length > 0 ? grossUsd / orders.length : 0;

    return {
      totalOrders: orders.length,
      completedCount,
      refundedCount,
      grossUsd,
      avgBasket,
      totalRefundedUsd,
      totalUnitsSold,
      totalPayments: payments.length,
    };
  }, [orders, orderItems, returnsList, payments]);

  // Client-side filtering & search fallbacks
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (orderCurrencyFilter !== 'ALL' && o.currencyCode !== orderCurrencyFilter) return false;
      if (branchFilter !== 'ALL' && o.branchId && o.branchId !== branchFilter) return false;
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        (o.customer?.name && o.customer.name.toLowerCase().includes(q)) ||
        (o.customer?.customerCode && o.customer.customerCode.toLowerCase().includes(q)) ||
        (o.customer?.phone && o.customer.phone.toLowerCase().includes(q)) ||
        (o.cashierEmployee?.name && o.cashierEmployee.name.toLowerCase().includes(q)) ||
        (o.shift?.shiftNumber && o.shift.shiftNumber.toLowerCase().includes(q)) ||
        (o.notes && o.notes.toLowerCase().includes(q)) ||
        o.id.toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter, orderCurrencyFilter, branchFilter]);

  const filteredOrderItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orderItems.filter((oi) => {
      if (branchFilter !== 'ALL' && oi.order?.branch?.id && oi.order.branch.id !== branchFilter) return false;
      if (!q) return true;
      return (
        oi.productNameSnapshot.toLowerCase().includes(q) ||
        oi.skuSnapshot.toLowerCase().includes(q) ||
        (oi.order?.orderNumber && oi.order.orderNumber.toLowerCase().includes(q)) ||
        (oi.order?.customer?.name && oi.order.customer.name.toLowerCase().includes(q)) ||
        oi.id.toLowerCase().includes(q)
      );
    });
  }, [orderItems, search, branchFilter]);

  const paginatedOrders = useMemo(() => {
    const start = (orderPage - 1) * orderPageSize;
    return filteredOrders.slice(start, start + orderPageSize);
  }, [filteredOrders, orderPage, orderPageSize]);

  const paginatedOrderItems = useMemo(() => {
    const start = (itemPage - 1) * itemPageSize;
    return filteredOrderItems.slice(start, start + itemPageSize);
  }, [filteredOrderItems, itemPage, itemPageSize]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (paymentMethodFilter !== 'ALL' && p.paymentMethod !== paymentMethodFilter) return false;
      if (paymentCurrencyFilter !== 'ALL' && p.currencyCode !== paymentCurrencyFilter) return false;
      if (paymentStatusFilter !== 'ALL' && p.status !== paymentStatusFilter) return false;
      if (branchFilter !== 'ALL' && p.order.branch.id !== branchFilter) return false;
      if (paymentStartDate && new Date(p.paidAt) < new Date(paymentStartDate)) return false;
      if (paymentEndDate && new Date(p.paidAt) > new Date(paymentEndDate + 'T23:59:59')) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = p.id.toLowerCase().includes(q);
        const matchesOrder = p.order.orderNumber.toLowerCase().includes(q);
        const matchesBranch = p.order.branch.name.toLowerCase().includes(q);
        const matchesRef = p.referenceNumber ? p.referenceNumber.toLowerCase().includes(q) : false;
        const matchesMethod = p.paymentMethod.toLowerCase().includes(q);
        if (!matchesId && !matchesOrder && !matchesBranch && !matchesRef && !matchesMethod) return false;
      }
      return true;
    });
  }, [
    payments,
    paymentMethodFilter,
    paymentCurrencyFilter,
    paymentStatusFilter,
    branchFilter,
    paymentStartDate,
    paymentEndDate,
    search,
  ]);

  const paginatedPayments = useMemo(() => {
    const start = (paymentPage - 1) * paymentPageSize;
    return filteredPayments.slice(start, start + paymentPageSize);
  }, [filteredPayments, paymentPage, paymentPageSize]);

  useEffect(() => {
    setPaymentPage(1);
  }, [
    paymentMethodFilter,
    paymentCurrencyFilter,
    paymentStatusFilter,
    paymentStartDate,
    paymentEndDate,
    search,
    branchFilter,
  ]);

  const filteredReturns = useMemo(() => {
    return returnsList.filter((r) => {
      if (refundMethodFilter !== 'ALL' && r.refundMethod !== refundMethodFilter) return false;
      if (returnRestockFilter !== 'ALL' && r.restockStatus !== returnRestockFilter) return false;
      if (returnStatusFilter !== 'ALL' && r.status !== returnStatusFilter) return false;
      if (branchFilter !== 'ALL' && r.branch?.id && r.branch.id !== branchFilter) return false;
      if (returnStartDate && new Date(r.returnedAt) < new Date(returnStartDate)) return false;
      if (returnEndDate && new Date(r.returnedAt) > new Date(returnEndDate + 'T23:59:59')) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = r.id.toLowerCase().includes(q);
        const matchesReturn = r.returnNumber.toLowerCase().includes(q);
        const matchesOrder = r.order.orderNumber.toLowerCase().includes(q);
        const matchesBranch = r.branch.name.toLowerCase().includes(q);
        const matchesEmp = r.employee.name.toLowerCase().includes(q);
        const matchesReason = r.returnReason.toLowerCase().includes(q);
        const matchesMethod = r.refundMethod.toLowerCase().includes(q);
        if (
          !matchesId &&
          !matchesReturn &&
          !matchesOrder &&
          !matchesBranch &&
          !matchesEmp &&
          !matchesReason &&
          !matchesMethod
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    returnsList,
    refundMethodFilter,
    returnRestockFilter,
    returnStatusFilter,
    branchFilter,
    returnStartDate,
    returnEndDate,
    search,
  ]);

  const paginatedReturns = useMemo(() => {
    const start = (returnPage - 1) * returnPageSize;
    return filteredReturns.slice(start, start + returnPageSize);
  }, [filteredReturns, returnPage, returnPageSize]);

  useEffect(() => {
    setReturnPage(1);
  }, [
    refundMethodFilter,
    returnRestockFilter,
    returnStatusFilter,
    returnStartDate,
    returnEndDate,
    search,
    branchFilter,
  ]);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header & Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 text-emerald-600" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {t.nav.sales}
              </h1>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                {orders.length} orders · {orderItems.length} line items
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Manage transactions, order line items snapshots, profit margins, multi-currency split payments, and customer returns.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
              title={t.common.refresh}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t.common.refresh}</span>
            </button>
            {tab === 'returns' && canRefund && (
              <button
                type="button"
                onClick={() => void openSalePicker()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition"
              >
                <Plus className="h-4 w-4" />
                <span>New Return</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications */}
        {feedback && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <span>{feedback}</span>
            </div>
            <button type="button" onClick={() => setFeedback(null)} className="text-emerald-600 hover:text-emerald-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError(null)} className="text-red-500 hover:text-red-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* KPI Cards Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Orders
              </span>
              <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
                <ShoppingBag className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{kpis.totalOrders}</span>
              <span className="text-xs font-medium text-emerald-600">
                {kpis.completedCount} completed
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{kpis.totalUnitsSold} total units sold</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Gross Revenue
              </span>
              <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-emerald-600">
                {formatCurrency(kpis.grossUsd, 'USD')}
              </div>
              <div className="text-xs text-slate-500">
                &asymp; {formatCurrency(kpis.grossUsd * EXCHANGE_RATE, 'KHR')}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">Cumulative sales across branches</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Avg. Basket Size
              </span>
              <div className="rounded-xl bg-purple-50 p-2.5 text-purple-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(kpis.avgBasket, 'USD')}
              </div>
              <div className="text-xs text-slate-500">
                &asymp; {formatCurrency(kpis.avgBasket * EXCHANGE_RATE, 'KHR')}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">Per sales transaction</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Returns / Refunds
              </span>
              <div className="rounded-xl bg-rose-50 p-2.5 text-rose-600">
                <RotateCcw className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-rose-700">
                {formatCurrency(kpis.totalRefundedUsd, 'USD')}
              </div>
              <div className="text-xs text-slate-500">
                {returnsList.length} transaction(s) returned
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">Reversed customer refunds</p>
          </div>
        </div>

        {/* Tab Controls & Filters Strip */}
        <div className="space-y-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1">
              {(['orders', 'items', 'payments', 'returns'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                    tab === k
                      ? 'bg-white text-slate-900 shadow-sm font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {k === 'orders'
                    ? `Orders (${filteredOrders.length})`
                    : k === 'items'
                      ? `Order Items (${filteredOrderItems.length})`
                      : k === 'payments'
                        ? `Payments (${payments.length})`
                        : `Returns (${returnsList.length})`}
                </button>
              ))}
            </div>

            {/* Filter Controls per Tab */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Branch Filter (if not branch-locked) */}
              {!activeBranch && activeTenant?.branches && activeTenant.branches.length > 1 && (
                <select
                  aria-label="Filter by branch"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">All Branches</option>
                  {activeTenant.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}

              {tab === 'orders' && (
                <>
                  <select
                    aria-label="Filter orders by status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Status</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="PARTIALLY_RETURNED">Partially Returned</option>
                    <option value="RETURNED">Returned</option>
                    <option value="VOIDED">Voided</option>
                  </select>

                  <select
                    aria-label="Filter orders by currency"
                    value={orderCurrencyFilter}
                    onChange={(e) => setOrderCurrencyFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
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

              {tab === 'payments' && (
                <>
                  <select
                    aria-label="Filter payments by method"
                    value={paymentMethodFilter}
                    onChange={(e) => setPaymentMethodFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Tender Methods</option>
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
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Currencies</option>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter payments by status"
                    value={paymentStatusFilter}
                    onChange={(e) => setPaymentStatusFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Status</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="PENDING">Pending</option>
                    <option value="FAILED">Failed</option>
                  </select>
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs shadow-sm">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="date"
                      value={paymentStartDate}
                      onChange={(e) => setPaymentStartDate(e.target.value)}
                      className="bg-transparent text-xs text-slate-700 focus:outline-none"
                      aria-label="Payment start date filter"
                    />
                    <span className="text-slate-400">&ndash;</span>
                    <input
                      type="date"
                      value={paymentEndDate}
                      onChange={(e) => setPaymentEndDate(e.target.value)}
                      className="bg-transparent text-xs text-slate-700 focus:outline-none"
                      aria-label="Payment end date filter"
                    />
                  </div>
                  {(paymentMethodFilter !== 'ALL' ||
                    paymentCurrencyFilter !== 'ALL' ||
                    paymentStatusFilter !== 'ALL' ||
                    paymentStartDate ||
                    paymentEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethodFilter('ALL');
                        setPaymentCurrencyFilter('ALL');
                        setPaymentStatusFilter('ALL');
                        setPaymentStartDate('');
                        setPaymentEndDate('');
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition shadow-sm"
                    >
                      Clear
                    </button>
                  )}
                </>
              )}

              {tab === 'returns' && (
                <>
                  <select
                    aria-label="Filter refunds by method"
                    value={refundMethodFilter}
                    onChange={(e) => setRefundMethodFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Refund Methods</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter returns by restock status"
                    value={returnRestockFilter}
                    onChange={(e) => setReturnRestockFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Restock Statuses</option>
                    <option value="RESTOCKED">RESTOCKED</option>
                    <option value="PARTIAL">PARTIAL</option>
                    <option value="NONE">NONE</option>
                  </select>

                  <select
                    aria-label="Filter returns by status"
                    value={returnStatusFilter}
                    onChange={(e) => setReturnStatusFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>

                  {/* Return Date Range */}
                  <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="date"
                      value={returnStartDate}
                      onChange={(e) => setReturnStartDate(e.target.value)}
                      className="bg-transparent text-xs text-slate-700 focus:outline-none"
                      aria-label="Return start date filter"
                    />
                    <span className="text-slate-400 text-xs">to</span>
                    <input
                      type="date"
                      value={returnEndDate}
                      onChange={(e) => setReturnEndDate(e.target.value)}
                      className="bg-transparent text-xs text-slate-700 focus:outline-none"
                      aria-label="Return end date filter"
                    />
                  </div>

                  {(refundMethodFilter !== 'ALL' ||
                    returnRestockFilter !== 'ALL' ||
                    returnStatusFilter !== 'ALL' ||
                    returnStartDate ||
                    returnEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setRefundMethodFilter('ALL');
                        setReturnRestockFilter('ALL');
                        setReturnStatusFilter('ALL');
                        setReturnStartDate('');
                        setReturnEndDate('');
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition shadow-sm"
                    >
                      Clear
                    </button>
                  )}
                </>
              )}

              {/* Search Bar */}
              <div className="relative min-w-[200px] max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    tab === 'orders'
                      ? 'Order #, customer, shift, cashier...'
                      : tab === 'items'
                        ? 'Product name, SKU, or order #...'
                        : tab === 'payments'
                          ? 'Order # or reference #...'
                          : 'Return # or order #...'
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-7 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none transition"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden">
          <div className="overflow-x-auto">
            {tab === 'orders' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Order & ID</th>
                    <th className="px-5 py-3.5">Date & Shift</th>
                    <th className="px-5 py-3.5">Branch & Cashier</th>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Financials</th>
                    <th className="px-5 py-3.5">Paid & Change</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
                          <span className="text-sm">{t.common.loading}</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                        <ShoppingBag className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-2 text-sm font-medium text-slate-900">{t.common.noData}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {search
                            ? 'No orders matched your search criteria.'
                            : 'No completed sales orders recorded yet.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((o) => {
                      const isUsd = o.currencyCode === 'USD';
                      const num = parseFloat(o.totalAmount || '0') || 0;
                      const counterpart = isUsd ? num * EXCHANGE_RATE : num / EXCHANGE_RATE;
                      const counterpartCur: CurrencyCode = isUsd ? 'KHR' : 'USD';

                      return (
                        <tr key={o.id} className="hover:bg-slate-50/50 transition">
                          {/* Order Number & UUID */}
                          <td className="px-5 py-4">
                            <div className="space-y-0.5">
                              <button
                                type="button"
                                onClick={() => void openOrderDetail(o.id)}
                                className="font-mono text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline block text-left"
                              >
                                {o.orderNumber}
                              </button>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleCopyId(o.id)}
                                  title={`UUID: ${o.id}`}
                                  className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded px-1 transition"
                                >
                                  <span>{o.id.slice(0, 8)}...</span>
                                  <Copy className="h-2.5 w-2.5" />
                                  {copiedId === o.id && (
                                    <span className="text-[10px] text-emerald-600 font-semibold">
                                      Copied
                                    </span>
                                  )}
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Date & Shift */}
                          <td className="px-5 py-4">
                            <div className="text-xs space-y-0.5">
                              <div className="text-slate-700 font-medium">
                                {new Date(o.createdAt).toLocaleDateString()}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                              {o.shift && (
                                <span className="inline-block mt-0.5 rounded bg-blue-50 border border-blue-200 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-blue-700">
                                  {o.shift.shiftNumber}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Branch & Cashier */}
                          <td className="px-5 py-4">
                            <div className="text-xs space-y-0.5">
                              <div className="font-medium text-slate-900 flex items-center gap-1">
                                <Building2 className="h-3 w-3 text-slate-400" />
                                <span>{o.branch.name}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                <User className="h-3 w-3 text-slate-400" />
                                <span>{o.cashierEmployee.name}</span>
                              </div>
                            </div>
                          </td>

                          {/* Customer */}
                          <td className="px-5 py-4">
                            {o.customer ? (
                              <div className="text-xs space-y-0.5">
                                <div className="font-semibold text-slate-900">{o.customer.name}</div>
                                {o.customer.customerCode && (
                                  <span className="inline-block font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                                    {o.customer.customerCode}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Walk-in Guest</span>
                            )}
                          </td>

                          {/* Financials (Total, Subtotal, Discount) */}
                          <td className="px-5 py-4">
                            <div className="space-y-0.5">
                              <div className="text-sm font-bold text-slate-900">
                                {formatCurrency(o.totalAmount, o.currencyCode)}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                &asymp; {formatCurrency(counterpart, counterpartCur)}
                              </div>
                              {(parseFloat(o.discountAmount) > 0 || parseFloat(o.taxAmount) > 0) && (
                                <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  {parseFloat(o.discountAmount) > 0 && (
                                    <span className="text-rose-600 font-medium">
                                      Disc: -{formatCurrency(o.discountAmount, o.currencyCode)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Paid & Change */}
                          <td className="px-5 py-4">
                            <div className="text-xs space-y-0.5">
                              <div className="text-slate-700">
                                Paid: <span className="font-semibold">{formatCurrency(o.paidAmount, o.currencyCode)}</span>
                              </div>
                              {parseFloat(o.changeAmount) > 0 && (
                                <div className="text-[11px] text-emerald-600">
                                  Change: {formatCurrency(o.changeAmount, o.currencyCode)}
                                </div>
                              )}
                              <div className="text-[10px] text-slate-400 font-mono">
                                Rate: {o.exchangeRate}
                              </div>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                o.status === 'COMPLETED'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : o.status === 'RETURNED'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : o.status === 'PARTIALLY_RETURNED'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {o.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void openOrderDetail(o.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
                                title="View order receipt & details"
                              >
                                <Eye className="h-3.5 w-3.5 text-slate-500" />
                                <span>Details</span>
                              </button>
                              {o.status !== 'RETURNED' && o.status !== 'VOIDED' && canRefund && (
                                <button
                                  type="button"
                                  onClick={() => void openReturnForOrderId(o.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100 transition"
                                  title="Return items from this order"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span className="hidden md:inline">Return</span>
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
            ) : tab === 'items' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Product & SKU Snapshot</th>
                    <th className="px-5 py-3.5">Order # & Date</th>
                    <th className="px-5 py-3.5">Branch & Customer</th>
                    <th className="px-5 py-3.5 text-center">Quantity</th>
                    <th className="px-5 py-3.5">Unit Price & Cost</th>
                    <th className="px-5 py-3.5">Discount & Tax</th>
                    <th className="px-5 py-3.5">Line Total & Profit</th>
                    <th className="px-5 py-3.5 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
                          <span className="text-sm">{t.common.loading}</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredOrderItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                        <Boxes className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-2 text-sm font-medium text-slate-900">{t.common.noData}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {search
                            ? 'No order line items match your search criteria.'
                            : 'No sold product line items recorded yet.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedOrderItems.map((oi) => {
                      const cur = oi.order?.currencyCode ?? 'USD';
                      const qty = parseFloat(oi.quantity || '0') || 0;
                      const uPrice = parseFloat(oi.unitPrice || '0') || 0;
                      const uCost = parseFloat(oi.unitCostSnapshot || '0') || 0;
                      const totalCost = qty * uCost;
                      const lTotal = parseFloat(oi.lineTotal || '0') || 0;
                      const profit = lTotal - totalCost;
                      const marginPct = lTotal > 0 ? (profit / lTotal) * 100 : 0;

                      return (
                        <tr key={oi.id} className="hover:bg-slate-50/50 transition">
                          {/* Product Snapshot & SKU */}
                          <td className="px-5 py-4">
                            <div className="space-y-0.5">
                              <p className="font-semibold text-slate-900 text-xs">
                                {oi.productNameSnapshot}
                              </p>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                  {oi.skuSnapshot}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyId(oi.id)}
                                  title={`Item UUID: ${oi.id}`}
                                  className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400 hover:text-slate-600 rounded px-1 transition"
                                >
                                  <span>{oi.id.slice(0, 8)}...</span>
                                  <Copy className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Order # & Date */}
                          <td className="px-5 py-4">
                            <div className="space-y-0.5 text-xs">
                              {oi.order ? (
                                <button
                                  type="button"
                                  onClick={() => void openOrderDetail(oi.orderId)}
                                  className="font-mono font-bold text-emerald-700 hover:underline block text-left"
                                >
                                  {oi.order.orderNumber}
                                </button>
                              ) : (
                                <span className="font-mono text-slate-600">{oi.orderId.slice(0, 8)}</span>
                              )}
                              <span className="text-[10px] text-slate-400 block">
                                {oi.order?.createdAt ? new Date(oi.order.createdAt).toLocaleDateString() : '—'}
                              </span>
                            </div>
                          </td>

                          {/* Branch & Customer */}
                          <td className="px-5 py-4">
                            <div className="space-y-0.5 text-xs">
                              <div className="text-slate-700 font-medium truncate max-w-[140px]">
                                {oi.order?.branch?.name ?? '—'}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                                {oi.order?.customer?.name ?? 'Walk-in Guest'}
                              </div>
                            </div>
                          </td>

                          {/* Quantity */}
                          <td className="px-5 py-4 text-center">
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-800 border border-slate-200">
                              {oi.quantity}
                            </span>
                          </td>

                          {/* Unit Price & Cost */}
                          <td className="px-5 py-4">
                            <div className="space-y-0.5 text-xs">
                              <div className="font-bold text-slate-900">
                                {formatCurrency(oi.unitPrice, cur)}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Cost: {formatCurrency(oi.unitCostSnapshot, cur)}
                              </div>
                            </div>
                          </td>

                          {/* Discount & Tax */}
                          <td className="px-5 py-4">
                            <div className="space-y-0.5 text-xs">
                              {parseFloat(oi.discountAmount || '0') > 0 ? (
                                <div className="text-rose-600 font-medium">
                                  -{formatCurrency(oi.discountAmount, cur)}
                                </div>
                              ) : (
                                <span className="text-slate-400">&mdash;</span>
                              )}
                              {parseFloat(oi.taxAmount || '0') > 0 && (
                                <div className="text-slate-500 text-[10px]">
                                  +{formatCurrency(oi.taxAmount, cur)} tax
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Line Total & Margin */}
                          <td className="px-5 py-4">
                            <div className="space-y-0.5">
                              <div className="font-bold text-slate-900 text-sm">
                                {formatCurrency(oi.lineTotal, cur)}
                              </div>
                              <div className="flex items-center gap-1 text-[10px]">
                                <span
                                  className={`font-semibold ${
                                    profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                  }`}
                                >
                                  {profit >= 0 ? '+' : ''}
                                  {formatCurrency(profit.toFixed(2), cur)} ({Math.round(marginPct)}%)
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => void openOrderDetail(oi.orderId)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
                              title="View parent order"
                            >
                              <Eye className="h-3.5 w-3.5 text-slate-500" />
                              <span className="hidden sm:inline">Order</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : tab === 'payments' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Payment ID</th>
                    <th className="px-5 py-3.5">Order #</th>
                    <th className="px-5 py-3.5">Branch</th>
                    <th className="px-5 py-3.5">Tender Method</th>
                    <th className="px-5 py-3.5">Amount Tendered</th>
                    <th className="px-5 py-3.5">Currency</th>
                    <th className="px-5 py-3.5">Exchange Rate</th>
                    <th className="px-5 py-3.5">Order Converted</th>
                    <th className="px-5 py-3.5">Reference #</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Paid At</th>
                    <th className="px-5 py-3.5">Created At</th>
                    <th className="px-5 py-3.5 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedPayments.map((p) => {
                    const exRateNum = p.exchangeRate ? parseFloat(p.exchangeRate) : EXCHANGE_RATE;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition">
                        {/* Payment ID with copy button */}
                        <td className="px-5 py-4 font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500 font-medium">
                              {p.id.slice(0, 8)}...
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyId(p.id)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                              title="Copy Payment UUID"
                            >
                              {copiedId === p.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Order # */}
                        <td className="px-5 py-4 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => void openOrderDetail(p.order.id)}
                            className="font-bold text-emerald-700 hover:underline"
                            title="View order details"
                          >
                            {p.order.orderNumber}
                          </button>
                        </td>

                        {/* Branch */}
                        <td className="px-5 py-4 text-xs text-slate-600">
                          <div className="font-medium text-slate-800">{p.order.branch.name}</div>
                          {p.order.branch.branchCode && (
                            <div className="font-mono text-[10px] text-slate-400">
                              {p.order.branch.branchCode}
                            </div>
                          )}
                        </td>

                        {/* Tender Method */}
                        <td className="px-5 py-4">
                          <span className="rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                            {p.paymentMethod}
                          </span>
                        </td>

                        {/* Amount Tendered */}
                        <td className="px-5 py-4 font-semibold text-slate-900 text-xs">
                          {formatCurrency(p.amount, p.currencyCode)}
                        </td>

                        {/* Currency Code */}
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {p.currencyCode}
                          </span>
                        </td>

                        {/* Exchange Rate */}
                        <td className="px-5 py-4 text-xs font-mono text-slate-500">
                          {p.currencyCode === 'USD' ? (
                            <span className="rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5 text-[11px]">
                              1.000000
                            </span>
                          ) : (
                            <span
                              className="rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5 text-[11px]"
                              title={`1 USD = ${exRateNum.toLocaleString()} KHR`}
                            >
                              &asymp; {exRateNum.toLocaleString()} / $
                            </span>
                          )}
                        </td>

                        {/* Converted (Order Cur) */}
                        <td className="px-5 py-4 text-xs font-semibold text-slate-800">
                          <div>{formatCurrency(p.amountInOrderCurrency, p.order.currencyCode)}</div>
                          {p.currencyCode !== p.order.currencyCode && (
                            <div className="text-[10px] text-slate-400 font-normal">
                              Order base tender
                            </div>
                          )}
                        </td>

                        {/* Reference Number */}
                        <td className="px-5 py-4 font-mono text-xs text-slate-600">
                          {p.referenceNumber || '—'}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            {p.status}
                          </span>
                        </td>

                        {/* Paid At */}
                        <td className="px-5 py-4 text-xs text-slate-500">
                          {new Date(p.paidAt).toLocaleString()}
                        </td>

                        {/* Created At */}
                        <td className="px-5 py-4 text-xs text-slate-400">
                          {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => void openOrderDetail(p.order.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
                            title="View parent order"
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-500" />
                            <span className="hidden sm:inline">Order</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPayments.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-5 py-12 text-center text-sm text-slate-500">
                        No payment records found matching current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Return ID</th>
                    <th className="px-5 py-3.5">Return #</th>
                    <th className="px-5 py-3.5">Order #</th>
                    <th className="px-5 py-3.5">Branch</th>
                    <th className="px-5 py-3.5">Processed By</th>
                    <th className="px-5 py-3.5">Reason</th>
                    <th className="px-5 py-3.5">Subtotal</th>
                    <th className="px-5 py-3.5">Refund Paid</th>
                    <th className="px-5 py-3.5">Method</th>
                    <th className="px-5 py-3.5">Restock</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Returned At</th>
                    <th className="px-5 py-3.5 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition">
                      {/* Return ID */}
                      <td className="px-5 py-4 font-mono text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopyId(r.id)}
                            className="inline-flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 px-1.5 py-0.5 text-[11px] font-mono transition"
                            title="Copy Return UUID"
                          >
                            {copiedId === r.id ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            <span>{r.id.slice(0, 8)}...</span>
                          </button>
                        </div>
                      </td>

                      {/* Return # */}
                      <td className="px-5 py-4 font-mono text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => void openReturnDetail(r.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1 font-bold text-rose-700 hover:bg-rose-100 transition shadow-sm"
                          title="View return slip"
                        >
                          <Eye className="h-3.5 w-3.5 text-rose-600" />
                          <span>{r.returnNumber}</span>
                        </button>
                      </td>

                      {/* Order # */}
                      <td className="px-5 py-4 font-mono text-xs">
                        <button
                          type="button"
                          onClick={() => void openOrderDetail(r.order.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 font-bold text-emerald-700 hover:bg-emerald-100 transition shadow-sm"
                          title={`Order ID: ${r.orderId || r.order.id}`}
                        >
                          <ShoppingBag className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{r.order.orderNumber}</span>
                        </button>
                      </td>

                      {/* Branch */}
                      <td className="px-5 py-4 text-xs text-slate-600">
                        <div className="font-semibold text-slate-800">{r.branch.name}</div>
                        {r.branch.branchCode && (
                          <div className="font-mono text-[10px] text-slate-400">
                            {r.branch.branchCode}
                          </div>
                        )}
                      </td>

                      {/* Processed By */}
                      <td className="px-5 py-4 text-xs text-slate-600">
                        <div className="font-medium text-slate-800">{r.employee.name}</div>
                        {r.employee.employeeCode && (
                          <div className="font-mono text-[10px] text-slate-400">
                            {r.employee.employeeCode}
                          </div>
                        )}
                      </td>

                      {/* Reason */}
                      <td className="px-5 py-4 text-xs text-slate-600 max-w-[180px] truncate" title={r.returnReason}>
                        <span className="rounded bg-slate-50 border border-slate-200 px-2 py-0.5 text-slate-700">
                          {r.returnReason}
                        </span>
                      </td>

                      {/* Subtotal */}
                      <td className="px-5 py-4 text-xs text-slate-600 font-medium">
                        {formatCurrency(r.subtotal, r.order.currencyCode)}
                      </td>

                      {/* Refund Paid */}
                      <td className="px-5 py-4 font-bold text-rose-700 text-xs">
                        {formatCurrency(r.refundAmount, r.order.currencyCode)}
                      </td>

                      {/* Refund Method */}
                      <td className="px-5 py-4">
                        <span className="rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                          {r.refundMethod}
                        </span>
                      </td>

                      {/* Restock Status */}
                      <td className="px-5 py-4 text-xs font-semibold">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            r.restockStatus === 'RESTOCKED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : r.restockStatus === 'PARTIAL'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {r.restockStatus}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                          {r.status}
                        </span>
                      </td>

                      {/* Returned At */}
                      <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(r.returnedAt).toLocaleString()}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void openReturnDetail(r.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
                            title="View return slip"
                          >
                            <Eye className="h-3 w-3" /> View
                          </button>
                          <button
                            type="button"
                            onClick={() => void openOrderDetail(r.order.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition"
                            title="View parent order"
                          >
                            <FileText className="h-3 w-3 text-slate-500" />
                            <span className="hidden sm:inline">Order</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredReturns.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-5 py-12 text-center text-sm text-slate-500">
                        No refund or return records found matching current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Tab Pagination */}
          {tab === 'orders' && (
            <DataTablePagination
              currentPage={orderPage}
              pageSize={orderPageSize}
              totalItems={filteredOrders.length}
              onPageChange={setOrderPage}
              onPageSizeChange={setOrderPageSize}
              itemName="orders"
            />
          )}
          {tab === 'items' && (
            <DataTablePagination
              currentPage={itemPage}
              pageSize={itemPageSize}
              totalItems={filteredOrderItems.length}
              onPageChange={setItemPage}
              onPageSizeChange={setItemPageSize}
              itemName="order items"
            />
          )}
          {tab === 'payments' && (
            <DataTablePagination
              currentPage={paymentPage}
              pageSize={paymentPageSize}
              totalItems={filteredPayments.length}
              onPageChange={setPaymentPage}
              onPageSizeChange={(newSize) => {
                setPaymentPageSize(newSize);
                setPaymentPage(1);
              }}
              itemName="payments"
            />
          )}
          {tab === 'returns' && (
            <DataTablePagination
              currentPage={returnPage}
              pageSize={returnPageSize}
              totalItems={filteredReturns.length}
              onPageChange={setReturnPage}
              onPageSizeChange={(newSize) => {
                setReturnPageSize(newSize);
                setReturnPage(1);
              }}
              itemName="returns"
            />
          )}
        </div>

        {/* Enhanced Order Detail & Printable Receipt Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm print:static print:bg-white print:p-0">
            <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto print:max-h-none print:shadow-none print:p-6">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono text-xl font-bold text-slate-900">
                      {selectedOrder.orderNumber}
                    </h2>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        selectedOrder.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : selectedOrder.status === 'RETURNED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {selectedOrder.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400 mt-1">
                    <span>UUID: {selectedOrder.id}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(selectedOrder.id)}
                      className="hover:text-slate-600"
                      title="Copy full UUID"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    {copiedId === selectedOrder.id && (
                      <span className="text-emerald-600 font-sans font-bold">Copied!</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 print:hidden"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Order Meta Attributes */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl bg-slate-50 p-3.5 text-xs border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Branch</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block truncate">
                    {selectedOrder.branch.name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Cashier</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block truncate">
                    {selectedOrder.cashierEmployee.name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Customer</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block truncate">
                    {selectedOrder.customer?.name ?? 'Walk-in Guest'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Shift</span>
                  <span className="font-mono font-semibold text-blue-700 mt-0.5 block truncate">
                    {selectedOrder.shift?.shiftNumber ?? '—'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Created Date</span>
                  <span className="text-slate-700 mt-0.5 block">
                    {new Date(selectedOrder.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Completed Date</span>
                  <span className="text-slate-700 mt-0.5 block">
                    {selectedOrder.completedAt ? new Date(selectedOrder.completedAt).toLocaleString() : '—'}
                  </span>
                </div>
                {selectedOrder.notes && (
                  <div className="col-span-2 sm:col-span-4 border-t border-slate-200/60 pt-2">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Notes</span>
                    <p className="text-slate-700 mt-0.5 italic">{selectedOrder.notes}</p>
                  </div>
                )}
              </div>

              {/* Order Items Table */}
              <div className="mt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Purchased Items ({selectedOrder.orderItems.length})
                </h3>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden text-xs">
                  {selectedOrder.orderItems.map((oi) => (
                    <div key={oi.id} className="flex items-center justify-between p-3 bg-white hover:bg-slate-50/50">
                      <div>
                        <p className="font-semibold text-slate-900">{oi.productNameSnapshot}</p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          SKU: {oi.skuSnapshot} · {oi.quantity} × {formatCurrency(oi.unitPrice, selectedOrder.currencyCode)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900 text-sm">
                          {formatCurrency(oi.lineTotal, selectedOrder.currencyCode)}
                        </span>
                        {parseFloat(oi.discountAmount || '0') > 0 && (
                          <div className="text-[10px] text-rose-600">
                            Disc: -{formatCurrency(oi.discountAmount, selectedOrder.currencyCode)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="mt-4 space-y-1.5 rounded-2xl bg-slate-50 p-4 text-xs border border-slate-200">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedOrder.subtotal, selectedOrder.currencyCode)}</span>
                </div>
                {parseFloat(selectedOrder.discountAmount) > 0 && (
                  <div className="flex justify-between text-rose-600 font-medium">
                    <span>Order Discount</span>
                    <span>-{formatCurrency(selectedOrder.discountAmount, selectedOrder.currencyCode)}</span>
                  </div>
                )}
                {parseFloat(selectedOrder.taxAmount) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax</span>
                    <span>{formatCurrency(selectedOrder.taxAmount, selectedOrder.currencyCode)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                  <span>Total Amount</span>
                  <span className="text-emerald-700">
                    {formatCurrency(selectedOrder.totalAmount, selectedOrder.currencyCode)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 pt-1">
                  <span>Paid Amount</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(selectedOrder.paidAmount, selectedOrder.currencyCode)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Change Amount</span>
                  <span className="font-semibold text-emerald-600">
                    {formatCurrency(selectedOrder.changeAmount, selectedOrder.currencyCode)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 font-mono border-t border-slate-200/60 pt-1.5">
                  <span>Exchange Rate</span>
                  <span>1 USD = {selectedOrder.exchangeRate} KHR</span>
                </div>
              </div>

              {/* Payment Tenders List */}
              <div className="mt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Payment Tenders
                </h3>
                <div className="space-y-1.5">
                  {selectedOrder.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs border border-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-white border border-slate-200 px-2 py-0.5 font-bold text-slate-800">
                          {p.paymentMethod}
                        </span>
                        {p.referenceNumber && (
                          <span className="font-mono text-slate-500">Ref: {p.referenceNumber}</span>
                        )}
                      </div>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(p.amount, p.currencyCode)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Refunds Issued Section */}
              {selectedOrder.saleReturns && selectedOrder.saleReturns.length > 0 && (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/70 p-3 text-xs">
                  <h4 className="font-bold text-rose-900 uppercase tracking-wider text-[11px]">
                    Refunds Issued Against This Order
                  </h4>
                  <div className="mt-2 space-y-1.5">
                    {selectedOrder.saleReturns.map((sr) => (
                      <div key={sr.id} className="flex items-center justify-between bg-white rounded-xl p-2.5 border border-rose-100">
                        <div>
                          <span className="font-mono font-bold text-rose-700">{sr.returnNumber}</span>
                          <span className="text-slate-500 ml-2">· {sr.returnReason}</span>
                        </div>
                        <span className="font-bold text-rose-800">
                          -{formatCurrency(sr.refundAmount, selectedOrder.currencyCode)} via {sr.refundMethod}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4 print:hidden">
                <button
                  type="button"
                  onClick={() =>
                    downloadOrderReceiptHtml(
                      {
                        ...selectedOrder,
                        completedAt: selectedOrder.completedAt ?? undefined,
                      },
                      {
                        businessName: activeTenant?.name ?? 'Receipt',
                        logoUrl: activeTenant?.logoUrl,
                      },
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition"
                >
                  <Download className="h-3.5 w-3.5" /> Download Receipt
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition"
                >
                  <Printer className="h-3.5 w-3.5" /> {t.common.print}
                </button>
                {selectedOrder.status !== 'RETURNED' &&
                  selectedOrder.status !== 'VOIDED' &&
                  canRefund && (
                    <button
                      type="button"
                      onClick={() => openReturnModal(selectedOrder)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 transition"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-rose-50 p-2 text-rose-600">
                    <RotateCcw className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Select Sale Order to Return</h2>
                    <p className="text-xs text-slate-500">Pick an active sales order to issue partial or full refund.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setSalePickerOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={salePickerSearch}
                  onChange={(e) => setSalePickerSearch(e.target.value)}
                  placeholder="Search by Order # or customer name..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none"
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
                      className="flex items-center justify-between gap-3 px-4 py-3 text-xs hover:bg-slate-50 transition"
                    >
                      <div>
                        <p className="font-mono text-xs font-bold text-slate-900">
                          {o.orderNumber}{' '}
                          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 font-sans text-[10px] font-semibold text-slate-700">
                            {o.status}
                          </span>
                        </p>
                        <p className="text-slate-500 mt-0.5">
                          {o.branch.name} · {o.customer?.name ?? 'Walk-in'} ·{' '}
                          {new Date(o.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-900">
                          {formatCurrency(o.totalAmount, o.currencyCode)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void openReturnForOrderId(o.id)}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 shadow-sm transition"
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  ))}
                {eligibleOrders.length === 0 && (
                  <p className="p-6 text-center text-xs text-slate-500">
                    No returnable sales orders available in this branch.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sale Return Modal */}
        {returnModalOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Return Items — {returnModalOrder.orderNumber}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Original Total: {formatCurrency(returnModalOrder.totalAmount, returnModalOrder.currencyCode)}
                    {returnEstimate.previouslyRefunded > 0 &&
                      ` · Previously Refunded: ${formatCurrency(
                        returnEstimate.previouslyRefunded.toFixed(2),
                        returnModalOrder.currencyCode,
                      )}`}
                  </p>
                </div>
                <button type="button" onClick={() => setReturnModalOrder(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {returnModalError && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <span>{returnModalError}</span>
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
                              className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs disabled:bg-slate-100"
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
                              className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs disabled:bg-slate-100"
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

                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-rose-900">Estimated Refundable Amount</span>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Refund Tender Method</label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
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
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setReturnModalOrder(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReturn}
                    className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 shadow-sm"
                  >
                    {submittingReturn ? t.common.saving : 'Confirm Refund'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Return Details Modal */}
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
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Note
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReturn(null)}
                  className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-bold text-white hover:bg-slate-900 shadow-sm"
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
