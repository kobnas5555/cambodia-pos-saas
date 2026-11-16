'use client';

import {
  convertCurrency,
  formatCurrency,
  type CurrencyCode,
} from '@cambodia-pos/shared';
import {
  AlertTriangle,
  Archive,
  Barcode,
  CheckCircle2,
  Edit3,
  Layers,
  Package,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  Sparkles,
  TrendingUp,
  Truck,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTablePagination } from '@/components/DataTablePagination';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  status: string;
  parent?: { id: string; name: string } | null;
  _count?: { products: number; children?: number };
  createdAt?: string;
  updatedAt?: string;
}

interface UnitRow {
  id: string;
  name: string;
  abbreviation: string;
  status: string;
  _count?: { products: number };
}

interface SupplierRow {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  _count?: { purchases: number };
}

interface ProductRow {
  id: string;
  categoryId: string;
  unitId: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  costPrice: string;
  sellingPrice: string;
  wholesalePrice: string | null;
  lowStockAlert: string;
  trackInventory: boolean;
  status: string;
  stockQuantity: string;
  category?: { id: string; name: string };
  unit?: { id: string; name: string; abbreviation: string };
}

type TabKey = 'products' | 'categories' | 'units' | 'suppliers';
type StockFilterKey = 'ALL' | 'LOW' | 'OUT' | 'IN';

const PRESET_UNITS = [
  { name: 'Piece', abbr: 'pcs' },
  { name: 'Can', abbr: 'can' },
  { name: 'Box', abbr: 'box' },
  { name: 'Bottle', abbr: 'btl' },
  { name: 'Pack', abbr: 'pack' },
  { name: 'Kilogram', abbr: 'kg' },
  { name: 'Set', abbr: 'set' },
];

function safeConvert(amount: string, from: CurrencyCode, to: CurrencyCode, rate: string): string {
  try {
    const num = Number(amount);
    if (isNaN(num) || num < 0) return '0';
    return convertCurrency(amount || '0', from, to, rate);
  } catch {
    return '0';
  }
}

