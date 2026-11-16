'use client';

import {
  addDecimals,
  compareDecimals,
  convertCurrency,
  formatCurrency,
  mulDecimals,
  PAYMENT_METHODS,
  subDecimals,
  type CurrencyCode,
  type PaymentMethod,
  type SystemSettingsMap,
  type UserPreferences,
} from '@cambodia-pos/shared';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Barcode,
  CheckCircle2,
  Coins,
  CreditCard,
  Download,
  Minus,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
  User,
  Wallet,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';
import { downloadOrderReceiptHtml } from '@/lib/receipt';
import {
  useOnlineStatus,
  enqueueOfflineOrder,
  cacheCatalogProducts,
  getCachedCatalogProducts,
  getOfflineOrderQueue,
  removeOfflineOrder,
} from '@/lib/offlineStore';

interface PosProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  sellingPrice: string;
  trackInventory: boolean;
  stockQuantity: string;
  category?: { id: string; name: string };
  unit?: { abbreviation: string };
  status: string;
}

interface CartItem {
  product: PosProduct;
  quantity: number;
  discountAmount: string;
}

interface PaymentLine {
  paymentMethod: PaymentMethod;
  amount: string;
  currencyCode: CurrencyCode;
  referenceNumber: string;
}

interface ReceiptOrder {
  id: string;
  orderNumber: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  changeAmount: string;
  currencyCode: CurrencyCode;
  exchangeRate: string;
  completedAt: string;
  branch: { name: string; address: string | null; phone: string | null };
  cashierEmployee: { name: string };
  customer: { name: string } | null;
  orderItems: Array<{
    id: string;
    productNameSnapshot: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }>;
  payments: Array<{
    id: string;
    paymentMethod: string;
    amount: string;
    currencyCode: CurrencyCode;
    referenceNumber?: string | null;
  }>;
}

function playScanBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // Audio Context optional
  }
}