export default function ProductsCatalogPage() {
  const { activeTenant, activeBranch, hasPermission } = useAuth();
  const { t } = useI18n();

  const cur = (activeTenant?.defaultCurrency ?? 'USD') as CurrencyCode;
  const secondaryCur: CurrencyCode = cur === 'USD' ? 'KHR' : 'USD';
  const exchangeRate = activeTenant?.exchangeRateUsdToKhr ?? '4100';

  const canCreate = hasPermission('products.create');
  const canUpdate = hasPermission('products.update');
  const canArchive = hasPermission('products.archive');

  const [tab, setTab] = useState<TabKey>('products');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [stockFilter, setStockFilter] = useState<StockFilterKey>('ALL');
  const [prodPage, setProdPage] = useState<number>(1);
  const [prodPageSize, setProdPageSize] = useState<number>(10);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Product modal state
  const [prodModal, setProdModal] = useState(false);
  const [editingProd, setEditingProd] = useState<ProductRow | null>(null);
  const [pName, setPName] = useState('');
  const [pSku, setPSku] = useState('');
  const [pBarcode, setPBarcode] = useState('');
  const [pCategoryId, setPCategoryId] = useState('');
  const [pUnitId, setPUnitId] = useState('');
  const [pCost, setPCost] = useState('0.00');
  const [pPrice, setPPrice] = useState('0.00');
  const [pWholesale, setPWholesale] = useState('');
  const [pAlert, setPAlert] = useState('5');
  const [pOpeningStock, setPOpeningStock] = useState('0');
  const [pTrack, setPTrack] = useState(true);

  // Category modal state
  const [catModal, setCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryRow | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catParentId, setCatParentId] = useState('');
  const [catStatus, setCatStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Category table filters & pagination
  const [catSearch, setCatSearch] = useState('');
  const [catStatusFilter, setCatStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [catHierarchyFilter, setCatHierarchyFilter] = useState<'ALL' | 'ROOT' | 'SUBCATEGORY'>('ALL');
  const [catPage, setCatPage] = useState<number>(1);
  const [catPageSize, setCatPageSize] = useState<number>(10);

  // Unit modal state
  const [unitModal, setUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitRow | null>(null);
  const [unitName, setUnitName] = useState('');
  const [unitAbbr, setUnitAbbr] = useState('');
  const [unitStatus, setUnitStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Supplier modal state
  const [supModal, setSupModal] = useState(false);
  const [editingSup, setEditingSup] = useState<SupplierRow | null>(null);
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supAddress, setSupAddress] = useState('');
  const [supNotes, setSupNotes] = useState('');
  const [supStatus, setSupStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const loadAll = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeBranch) params.set('branchId', activeBranch.id);
      if (categoryFilter !== 'ALL') params.set('categoryId', categoryFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const [prods, cats, uns, sups] = await Promise.all([
        apiRequest<ProductRow[]>(`/products${qs}`),
        apiRequest<CategoryRow[]>('/categories'),
        apiRequest<UnitRow[]>('/units'),
        apiRequest<SupplierRow[]>('/suppliers'),
      ]);
      setProducts(prods);
      setCategories(cats);
      setUnits(uns);
      setSuppliers(sups);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load catalog');
    } finally {
      setLoading(false);
    }
  }, [activeTenant, activeBranch, categoryFilter, statusFilter]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Product CRUD
  const openProductModal = (prod?: ProductRow) => {
    setError(null);
    if (prod) {
      setEditingProd(prod);
      setPName(prod.name);
      setPSku(prod.sku);
      setPBarcode(prod.barcode ?? '');
      setPCategoryId(prod.categoryId);
      setPUnitId(prod.unitId);
      setPCost(prod.costPrice);
      setPPrice(prod.sellingPrice);
      setPWholesale(prod.wholesalePrice ?? '');
      setPAlert(prod.lowStockAlert);
      setPTrack(prod.trackInventory);
      setPOpeningStock('0');
    } else {
      setEditingProd(null);
      setPName('');
      setPSku('');
      setPBarcode('');
      setPCategoryId(categories[0]?.id ?? '');
      setPUnitId(units[0]?.id ?? '');
      setPCost('0.00');
      setPPrice('0.00');
      setPWholesale('');
      setPAlert('5');
      setPTrack(true);
      setPOpeningStock('0');
    }
    setProdModal(true);
  };

  const handleAutoSku = () => {
    const prefix = pName
      ? pName.trim().substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'PRD')
      : 'PRD';
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    setPSku(`${prefix}-${rand}`);
  };

  const handleAutoBarcode = () => {
    const randNum = Math.floor(100000000 + Math.random() * 900000000);
    setPBarcode(`885${randNum}`);
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingProd) {
        await apiRequest(`/products/${editingProd.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: pName,
            sku: pSku,
            barcode: pBarcode || null,
            categoryId: pCategoryId,
            unitId: pUnitId,
            costPrice: pCost,
            sellingPrice: pPrice,
            wholesalePrice: pWholesale || null,
            lowStockAlert: pAlert,
            trackInventory: pTrack,
          }),
        });
        setFeedback('Product updated successfully.');
      } else {
        await apiRequest('/products', {
          method: 'POST',
          body: JSON.stringify({
            name: pName,
            sku: pSku,
            barcode: pBarcode || null,
            categoryId: pCategoryId,
            unitId: pUnitId,
            costPrice: pCost,
            sellingPrice: pPrice,
            wholesalePrice: pWholesale || null,
            lowStockAlert: pAlert,
            trackInventory: pTrack,
            openingStock: pOpeningStock,
            branchId: activeBranch?.id,
          }),
        });
        setFeedback('Product created successfully.');
      }
      setProdModal(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save product');
    }
  };

  const handleArchiveProduct = async (id: string) => {
    setError(null);
    try {
      await apiRequest(`/products/${id}`, { method: 'DELETE' });
      setFeedback('Product archived.');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Archive failed');
    }
  };

  const handleRestoreProduct = async (id: string) => {
    setError(null);
    try {
      await apiRequest(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
      });
      setFeedback('Product restored to active catalog.');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Restore failed');
    }
  };

  // Category CRUD
  const saveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingCat) {
        await apiRequest(`/categories/${editingCat.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: catName,
            description: catDesc || null,
            parentId: catParentId || null,
            status: catStatus,
          }),
        });
      } else {
        await apiRequest('/categories', {
          method: 'POST',
          body: JSON.stringify({
            name: catName,
            description: catDesc || null,
            parentId: catParentId || null,
          }),
        });
      }
      setCatModal(false);
      setFeedback('Category saved.');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save category');
    }
  };

  const handleToggleCategoryStatus = async (cat: CategoryRow) => {
    setError(null);
    try {
      const nextStatus = cat.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await apiRequest(`/categories/${cat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setFeedback(`Category "${cat.name}" status updated to ${nextStatus}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update category status');
    }
  };

  const handleDeleteCategory = async (cat: CategoryRow) => {
    if (cat._count && cat._count.products > 0) {
      if (
        !confirm(
          `Notice: Category "${cat.name}" has ${cat._count.products} linked product(s). Deactivating it is recommended to keep historical sales records intact. Deactivate now?`,
        )
      ) {
        return;
      }
      return handleToggleCategoryStatus(cat);
    }
    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;
    setError(null);
    try {
      await apiRequest(`/categories/${cat.id}`, { method: 'DELETE' });
      setFeedback(`Category "${cat.name}" deleted.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to delete category');
    }
  };

  // Unit CRUD
  const saveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingUnit) {
        await apiRequest(`/units/${editingUnit.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: unitName, abbreviation: unitAbbr, status: unitStatus }),
        });
      } else {
        await apiRequest('/units', {
          method: 'POST',
          body: JSON.stringify({ name: unitName, abbreviation: unitAbbr }),
        });
      }
      setUnitModal(false);
      setFeedback('Unit saved.');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save unit');
    }
  };

  // Supplier CRUD
  const saveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingSup) {
        await apiRequest(`/suppliers/${editingSup.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: supName,
            contactPerson: supContact || null,
            phone: supPhone || null,
            email: supEmail || null,
            address: supAddress || null,
            notes: supNotes || null,
            status: supStatus,
          }),
        });
      } else {
        await apiRequest('/suppliers', {
          method: 'POST',
          body: JSON.stringify({
            name: supName,
            contactPerson: supContact || null,
            phone: supPhone || null,
            email: supEmail || null,
            address: supAddress || null,
            notes: supNotes || null,
          }),
        });
      }
      setSupModal(false);
      setFeedback('Supplier saved.');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save supplier');
    }
  };

  // KPI Calculations
  const totalProdsCount = products.length;
  const activeProdsCount = products.filter((p) => p.status === 'ACTIVE').length;
  const lowStockProdsCount = products.filter(
    (p) => p.trackInventory && Number(p.stockQuantity) <= Number(p.lowStockAlert) && Number(p.stockQuantity) > 0,
  ).length;
  const outOfStockProdsCount = products.filter(
    (p) => p.trackInventory && Number(p.stockQuantity) <= 0,
  ).length;

  // Filtered Lists
  const q = search.trim().toLowerCase();
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q) ||
      (p.category?.name ?? '').toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (stockFilter === 'LOW') {
      return p.trackInventory && Number(p.stockQuantity) <= Number(p.lowStockAlert) && Number(p.stockQuantity) > 0;
    }
    if (stockFilter === 'OUT') {
      return p.trackInventory && Number(p.stockQuantity) <= 0;
    }
    if (stockFilter === 'IN') {
      return !p.trackInventory || Number(p.stockQuantity) > Number(p.lowStockAlert);
    }
    return true;
  });

  useEffect(() => {
    setProdPage(1);
  }, [search, categoryFilter, statusFilter, stockFilter]);

  const paginatedProducts = useMemo(() => {
    const start = (prodPage - 1) * prodPageSize;
    return filteredProducts.slice(start, start + prodPageSize);
  }, [filteredProducts, prodPage, prodPageSize]);

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      if (catStatusFilter !== 'ALL' && c.status !== catStatusFilter) return false;
      if (catHierarchyFilter === 'ROOT' && c.parentId !== null) return false;
      if (catHierarchyFilter === 'SUBCATEGORY' && c.parentId === null) return false;
      if (catSearch.trim()) {
        const query = catSearch.trim().toLowerCase();
        const matchesName = c.name.toLowerCase().includes(query);
        const matchesDesc = (c.description ?? '').toLowerCase().includes(query);
        const matchesParent = (c.parent?.name ?? '').toLowerCase().includes(query);
        if (!matchesName && !matchesDesc && !matchesParent) return false;
      }
      return true;
    });
  }, [categories, catStatusFilter, catHierarchyFilter, catSearch]);

  useEffect(() => {
    setCatPage(1);
  }, [catSearch, catStatusFilter, catHierarchyFilter]);

  const paginatedCategories = useMemo(() => {
    const start = (catPage - 1) * catPageSize;
    return filteredCategories.slice(start, start + catPageSize);
  }, [filteredCategories, catPage, catPageSize]);

  const filteredSuppliers = suppliers.filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.contactPerson ?? '').toLowerCase().includes(q) ||
      (s.phone ?? '').toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q),
  );

  // Live calculations for Product Modal
  const costNum = Number(pCost) || 0;
  const priceNum = Number(pPrice) || 0;
  const profitNum = Math.max(0, priceNum - costNum);
  const marginPct = priceNum > 0 ? ((profitNum / priceNum) * 100).toFixed(1) : '0';
  const previewCostSecondary = safeConvert(pCost, cur, secondaryCur, exchangeRate);
  const previewPriceSecondary = safeConvert(pPrice, cur, secondaryCur, exchangeRate);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header & Quick Action */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.catalog.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{t.catalog.subtitle}</p>
          </div>
          {canCreate && (
            <div className="flex flex-wrap gap-2">
              {tab === 'products' && (
                <button
                  type="button"
                  onClick={() => openProductModal()}
                  disabled={categories.length === 0 || units.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {t.catalog.addProduct}
                </button>
              )}
              {tab === 'categories' && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCat(null);
                    setCatName('');
                    setCatDesc('');
                    setCatParentId('');
                    setCatStatus('ACTIVE');
                    setCatModal(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  {t.catalog.addCategory}
                </button>
              )}
              {tab === 'units' && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingUnit(null);
                    setUnitName('');
                    setUnitAbbr('');
                    setUnitStatus('ACTIVE');
                    setUnitModal(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  {t.catalog.addUnit}
                </button>
              )}
              {tab === 'suppliers' && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSup(null);
                    setSupName('');
                    setSupContact('');
                    setSupPhone('');
                    setSupEmail('');
                    setSupAddress('');
                    setSupNotes('');
                    setSupStatus('ACTIVE');
                    setSupModal(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  {t.catalog.addSupplier}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Catalog Summary Metric Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div
            onClick={() => {
              setTab('products');
              setStockFilter('ALL');
              setStatusFilter('ALL');
            }}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t.catalog.totalProducts}
              </span>
              <Package className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{totalProdsCount}</p>
            <span className="text-xs text-slate-500">Across all categories</span>
          </div>

          <div
            onClick={() => {
              setTab('products');
              setStatusFilter('ACTIVE');
              setStockFilter('ALL');
            }}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t.catalog.activeCatalog}
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-600">{activeProdsCount}</p>
            <span className="text-xs text-slate-500">Available on POS</span>
          </div>

          <div
            onClick={() => {
              setTab('products');
              setStockFilter('LOW');
            }}
            className={`cursor-pointer rounded-xl border p-4 shadow-sm transition ${
              stockFilter === 'LOW'
                ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-400'
                : 'border-slate-200 bg-white hover:border-amber-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                {t.catalog.lowStockCount}
              </span>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-600">{lowStockProdsCount}</p>
            <span className="text-xs text-amber-700">Below threshold</span>
          </div>

          <div
            onClick={() => {
              setTab('products');
              setStockFilter('OUT');
            }}
            className={`cursor-pointer rounded-xl border p-4 shadow-sm transition ${
              stockFilter === 'OUT'
                ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-400'
                : 'border-slate-200 bg-white hover:border-rose-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                {t.catalog.outOfStock}
              </span>
              <XCircle className="h-4 w-4 text-rose-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-rose-600">{outOfStockProdsCount}</p>
            <span className="text-xs text-rose-700">Requires purchasing</span>
          </div>
        </div>

        {/* Tabs & Filters Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: 'products', label: `${t.catalog.productsTab} (${filteredProducts.length})`, icon: Package },
                { key: 'categories', label: `${t.catalog.categoriesTab} (${categories.length})`, icon: Layers },
                { key: 'units', label: `${t.catalog.unitsTab} (${units.length})`, icon: Ruler },
                { key: 'suppliers', label: `${t.catalog.suppliersTab} (${suppliers.length})`, icon: Truck },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                    tab === item.key
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab === 'products' && (
              <>
                <select
                  aria-label="Filter by category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by stock"
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as StockFilterKey)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">{t.catalog.allStock}</option>
                  <option value="LOW">{t.catalog.lowStock}</option>
                  <option value="OUT">{t.catalog.outOfStock}</option>
                  <option value="IN">{t.catalog.inStock}</option>
                </select>

                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">{t.common.active}</option>
                  <option value="ARCHIVED">{t.common.archived}</option>
                </select>
              </>
            )}

            {tab === 'categories' && (
              <>
                <select
                  aria-label="Filter categories by status"
                  value={catStatusFilter}
                  onChange={(e) => setCatStatusFilter(e.target.value as any)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">{t.common.active}</option>
                  <option value="INACTIVE">{t.common.inactive}</option>
                </select>

                <select
                  aria-label="Filter categories by hierarchy"
                  value={catHierarchyFilter}
                  onChange={(e) => setCatHierarchyFilter(e.target.value as any)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="ROOT">Top-Level / Root Only</option>
                  <option value="SUBCATEGORY">Sub-Categories Only</option>
                </select>

                <div className="relative w-full sm:w-60">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={catSearch}
                    onChange={(e) => setCatSearch(e.target.value)}
                    placeholder="Search category name or desc..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {(catSearch || catStatusFilter !== 'ALL' || catHierarchyFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setCatSearch('');
                      setCatStatusFilter('ALL');
                      setCatHierarchyFilter('ALL');
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Reset
                  </button>
                )}
              </>
            )}

            {tab !== 'units' && tab !== 'categories' && (
              <div className="relative w-full sm:w-60">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.common.search}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {tab === 'products' && (categories.length === 0 || units.length === 0) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Create at least one <strong>Category</strong> and one <strong>Unit</strong> before adding products.
          </div>
        )}

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

        {/* Tab Content Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            {loading ? (
              <p className="p-8 text-center text-sm text-slate-500">{t.common.loading}</p>
            ) : tab === 'products' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">{t.catalog.sku} / {t.catalog.barcode}</th>
                    <th className="px-4 py-3">{t.catalog.category}</th>
                    <th className="px-4 py-3">{t.catalog.costPrice}</th>
                    <th className="px-4 py-3">{t.catalog.sellingPrice}</th>
                    <th className="px-4 py-3">{t.catalog.margin}</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">{t.common.status}</th>
                    <th className="px-4 py-3 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                        {t.common.noData}
                      </td>
                    </tr>
                  ) : (
                    paginatedProducts.map((p) => {
                      const costVal = Number(p.costPrice) || 0;
                      const sellVal = Number(p.sellingPrice) || 0;
                      const profit = Math.max(0, sellVal - costVal);
                      const margin = sellVal > 0 ? ((profit / sellVal) * 100).toFixed(0) : '0';

                      const isOut = p.trackInventory && Number(p.stockQuantity) <= 0;
                      const isLow =
                        p.trackInventory &&
                        !isOut &&
                        Number(p.stockQuantity) <= Number(p.lowStockAlert);

                      const counterpartSell = safeConvert(p.sellingPrice, cur, secondaryCur, exchangeRate);
                      const counterpartCost = safeConvert(p.costPrice, cur, secondaryCur, exchangeRate);

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{p.name}</div>
                            <div className="text-xs text-slate-400">Unit: {p.unit?.name} ({p.unit?.abbreviation})</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-mono text-xs font-medium text-slate-800">{p.sku}</div>
                            {p.barcode && (
                              <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                                <Barcode className="h-3 w-3" />
                                {p.barcode}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              {p.category?.name ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-700">{formatCurrency(p.costPrice, cur)}</div>
                            <div className="text-[11px] text-slate-400">
                              ≈ {formatCurrency(counterpartCost, secondaryCur)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-emerald-700">
                              {formatCurrency(p.sellingPrice, cur)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              ≈ {formatCurrency(counterpartSell, secondaryCur)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              <TrendingUp className="h-3 w-3" />
                              {margin}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {!p.trackInventory ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                ∞ Unlimited
                              </span>
                            ) : isOut ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                                <XCircle className="h-3 w-3" />
                                0 ({t.catalog.outOfStock})
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                <AlertTriangle className="h-3 w-3" />
                                {p.stockQuantity} ({t.catalog.lowStock})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                                {p.stockQuantity}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                p.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex gap-2">
                              {canUpdate && (
                                <button
                                  type="button"
                                  onClick={() => openProductModal(p)}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                >
                                  <Edit3 className="h-3 w-3" /> {t.common.edit}
                                </button>
                              )}
                              {p.status === 'ACTIVE' && canArchive && (
                                <button
                                  type="button"
                                  onClick={() => void handleArchiveProduct(p.id)}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                                >
                                  <Archive className="h-3 w-3" /> {t.common.archive}
                                </button>
                              )}
                              {p.status === 'ARCHIVED' && (canUpdate || canArchive) && (
                                <button
                                  type="button"
                                  onClick={() => void handleRestoreProduct(p.id)}
                                  className="inline-flex items-center gap-1 rounded border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                                >
                                  <RotateCcw className="h-3 w-3" /> {t.common.activate}
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
            ) : tab === 'categories' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Category Name</th>
                    <th className="px-4 py-3">Parent Category</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Products</th>
                    <th className="px-4 py-3">{t.common.status}</th>
                    <th className="px-4 py-3 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedCategories.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        {t.common.noData}
                      </td>
                    </tr>
                  ) : (
                    paginatedCategories.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            {c.parentId ? <span className="text-slate-300 pl-1">↳</span> : null}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900">{c.name}</span>
                                {c.parentId ? (
                                  <span className="rounded bg-sky-50 px-1.5 py-0.2 text-[10px] font-semibold text-sky-700">Sub</span>
                                ) : (
                                  <span className="rounded bg-purple-50 px-1.5 py-0.2 text-[10px] font-semibold text-purple-700">Root</span>
                                )}
                              </div>
                              <span className="block text-[10px] font-mono text-slate-400">ID: {c.id.slice(0, 8)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {c.parent ? (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                              {c.parent.name}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">None (Top-Level)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{c.description || '—'}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold">
                            {c._count?.products ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              c.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {canUpdate ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCat(c);
                                    setCatName(c.name);
                                    setCatDesc(c.description ?? '');
                                    setCatParentId(c.parentId ?? '');
                                    setCatStatus(c.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
                                    setCatModal(true);
                                  }}
                                  className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  {t.common.edit}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleCategoryStatus(c)}
                                  className={`rounded border px-2.5 py-1 text-xs font-medium ${
                                    c.status === 'ACTIVE'
                                      ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                      : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                  }`}
                                >
                                  {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(c)}
                                  className="rounded border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                                >
                                  Delete
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">Read-only</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : tab === 'units' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Unit Name</th>
                    <th className="px-4 py-3">{t.catalog.abbreviation}</th>
                    <th className="px-4 py-3">Products</th>
                    <th className="px-4 py-3">{t.common.status}</th>
                    <th className="px-4 py-3 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {units.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        {t.common.noData}
                      </td>
                    </tr>
                  ) : (
                    units.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{u.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-bold">{u.abbreviation}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{u._count?.products ?? 0}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              u.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canUpdate ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUnit(u);
                                setUnitName(u.name);
                                setUnitAbbr(u.abbreviation);
                                setUnitStatus(u.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
                                setUnitModal(true);
                              }}
                              className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {t.common.edit}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Read-only</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Supplier Name</th>
                    <th className="px-4 py-3">{t.catalog.contactPerson}</th>
                    <th className="px-4 py-3">{t.branches.phone}</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3">Purchases</th>
                    <th className="px-4 py-3">{t.common.status}</th>
                    <th className="px-4 py-3 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        {t.common.noData}
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                        <td className="px-4 py-3 text-slate-600">{s.contactPerson || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.phone || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{s.email || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{s.address || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold">
                            {s._count?.purchases ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              s.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canUpdate ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSup(s);
                                setSupName(s.name);
                                setSupContact(s.contactPerson ?? '');
                                setSupPhone(s.phone ?? '');
                                setSupEmail(s.email ?? '');
                                setSupAddress(s.address ?? '');
                                setSupNotes(s.notes ?? '');
                                setSupStatus(s.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
                                setSupModal(true);
                              }}
                              className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {t.common.edit}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Read-only</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {tab === 'products' && (
            <DataTablePagination
              currentPage={prodPage}
              pageSize={prodPageSize}
              totalItems={filteredProducts.length}
              onPageChange={setProdPage}
              onPageSizeChange={setProdPageSize}
              itemName="products"
            />
          )}

          {tab === 'categories' && (
            <DataTablePagination
              currentPage={catPage}
              pageSize={catPageSize}
              totalItems={filteredCategories.length}
              onPageChange={setCatPage}
              onPageSizeChange={setCatPageSize}
              itemName="categories"
            />
          )}
        </div>

        {/* Add/Edit Product Modal */}
        {prodModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingProd ? 'Edit Product' : t.catalog.addProduct}
                </h2>
                <button
                  type="button"
                  onClick={() => setProdModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={saveProduct} className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700">Product Name</label>
                    <input
                      required
                      value={pName}
                      onChange={(e) => setPName(e.target.value)}
                      placeholder="e.g. Angkor Beer 330ml / ស្រាបៀរអង្គរ"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">SKU Code</label>
                      <button
                        type="button"
                        onClick={handleAutoSku}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        <Sparkles className="h-3 w-3" />
                        {t.catalog.autoGenerate}
                      </button>
                    </div>
                    <input
                      required
                      value={pSku}
                      onChange={(e) => setPSku(e.target.value.toUpperCase())}
                      placeholder="e.g. BEER-ANG-330"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">Barcode (UPC/EAN)</label>
                      <button
                        type="button"
                        onClick={handleAutoBarcode}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        <Sparkles className="h-3 w-3" />
                        {t.catalog.autoGenerate}
                      </button>
                    </div>
                    <input
                      value={pBarcode}
                      onChange={(e) => setPBarcode(e.target.value)}
                      placeholder="e.g. 885123456789"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Category</label>
                    <select
                      required
                      value={pCategoryId}
                      onChange={(e) => setPCategoryId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Unit of Measure</label>
                    <select
                      required
                      value={pUnitId}
                      onChange={(e) => setPUnitId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.abbreviation})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Dual Currency Cost & Selling Price */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">
                        {t.catalog.costPrice} ({cur})
                      </label>
                      <span className="text-[11px] text-slate-400">
                        ≈ {formatCurrency(previewCostSecondary, secondaryCur)}
                      </span>
                    </div>
                    <input
                      required
                      value={pCost}
                      onChange={(e) => setPCost(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">
                        {t.catalog.sellingPrice} ({cur})
                      </label>
                      <span className="text-[11px] font-medium text-emerald-600">
                        ≈ {formatCurrency(previewPriceSecondary, secondaryCur)}
                      </span>
                    </div>
                    <input
                      required
                      value={pPrice}
                      onChange={(e) => setPPrice(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* Profit Margin Preview Bar */}
                  <div className="rounded-lg bg-slate-50 p-2.5 sm:col-span-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Gross Profit Margin:</span>
                      <span className="font-semibold text-emerald-700">
                        {formatCurrency(profitNum.toString(), cur)} profit ({marginPct}%)
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {t.catalog.wholesalePrice} ({cur})
                    </label>
                    <input
                      value={pWholesale}
                      onChange={(e) => setPWholesale(e.target.value)}
                      placeholder="Optional bulk price"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {t.catalog.lowStockAlert}
                    </label>
                    <input
                      value={pAlert}
                      onChange={(e) => setPAlert(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  {!editingProd && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        {t.catalog.openingStock} (Assigned to {activeBranch?.name ?? 'Main Branch'})
                      </label>
                      <input
                        value={pOpeningStock}
                        onChange={(e) => setPOpeningStock(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-2 pt-1 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={pTrack}
                    onChange={(e) => setPTrack(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  {t.catalog.trackInventory}
                </label>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setProdModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    {t.common.save}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add/Edit Category Modal */}
        {catModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingCat ? 'Edit Category' : t.catalog.addCategory}
                </h2>
                <button
                  type="button"
                  onClick={() => setCatModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={saveCategory} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Category Name</label>
                  <input
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder="e.g. Beverages / ភេសជ្ជៈ"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Parent Category (Optional)</label>
                  <select
                    value={catParentId}
                    onChange={(e) => setCatParentId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">None (Top-Level Category)</option>
                    {categories
                      .filter((c) => c.id !== editingCat?.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Description</label>
                  <textarea
                    rows={2}
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    placeholder="Optional notes or shelf group..."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {editingCat && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">{t.common.status}</label>
                    <select
                      value={catStatus}
                      onChange={(e) => setCatStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="ACTIVE">{t.common.active}</option>
                      <option value="INACTIVE">{t.common.inactive}</option>
                    </select>
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setCatModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    {t.common.save}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add/Edit Unit Modal */}
        {unitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingUnit ? 'Edit Unit' : t.catalog.addUnit}
                </h2>
                <button
                  type="button"
                  onClick={() => setUnitModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              {/* Quick Presets */}
              {!editingUnit && (
                <div className="mt-3">
                  <span className="text-[11px] font-medium text-slate-500">Quick Presets:</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {PRESET_UNITS.map((p) => (
                      <button
                        key={p.abbr}
                        type="button"
                        onClick={() => {
                          setUnitName(p.name);
                          setUnitAbbr(p.abbr);
                        }}
                        className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        {p.name} ({p.abbr})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={saveUnit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Unit Name</label>
                  <input
                    required
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                    placeholder="Piece / Box / Cup / ដប"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">{t.catalog.abbreviation}</label>
                  <input
                    required
                    value={unitAbbr}
                    onChange={(e) => setUnitAbbr(e.target.value.toLowerCase())}
                    placeholder="e.g. pcs, box, kg, can"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm lowercase focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {editingUnit && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">{t.common.status}</label>
                    <select
                      value={unitStatus}
                      onChange={(e) => setUnitStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="ACTIVE">{t.common.active}</option>
                      <option value="INACTIVE">{t.common.inactive}</option>
                    </select>
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setUnitModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    {t.common.save}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add/Edit Supplier Modal */}
        {supModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingSup ? 'Edit Supplier' : t.catalog.addSupplier}
                </h2>
                <button
                  type="button"
                  onClick={() => setSupModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={saveSupplier} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Supplier Name</label>
                  <input
                    required
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                    placeholder="e.g. Phnom Penh Beverage Supply Co."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">{t.catalog.contactPerson}</label>
                  <input
                    value={supContact}
                    onChange={(e) => setSupContact(e.target.value)}
                    placeholder="e.g. Sokha Chan"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">{t.branches.phone}</label>
                  <input
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    placeholder="+855 12 345 678"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Email</label>
                  <input
                    type="email"
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                    placeholder="supplier@example.com"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Address</label>
                  <input
                    value={supAddress}
                    onChange={(e) => setSupAddress(e.target.value)}
                    placeholder="Street / Sangkat / Khan"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Internal Notes</label>
                  <textarea
                    rows={2}
                    value={supNotes}
                    onChange={(e) => setSupNotes(e.target.value)}
                    placeholder="Payment terms, delivery schedule, etc."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {editingSup && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">{t.common.status}</label>
                    <select
                      value={supStatus}
                      onChange={(e) => setSupStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="ACTIVE">{t.common.active}</option>
                      <option value="INACTIVE">{t.common.inactive}</option>
                    </select>
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setSupModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    {t.common.save}
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