export default function PosPage() {
  const { activeTenant, activeBranch, hasPermission } = useAuth();
  const { t } = useI18n();
  const canCreateSale = hasPermission('sales.create');

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone: string | null }>>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string>('');
  const [orderCurrency, setOrderCurrency] = useState<CurrencyCode>('USD');
  const [orderDiscount, setOrderDiscount] = useState('0');
  const [orderTax, setOrderTax] = useState('0');
  const [taxManuallyEdited, setTaxManuallyEdited] = useState(false);
  const [sysSettings, setSysSettings] = useState<SystemSettingsMap | null>(null);
  const [userPrefs, setUserPrefs] = useState<UserPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  // Checkout & Payment State
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutTab, setCheckoutTab] = useState<'CASH' | 'ABA' | 'ACLEDA' | 'SPLIT'>('CASH');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptOrder | null>(null);
  const [khqrData, setKhqrData] = useState<{ khqrString: string; deepLink: string } | null>(null);
  const [generatingKhqr, setGeneratingKhqr] = useState(false);

  // Offline queue
  const { isOnline, queuedCount, refreshQueue } = useOnlineStatus();
  const [syncing, setSyncing] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const exchangeRate = activeTenant?.exchangeRateUsdToKhr ?? '4100';

  const loadData = useCallback(async () => {
    if (!activeTenant) return;
    const qs = activeBranch ? `?status=ACTIVE&branchId=${activeBranch.id}` : '?status=ACTIVE';
    try {
      const [prods, custs, sysRes, prefRes] = await Promise.all([
        apiRequest<PosProduct[]>(`/products${qs}`),
        apiRequest<Array<{ id: string; name: string; phone: string | null }>>('/customers'),
        apiRequest<{ settings: Record<string, unknown> }>('/settings').catch(() => null),
        apiRequest<UserPreferences>('/settings/user-preferences').catch(() => null),
      ]);
      setProducts(prods);
      cacheCatalogProducts(prods);
      setCustomers(custs);
      if (sysRes?.settings) {
        setSysSettings(sysRes.settings as unknown as SystemSettingsMap);
      }
      if (prefRes) {
        setUserPrefs(prefRes);
      }
    } catch {
      const cached = getCachedCatalogProducts();
      if (cached.length > 0) {
        setProducts(cached);
      }
    }
  }, [activeTenant, activeBranch]);

  useEffect(() => {
    setOrderCurrency(activeTenant?.defaultCurrency ?? 'USD');
    void loadData().catch(() => {});
  }, [activeTenant, loadData]);

  // Keyboard shortcut listener: F2 (New Sale), F4 (Checkout), Escape (Close Modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        startNewSale();
      } else if (e.key === 'F4' && !checkoutOpen && cart.length > 0) {
        e.preventDefault();
        openCheckout();
      } else if (e.key === 'Escape') {
        if (checkoutOpen) setCheckoutOpen(false);
        if (receipt) setReceipt(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [checkoutOpen, cart, receipt]);

  const categories = Array.from(
    new Map(
      products.filter((p) => p.category).map((p) => [p.category!.id, p.category!.name]),
    ).entries(),
  );

  // 1. New Sale Handler
  const startNewSale = () => {
    if (cart.length > 0 && !window.confirm('Start a new sale and clear the current cart?')) {
      return;
    }
    setCart([]);
    setCustomerId('');
    setOrderDiscount('0');
    setOrderTax('0');
    setTaxManuallyEdited(false);
    setError(null);
    setScanNotice(null);
    setReceipt(null);
    setCheckoutOpen(false);
    setKhqrData(null);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  // Add Product to Cart
  const addToCart = (product: PosProduct) => {
    setError(null);
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1, discountAmount: '0' }];
    });
  };

  // 2. Barcode Scanning & Search Input Enter Handler
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      e.preventDefault();
      const q = search.trim().toLowerCase();
      // Match exact barcode or SKU first
      const exactMatch = products.find(
        (p) => p.barcode?.toLowerCase() === q || p.sku.toLowerCase() === q,
      );

      if (exactMatch) {
        addToCart(exactMatch);
        playScanBeep();
        setScanNotice(`Scanned: ${exactMatch.name} (${exactMatch.sku})`);
        setTimeout(() => setScanNotice(null), 2500);
        setSearch('');
        return;
      }

      // If exactly 1 product matches search query, add it
      const matches = products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? '').toLowerCase().includes(q),
      );

      if (matches.length === 1) {
        addToCart(matches[0]);
        playScanBeep();
        setScanNotice(`Added: ${matches[0].name}`);
        setTimeout(() => setScanNotice(null), 2500);
        setSearch('');
      }
    }
  };

  const unitPriceInOrderCurrency = (usdPrice: string) =>
    orderCurrency === 'KHR'
      ? convertCurrency(usdPrice, 'USD', 'KHR', exchangeRate)
      : usdPrice;

  // 3. Cart Calculations
  let subtotal = '0.00';
  for (const item of cart) {
    const unit = unitPriceInOrderCurrency(item.product.sellingPrice);
    const gross = mulDecimals(String(item.quantity), unit, 4, 2, 2);
    const safeItemDisc = /^\d+(?:\.\d+)?$/.test(item.discountAmount) ? item.discountAmount : '0';
    const netRaw = subDecimals(gross, safeItemDisc, 2);
    const net = compareDecimals(netRaw, '0', 2) < 0 ? '0.00' : netRaw;
    subtotal = addDecimals(subtotal, net, 2);
  }
  const safeDiscount = /^\d+(?:\.\d+)?$/.test(orderDiscount) ? orderDiscount : '0';
  const discountExceedsSubtotal = compareDecimals(subtotal, safeDiscount, 2) < 0;
  const discountedSubtotal = discountExceedsSubtotal ? '0.00' : subDecimals(subtotal, safeDiscount, 2);

  const calculatedAutoTax =
    sysSettings?.taxEnabled && Number(sysSettings?.taxRatePercent) > 0
      ? (
          (Number(discountedSubtotal) * Number(sysSettings.taxRatePercent)) /
          100
        ).toFixed(orderCurrency === 'KHR' ? 0 : 2)
      : '0';

  const effectiveTax = taxManuallyEdited ? orderTax : calculatedAutoTax;
  const safeTax = /^\d+(?:\.\d+)?$/.test(effectiveTax) ? effectiveTax : '0';
  const totalAmount = addDecimals(discountedSubtotal, safeTax, 2);

  // Counterpart Currency Total
  const secondaryCurrency: CurrencyCode = orderCurrency === 'USD' ? 'KHR' : 'USD';
  const totalAmountCounterpart = convertCurrency(
    totalAmount,
    orderCurrency,
    secondaryCurrency,
    exchangeRate,
  );

  // 4. Checkout Initiation
  const openCheckout = () => {
    if (!activeBranch) {
      setError('Select an active branch first.');
      return;
    }
    if (discountExceedsSubtotal) {
      setError('Order discount cannot exceed subtotal.');
      return;
    }
    setError(null);
    setCheckoutError(null);
    setCheckoutTab('CASH');
    setPayments([
      {
        paymentMethod: 'CASH',
        amount: totalAmount,
        currencyCode: orderCurrency,
        referenceNumber: '',
      },
    ]);
    setCheckoutOpen(true);
    setKhqrData(null);
  };

  // Switch Payment Mode
  const handleSelectPaymentMethod = (method: 'CASH' | 'ABA' | 'ACLEDA' | 'SPLIT') => {
    setCheckoutTab(method);
    if (method === 'SPLIT') {
      if (payments.length === 1) {
        setPayments([
          payments[0],
          {
            paymentMethod: 'ABA',
            amount: '0.00',
            currencyCode: orderCurrency,
            referenceNumber: '',
          },
        ]);
      }
    } else {
      setPayments([
        {
          paymentMethod: method as PaymentMethod,
          amount: totalAmount,
          currencyCode: orderCurrency,
          referenceNumber: '',
        },
      ]);
      if (method === 'ABA') {
        void handleGenerateBakongKhqr();
      }
    }
  };

  // Quick Cash Tender Setter
  const handleQuickCashTender = (tenderAmount: string) => {
    setPayments([
      {
        paymentMethod: 'CASH',
        amount: tenderAmount,
        currencyCode: orderCurrency,
        referenceNumber: '',
      },
    ]);
  };

  // Generate Bakong KHQR
  const handleGenerateBakongKhqr = async () => {
    setGeneratingKhqr(true);
    try {
      const res = await apiRequest<{ khqrString: string; deepLink: string }>(
        '/payments/generate-khqr',
        {
          method: 'POST',
          body: JSON.stringify({
            merchantName: activeTenant?.name ?? 'Cambodia POS Store',
            bakongAccountId: 'merchant@acleda',
            amount: totalAmount,
            currency: orderCurrency,
            orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
          }),
        },
      );
      setKhqrData(res);
    } catch {
      setKhqrData(null);
    } finally {
      setGeneratingKhqr(false);
    }
  };

  // Paid & Change Calculations
  let paidInOrderCurrency = '0.00';
  for (const p of payments) {
    if (/^\d+(?:\.\d+)?$/.test(p.amount) && Number(p.amount) > 0) {
      paidInOrderCurrency = addDecimals(
        paidInOrderCurrency,
        convertCurrency(p.amount, p.currencyCode, orderCurrency, exchangeRate),
        2,
      );
    }
  }
  const remainingDue =
    compareDecimals(totalAmount, paidInOrderCurrency, 2) > 0
      ? subDecimals(totalAmount, paidInOrderCurrency, 2)
      : '0.00';
  const changeDue =
    compareDecimals(paidInOrderCurrency, totalAmount, 2) > 0
      ? subDecimals(paidInOrderCurrency, totalAmount, 2)
      : '0.00';

  const changeDueCounterpart = convertCurrency(
    changeDue,
    orderCurrency,
    secondaryCurrency,
    exchangeRate,
  );

  // 5. Complete Sale
  const handleCompleteSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranch) return;
    setError(null);
    setCheckoutError(null);
    setSubmitting(true);

    // Offline handling
    if (!isOnline) {
      const offlineOrderNumber = `OFFLINE-${Date.now().toString().slice(-6)}`;
      enqueueOfflineOrder({
        orderNumber: offlineOrderNumber,
        items: cart.map((c) => ({
          productId: c.product.id,
          productName: c.product.name,
          quantity: String(c.quantity),
          unitPrice: c.product.sellingPrice,
        })),
        totalAmount,
        currency: orderCurrency,
        paymentMethod: payments[0]?.paymentMethod ?? 'CASH',
      });
      refreshQueue();
      setCheckoutOpen(false);
      setCart([]);
      setOrderDiscount('0');
      setOrderTax('0');
      setReceipt({
        id: `offline-${Date.now()}`,
        orderNumber: offlineOrderNumber,
        branch: { name: activeBranch.name, address: null, phone: null },
        cashierEmployee: { name: 'Offline Register' },
        customer: customerId ? { name: customers.find((c) => c.id === customerId)?.name ?? 'Customer' } : null,
        subtotal,
        discountAmount: safeDiscount,
        taxAmount: safeTax,
        totalAmount,
        paidAmount: paidInOrderCurrency,
        changeAmount: changeDue,
        currencyCode: orderCurrency,
        exchangeRate,
        completedAt: new Date().toISOString(),
        orderItems: cart.map((c) => ({
          id: `item-${c.product.id}`,
          productNameSnapshot: c.product.name,
          quantity: String(c.quantity),
          unitPrice: c.product.sellingPrice,
          lineTotal: mulDecimals(String(c.quantity), c.product.sellingPrice, 4, 2, 2),
        })),
        payments: payments.map((p, idx) => ({
          id: `pay-${idx}`,
          paymentMethod: p.paymentMethod,
          amount: p.amount,
          currencyCode: p.currencyCode,
          referenceNumber: p.referenceNumber || null,
        })),
      });
      setSubmitting(false);
      return;
    }

    try {
      const created = await apiRequest<ReceiptOrder>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          branchId: activeBranch.id,
          customerId: customerId || null,
          currencyCode: orderCurrency,
          exchangeRate,
          discountAmount: safeDiscount,
          taxAmount: safeTax,
          items: cart.map((c) => ({
            productId: c.product.id,
            quantity: String(c.quantity),
            discountAmount: /^\d+(?:\.\d+)?$/.test(c.discountAmount) ? c.discountAmount : '0',
          })),
          payments: payments.map((p) => ({
            paymentMethod: p.paymentMethod,
            amount: p.amount,
            currencyCode: p.currencyCode,
            referenceNumber: p.referenceNumber || null,
          })),
        }),
      });
      setCheckoutOpen(false);
      setCart([]);
      setOrderDiscount('0');
      setOrderTax('0');
      setTaxManuallyEdited(false);
      setReceipt(created);
      if (userPrefs?.autoPrintReceipt) {
        setTimeout(() => window.print(), 300);
      }
      await loadData();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Checkout failed';
      setCheckoutError(msg);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Offline Sync
  const handleSyncOfflineOrders = async () => {
    if (!activeBranch || syncing) return;
    setSyncing(true);
    try {
      const queue = getOfflineOrderQueue();
      for (const item of queue) {
        await apiRequest('/orders', {
          method: 'POST',
          body: JSON.stringify({
            branchId: activeBranch.id,
            currencyCode: item.currency,
            exchangeRate,
            items: item.items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              discountAmount: '0',
            })),
            payments: [
              {
                paymentMethod: item.paymentMethod,
                amount: item.totalAmount,
                currencyCode: item.currency,
              },
            ],
          }),
        }).catch(() => null);
        removeOfflineOrder(item.id);
      }
      refreshQueue();
      void loadData().catch(() => {});
    } finally {
      setSyncing(false);
    }
  };

  // Filter Catalog
  const q = search.trim().toLowerCase();
  const visibleProducts = products.filter((p) => {
    const matchCat = selectedCategory === 'ALL' || p.category?.id === selectedCategory;
    const matchText =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q);
    return matchCat && matchText;
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Top Control Bar: Title, Branch, Currency, New Sale CTA */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900">{t.pos.title}</h1>
              <p className="text-xs text-slate-500">
                {activeBranch?.name ?? 'No Branch Selected'} · 1 USD = {Number(exchangeRate).toLocaleString()} KHR
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Currency Selector */}
            <select
              value={orderCurrency}
              onChange={(e) => setOrderCurrency(e.target.value as CurrencyCode)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              <option value="USD">USD ($)</option>
              <option value="KHR">KHR (៛)</option>
            </select>

            {/* New Sale Button */}
            <button
              type="button"
              onClick={startNewSale}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
            >
              <RotateCcw className="h-4 w-4 text-emerald-600" />
              <span>{t.pos.newSale}</span>
              <kbd className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">
                F2
              </kbd>
            </button>
          </div>
        </div>

        {/* Global Errors / Scan Toasts */}
        {error && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 print:hidden">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {scanNotice && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 shadow-sm animate-pulse print:hidden">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{scanNotice}</span>
          </div>
        )}

        {/* Main POS Interface (Catalog Left, Cart Right) */}
        <div className="grid gap-6 lg:grid-cols-12 print:hidden">
          {/* Left: Product Catalog & Barcode Search */}
          <div className="space-y-4 lg:col-span-7">
            {/* Offline Status & Sync Banner */}
            {(!isOnline || queuedCount > 0) && (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800">
                <div className="flex items-center gap-2">
                  {isOnline ? (
                    <Wifi className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-amber-600 animate-pulse" />
                  )}
                  <span className="font-bold">
                    {!isOnline ? 'Offline Register Mode' : 'Online Mode'}
                  </span>
                  <span>— {queuedCount} order(s) pending sync</span>
                </div>
                {isOnline && queuedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleSyncOfflineOrders}
                    disabled={syncing}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs shadow-sm transition-all"
                  >
                    {syncing ? 'Syncing...' : 'Sync Queue'}
                  </button>
                )}
              </div>
            )}

            {/* Barcode Scanner & Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t.pos.searchPlaceholder}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-24 text-sm font-medium shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      searchInputRef.current?.focus();
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <span
                  title="Barcode scanner hardware ready"
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200"
                >
                  <Barcode className="h-3.5 w-3.5" />
                  Scanner
                </span>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-sm ${
                  selectedCategory === 'ALL'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                All ({products.length})
              </button>
              {categories.map(([id, name]) => {
                const count = products.filter((p) => p.category?.id === id).length;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedCategory(id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition shadow-sm ${
                      selectedCategory === id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {name} ({count})
                  </button>
                );
              })}
            </div>

            {/* Product Cards Grid */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 max-h-[580px] overflow-y-auto pr-1">
              {visibleProducts.map((p) => {
                const price = unitPriceInOrderCurrency(p.sellingPrice);
                const counterpart = convertCurrency(
                  price,
                  orderCurrency,
                  secondaryCurrency,
                  exchangeRate,
                );
                const outOfStock = p.trackInventory && Number(p.stockQuantity) <= 0;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p)}
                    className={`group flex flex-col justify-between rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${
                      outOfStock
                        ? 'border-rose-200 bg-rose-50/30'
                        : 'border-slate-200 bg-white hover:border-emerald-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-bold text-slate-900 group-hover:text-emerald-700 transition line-clamp-2">
                          {p.name}
                        </p>
                        {p.barcode && (
                          <Barcode className="h-4 w-4 flex-shrink-0 text-slate-300 group-hover:text-emerald-500" />
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">{p.sku}</p>
                    </div>

                    <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-2">
                      <div>
                        <span className="text-sm font-black text-emerald-700">
                          {formatCurrency(price, orderCurrency)}
                        </span>
                        <p className="text-[10px] text-slate-400">
                          ≈ {formatCurrency(counterpart, secondaryCurrency)}
                        </p>
                      </div>
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                          !p.trackInventory
                            ? 'bg-slate-100 text-slate-600'
                            : Number(p.stockQuantity) > 10
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : Number(p.stockQuantity) > 0
                            ? 'bg-amber-50 text-amber-700 border border-amber-100'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {!p.trackInventory
                          ? 'In Stock'
                          : `${p.stockQuantity} ${p.unit?.abbreviation ?? ''}`}
                      </span>
                    </div>
                  </button>
                );
              })}

              {visibleProducts.length === 0 && (
                <div className="col-span-full py-16 text-center text-sm text-slate-400">
                  <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p>No products match &ldquo;{search}&rdquo;</p>
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="mt-2 text-xs font-bold text-emerald-600 hover:underline"
                  >
                    Clear search filter
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Shopping Cart & Order Summary */}
          <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
            <div>
              {/* Cart Header with Customer Selector */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-base font-bold text-slate-900">
                    {t.pos.cart} ({cart.reduce((sum, c) => sum + c.quantity, 0)})
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    <select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none max-w-[140px]"
                    >
                      <option value="">{t.pos.walkInCustomer}</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCart([])}
                      title="Clear Cart"
                      className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Cart Items List */}
              <div className="my-3 space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {cart.length === 0 ? (
                  <div className="py-14 text-center">
                    <ShoppingCart className="mx-auto mb-2 h-10 w-10 text-slate-200" />
                    <p className="text-xs font-semibold text-slate-400">{t.pos.emptyCart}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Click any catalog product or scan barcode to add
                    </p>
                  </div>
                ) : (
                  cart.map((item) => {
                    const unit = unitPriceInOrderCurrency(item.product.sellingPrice);
                    const safeItemDisc = /^\d+(?:\.\d+)?$/.test(item.discountAmount)
                      ? item.discountAmount
                      : '0';
                    const lineRaw = subDecimals(
                      mulDecimals(String(item.quantity), unit, 4, 2, 2),
                      safeItemDisc,
                      2,
                    );
                    const lineTotal = compareDecimals(lineRaw, '0', 2) < 0 ? '0.00' : lineRaw;
                    const stockInsufficient =
                      item.product.trackInventory &&
                      item.quantity > Number(item.product.stockQuantity);

                    return (
                      <div
                        key={item.product.id}
                        className={`space-y-1.5 rounded-2xl border p-3 text-xs transition ${
                          stockInsufficient
                            ? 'border-amber-300 bg-amber-50/50'
                            : 'border-slate-100 bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold text-slate-900">
                              {item.product.name}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {formatCurrency(unit, orderCurrency)} / {item.product.unit?.abbreviation ?? 'item'}
                            </p>
                          </div>

                          {/* Quantity Controls */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setCart((prev) =>
                                  prev
                                    .map((c) =>
                                      c.product.id === item.product.id
                                        ? { ...c, quantity: c.quantity - 1 }
                                        : c,
                                    )
                                    .filter((c) => c.quantity > 0),
                                )
                              }
                              className="rounded-lg border border-slate-200 bg-white p-1 hover:bg-slate-100 active:scale-95"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => {
                                const nextQty = Math.max(1, Number.parseInt(e.target.value, 10) || 1);
                                setCart((prev) =>
                                  prev.map((c) =>
                                    c.product.id === item.product.id
                                      ? { ...c, quantity: nextQty }
                                      : c,
                                  ),
                                );
                              }}
                              className="w-10 rounded-lg border border-slate-200 bg-white py-1 text-center font-black text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => addToCart(item.product)}
                              className="rounded-lg border border-slate-200 bg-white p-1 hover:bg-slate-100 active:scale-95"
                            >
                              <Plus className="h-3 w-3" />
                            </button>

                            <span className="ml-2 w-20 text-right font-black text-slate-900 text-xs">
                              {formatCurrency(lineTotal, orderCurrency)}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                setCart((prev) => prev.filter((c) => c.product.id !== item.product.id))
                              }
                              className="ml-1 text-slate-300 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {stockInsufficient && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            Stock low (Available: {item.product.stockQuantity})
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-400">
                          <span>Line discount ({orderCurrency}):</span>
                          <input
                            value={item.discountAmount}
                            onChange={(e) =>
                              setCart((prev) =>
                                prev.map((c) =>
                                  c.product.id === item.product.id
                                    ? { ...c, discountAmount: e.target.value }
                                    : c,
                                ),
                              )
                            }
                            className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-[11px] text-slate-700"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Cart Footer Calculations & Pay Now */}
            <div className="space-y-3 border-t border-slate-200 pt-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">
                    {t.common.discount} ({orderCurrency})
                  </label>
                  <input
                    value={orderDiscount}
                    onChange={(e) => setOrderDiscount(e.target.value)}
                    className="mt-0.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">
                    {t.common.tax}{' '}
                    {sysSettings?.taxEnabled && Number(sysSettings?.taxRatePercent) > 0 && !taxManuallyEdited
                      ? `(${sysSettings.taxRatePercent}%)`
                      : `(${orderCurrency})`}
                  </label>
                  <input
                    value={effectiveTax}
                    onChange={(e) => {
                      setTaxManuallyEdited(true);
                      setOrderTax(e.target.value);
                    }}
                    className="mt-0.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="flex justify-between text-slate-600">
                <span>{t.common.subtotal}</span>
                <span className="font-semibold">{formatCurrency(subtotal, orderCurrency)}</span>
              </div>

              {Number(safeDiscount) > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>{t.common.discount}</span>
                  <span className="font-semibold">-{formatCurrency(safeDiscount, orderCurrency)}</span>
                </div>
              )}

              {Number(safeTax) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>{t.common.tax}</span>
                  <span className="font-semibold">+{formatCurrency(safeTax, orderCurrency)}</span>
                </div>
              )}

              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                <div>
                  <span className="text-sm font-black text-slate-900">{t.common.total}</span>
                  <p className="text-[10px] text-slate-400">Includes VAT & discounts</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-emerald-700">
                    {formatCurrency(totalAmount, orderCurrency)}
                  </p>
                  <p className="text-xs font-bold text-slate-500">
                    ≈ {formatCurrency(totalAmountCounterpart, secondaryCurrency)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={cart.length === 0 || !canCreateSale || discountExceedsSubtotal}
                onClick={openCheckout}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-black text-white shadow-md transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
              >
                <Coins className="h-4 w-4" />
                <span>{t.pos.payNow}</span>
                <kbd className="hidden rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] sm:inline">
                  F4
                </kbd>
              </button>
            </div>
          </div>
        </div>

        {/* 5. Payment Modal (Checkout & Quick Tender) */}
        {checkoutOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm print:hidden">
            <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    Checkout &amp; Payment
                  </h2>
                  <p className="text-xs text-slate-500">
                    Total Due: <strong className="text-emerald-700">{formatCurrency(totalAmount, orderCurrency)}</strong> (≈ {formatCurrency(totalAmountCounterpart, secondaryCurrency)})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCheckoutOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {checkoutError && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {checkoutError}
                </div>
              )}

              {/* Payment Method Selector Tabs */}
              <div className="mt-4 grid grid-cols-4 gap-2">
                {[
                  { id: 'CASH', label: 'Cash', icon: Coins },
                  { id: 'ABA', label: 'ABA / KHQR', icon: QrCode },
                  { id: 'ACLEDA', label: 'ACLEDA', icon: CreditCard },
                  { id: 'SPLIT', label: 'Split Pay', icon: Wallet },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = checkoutTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleSelectPaymentMethod(tab.id as any)}
                      className={`flex flex-col items-center gap-1 rounded-2xl border p-2.5 text-xs font-bold transition ${
                        active
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <form onSubmit={handleCompleteSale} className="mt-4 space-y-4">
                {/* Cash Quick Tender Shortcuts */}
                {checkoutTab === 'CASH' && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Quick Cash Tender
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuickCashTender(totalAmount)}
                        className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                      >
                        Exact ({formatCurrency(totalAmount, orderCurrency)})
                      </button>
                      {orderCurrency === 'USD' ? (
                        ['5', '10', '20', '50', '100'].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => handleQuickCashTender(amt)}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                          >
                            ${amt}
                          </button>
                        ))
                      ) : (
                        ['10000', '20000', '50000', '100000'].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => handleQuickCashTender(amt)}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                          >
                            ៛{Number(amt).toLocaleString()}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Bakong KHQR Dynamic Generator display */}
                {checkoutTab === 'ABA' && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-center">
                    <p className="text-xs font-bold text-emerald-900">
                      Bakong KHQR Dynamic Checkout
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Customer can scan using ABA Mobile, Bakong, or any Cambodian mobile banking app.
                    </p>

                    {generatingKhqr ? (
                      <div className="py-6">
                        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
                        <p className="mt-2 text-xs text-slate-500">Generating dynamic KHQR...</p>
                      </div>
                    ) : khqrData ? (
                      <div className="mt-3 flex flex-col items-center">
                        <div className="rounded-xl border border-slate-300 bg-white p-3 shadow-inner">
                          <QrCode className="h-28 w-28 text-slate-800" />
                        </div>
                        <p className="mt-2 font-mono text-[10px] text-slate-600 break-all max-w-sm">
                          {khqrData.khqrString.slice(0, 48)}...
                        </p>
                        <a
                          href={khqrData.deepLink}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
                        >
                          Open in Bakong App <ArrowRight className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleGenerateBakongKhqr}
                        className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700"
                      >
                        Generate KHQR Code
                      </button>
                    )}
                  </div>
                )}

                {/* Payment Lines Breakdown */}
                <div className="space-y-2">
                  {payments.map((pay, idx) => (
                    <div key={idx} className="space-y-2 rounded-2xl bg-slate-50 p-3 border border-slate-100">
                      <div className="grid grid-cols-12 gap-2">
                        <select
                          value={pay.paymentMethod}
                          onChange={(e) => {
                            const next = [...payments];
                            next[idx] = { ...pay, paymentMethod: e.target.value as PaymentMethod };
                            setPayments(next);
                          }}
                          className="col-span-4 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold"
                        >
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>

                        <select
                          value={pay.currencyCode}
                          onChange={(e) => {
                            const next = [...payments];
                            next[idx] = { ...pay, currencyCode: e.target.value as CurrencyCode };
                            setPayments(next);
                          }}
                          className="col-span-3 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold"
                        >
                          <option value="USD">USD ($)</option>
                          <option value="KHR">KHR (៛)</option>
                        </select>

                        <input
                          required
                          value={pay.amount}
                          onChange={(e) => {
                            const next = [...payments];
                            next[idx] = { ...pay, amount: e.target.value };
                            setPayments(next);
                          }}
                          placeholder="Amount"
                          className="col-span-4 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-right"
                        />

                        {payments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}
                            className="col-span-1 flex items-center justify-center text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {pay.paymentMethod !== 'CASH' && (
                        <input
                          value={pay.referenceNumber}
                          onChange={(e) => {
                            const next = [...payments];
                            next[idx] = { ...pay, referenceNumber: e.target.value };
                            setPayments(next);
                          }}
                          placeholder="Bank Reference / Approval Code (optional)"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs"
                        />
                      )}
                    </div>
                  ))}
                </div>

                {checkoutTab === 'SPLIT' && (
                  <button
                    type="button"
                    onClick={() =>
                      setPayments((prev) => [
                        ...prev,
                        {
                          paymentMethod: 'ABA',
                          amount: remainingDue,
                          currencyCode: orderCurrency,
                          referenceNumber: '',
                        },
                      ])
                    }
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    + {t.pos.addPaymentLine}
                  </button>
                )}

                {/* Paid & Change Due Strip */}
                <div className="space-y-1.5 rounded-2xl bg-emerald-50/70 p-3.5 text-xs border border-emerald-100">
                  <div className="flex justify-between text-slate-700">
                    <span className="font-semibold">{t.pos.paidAmount}:</span>
                    <span className="font-black">
                      {formatCurrency(paidInOrderCurrency, orderCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-800">
                    <span className="font-semibold">{t.pos.changeAmount}:</span>
                    <span className="font-black text-sm">
                      {formatCurrency(changeDue, orderCurrency)}
                      <span className="text-[11px] font-normal text-slate-500 ml-1">
                        (≈ {formatCurrency(changeDueCounterpart, secondaryCurrency)})
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCheckoutOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-black text-white shadow-md hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
                  >
                    {submitting ? t.common.saving : t.pos.payNow}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 6. Receipt Modal */}
        {receipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm print:static print:bg-white print:p-0">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl print:shadow-none print:p-0">
              <div className="text-center">
                {sysSettings?.showLogo && activeTenant?.logoUrl && (
                  <div className="mb-2 flex justify-center">
                    <img
                      src={activeTenant.logoUrl}
                      alt="Logo"
                      className="max-h-12 max-w-[130px] object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <h2 className="text-lg font-black text-slate-900">{activeTenant?.name}</h2>
                {sysSettings?.receiptHeader && (
                  <p className="mt-0.5 text-xs font-semibold text-emerald-700">
                    {sysSettings.receiptHeader}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {receipt.branch.name} {receipt.branch.phone ? `· ${receipt.branch.phone}` : ''}
                </p>
                {sysSettings?.showTaxDetails && sysSettings?.taxIdentificationNumber && (
                  <p className="text-[11px] text-slate-500">
                    VATTIN / Tax ID: <strong>{sysSettings.taxIdentificationNumber}</strong>
                  </p>
                )}
                <div className="mt-2 inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800">
                  {receipt.orderNumber}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {new Date(receipt.completedAt).toLocaleString()}
                  {sysSettings?.showCashierName !== false && (
                    <> · Cashier: {receipt.cashierEmployee.name}</>
                  )}
                  {receipt.customer && <> · Cust: {receipt.customer.name}</>}
                </p>
              </div>

              {/* Itemized list */}
              <div className="my-3 border-y border-dashed border-slate-300 py-3 text-xs">
                {receipt.orderItems.map((oi) => (
                  <div key={oi.id} className="flex justify-between py-1">
                    <span className="text-slate-800 font-medium">
                      {oi.productNameSnapshot} × {oi.quantity}
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(oi.lineTotal, receipt.currencyCode)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Subtotal & Totals */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>{t.common.subtotal}</span>
                  <span>{formatCurrency(receipt.subtotal, receipt.currencyCode)}</span>
                </div>
                {Number(receipt.discountAmount) > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>{t.common.discount}</span>
                    <span>-{formatCurrency(receipt.discountAmount, receipt.currencyCode)}</span>
                  </div>
                )}
                {Number(receipt.taxAmount) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>{t.common.tax}</span>
                    <span>+{formatCurrency(receipt.taxAmount, receipt.currencyCode)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1.5 font-black text-slate-900 text-sm">
                  <span>{t.common.total}</span>
                  <span className="text-emerald-700">
                    {formatCurrency(receipt.totalAmount, receipt.currencyCode)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{t.pos.paidAmount}</span>
                  <span>{formatCurrency(receipt.paidAmount, receipt.currencyCode)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{t.pos.changeAmount}</span>
                  <span className="font-bold text-slate-800">
                    {formatCurrency(receipt.changeAmount, receipt.currencyCode)}
                  </span>
                </div>
                <div className="pt-2 text-[11px] text-slate-500">
                  Payments:{' '}
                  {receipt.payments
                    .map(
                      (p) =>
                        `${p.paymentMethod} ${formatCurrency(p.amount, p.currencyCode)}${
                          p.referenceNumber ? ` (Ref: ${p.referenceNumber})` : ''
                        }`,
                    )
                    .join(', ')}
                </div>
                {sysSettings?.receiptFooter && (
                  <div className="mt-3 border-t border-dashed border-slate-300 pt-2 text-center text-[10px] text-slate-500 whitespace-pre-line">
                    {sysSettings.receiptFooter}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex flex-wrap justify-end gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() =>
                    downloadOrderReceiptHtml(receipt, {
                      businessName: activeTenant?.name ?? 'Receipt',
                      logoUrl: activeTenant?.logoUrl,
                      receiptHeader: sysSettings?.receiptHeader,
                      receiptFooter: sysSettings?.receiptFooter,
                      showLogo: sysSettings?.showLogo,
                      showTaxDetails: sysSettings?.showTaxDetails,
                      showCashierName: sysSettings?.showCashierName,
                      showCustomerInfo: sysSettings?.showCustomerInfo,
                      paperSize: sysSettings?.paperSize,
                      taxIdentificationNumber: sysSettings?.taxIdentificationNumber,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" /> {t.common.print}
                </button>
                <button
                  type="button"
                  onClick={startNewSale}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700 active:scale-95"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t.pos.startNewSale}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
