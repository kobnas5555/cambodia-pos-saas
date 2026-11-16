'use client';

import { formatCurrency, type CurrencyCode } from '@cambodia-pos/shared';
import {
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit2,
  Eye,
  Mail,
  MapPin,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTablePagination } from '@/components/DataTablePagination';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

interface CustomerRow {
  id: string;
  customerCode: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  _count?: { orders: number };
  orders?: Array<{
    id: string;
    totalAmount: string;
    currencyCode: CurrencyCode;
    status: string;
    createdAt: string;
  }>;
}

interface CustomerDetail extends CustomerRow {
  orders: Array<{
    id: string;
    orderNumber: string;
    totalAmount: string;
    currencyCode: CurrencyCode;
    status: string;
    createdAt: string;
    branch: { id: string; name: string };
  }>;
}

const EXCHANGE_RATE = 4100;

export default function CustomersPage() {
  const { activeTenant } = useAuth();
  const { t } = useI18n();

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [saving, setSaving] = useState(false);

  // Customer Details & History Modal
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadCustomers = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await apiRequest<CustomerRow[]>(`/customers${qs}`);
      setCustomers(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load customers');
    } finally {
      setLoading(false);
    }
  }, [activeTenant, search]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const openCreateModal = () => {
    setEditId(null);
    setName('');
    setCustomerCode('');
    setPhone('');
    setEmail('');
    setAddress('');
    setNotes('');
    setStatus('ACTIVE');
    setModalOpen(true);
  };

  const openEditModal = (c: CustomerRow) => {
    setEditId(c.id);
    setName(c.name);
    setCustomerCode(c.customerCode);
    setPhone(c.phone || '');
    setEmail(c.email || '');
    setAddress(c.address || '');
    setNotes(c.notes || '');
    setStatus((c.status as 'ACTIVE' | 'INACTIVE') || 'ACTIVE');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (editId) {
        await apiRequest(`/customers/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            phone: phone || null,
            email: email || null,
            address: address || null,
            notes: notes || null,
            status,
          }),
        });
        setSuccessMsg('Customer updated successfully');
      } else {
        await apiRequest('/customers', {
          method: 'POST',
          body: JSON.stringify({
            name,
            customerCode: customerCode.trim() || undefined,
            phone: phone || null,
            email: email || null,
            address: address || null,
            notes: notes || null,
          }),
        });
        setSuccessMsg('Customer created successfully');
      }

      setModalOpen(false);
      await loadCustomers();
      if (detail && detail.id === editId) {
        await openHistory(editId);
      }
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save customer');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await apiRequest<CustomerDetail>(`/customers/${id}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load customer profile');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      return true;
    });
  }, [customers, statusFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  // Paginated customer list
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  // Aggregate customer metrics
  const metrics = useMemo(() => {
    const totalCount = customers.length;
    const activeCount = customers.filter((c) => c.status === 'ACTIVE').length;
    const activeBuyers = customers.filter((c) => (c._count?.orders ?? 0) > 0).length;

    let totalLtvUsd = 0;
    customers.forEach((c) => {
      (c.orders || []).forEach((o) => {
        const amt = parseFloat(o.totalAmount || '0') || 0;
        totalLtvUsd += o.currencyCode === 'KHR' ? amt / EXCHANGE_RATE : amt;
      });
    });

    const avgSpend = activeBuyers > 0 ? totalLtvUsd / activeBuyers : 0;

    return {
      totalCount,
      activeCount,
      activeBuyers,
      totalLtvUsd,
      avgSpend,
    };
  }, [customers]);

  // Calculate stats for current detail view
  const detailStats = useMemo(() => {
    if (!detail) return null;
    let spendUsd = 0;
    detail.orders.forEach((o) => {
      const amt = parseFloat(o.totalAmount || '0') || 0;
      spendUsd += o.currencyCode === 'KHR' ? amt / EXCHANGE_RATE : amt;
    });
    const avgOrder = detail.orders.length > 0 ? spendUsd / detail.orders.length : 0;
    const lastOrder = detail.orders[0] || null;

    return {
      spendUsd,
      avgOrder,
      lastOrder,
    };
  }, [detail]);

  const getInitials = (fullName: string) => {
    return fullName
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header & Quick Action */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-6 w-6 text-emerald-600" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {t.customers?.title ?? 'Customers'}
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {t.customers?.subtitle ??
                'Manage customer profiles, purchase history, loyalty, and lifetime spend.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadCustomers()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
              title={t.common.refresh}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t.common.refresh}</span>
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <Plus className="h-4 w-4" />
              {t.customers?.addCustomer ?? 'Add Customer'}
            </button>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t.customers?.totalCustomers ?? 'Total Customers'}
              </span>
              <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{metrics.totalCount}</span>
              <span className="text-xs font-medium text-emerald-600">
                {metrics.activeCount} active
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Registered client directory</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t.customers?.activeBuyers ?? 'Active Buyers'}
              </span>
              <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                <UserCheck className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{metrics.activeBuyers}</span>
              <span className="text-xs text-slate-500">
                {metrics.totalCount > 0
                  ? `${Math.round((metrics.activeBuyers / metrics.totalCount) * 100)}% conversion`
                  : '0%'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Customers with &ge;1 purchase</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t.customers?.totalLtv ?? 'Lifetime Value (LTV)'}
              </span>
              <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-emerald-600">
                {formatCurrency(metrics.totalLtvUsd, 'USD')}
              </div>
              <div className="text-xs text-slate-500">
                &asymp; {formatCurrency(metrics.totalLtvUsd * EXCHANGE_RATE, 'KHR')}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">Cumulative sales from customers</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t.customers?.avgSpend ?? 'Avg. Spend / Customer'}
              </span>
              <div className="rounded-xl bg-purple-50 p-2.5 text-purple-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(metrics.avgSpend, 'USD')}
              </div>
              <div className="text-xs text-slate-500">
                &asymp; {formatCurrency(metrics.avgSpend * EXCHANGE_RATE, 'KHR')}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">Per purchasing customer</p>
          </div>
        </div>

        {/* Filters Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                t.customers?.searchPlaceholder ?? 'Search by customer name, phone, code...'
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Status:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
              {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-md px-3 py-1.5 transition ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st === 'ALL'
                    ? t.customers?.allStatus ?? 'All'
                    : st === 'ACTIVE'
                    ? t.customers?.active ?? 'Active'
                    : t.customers?.inactive ?? 'Inactive'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Customer Data Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Contact Info</th>
                  <th className="px-5 py-3.5">Location / Address</th>
                  <th className="px-5 py-3.5 text-center">Orders</th>
                  <th className="px-5 py-3.5">Lifetime Spend</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
                        <span className="text-sm">{t.common.loading}</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      <Users className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 text-sm font-medium text-slate-900">{t.common.noData}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {search
                          ? 'No customer profiles match your search criteria.'
                          : 'Get started by registering your first customer profile.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedCustomers.map((c) => {
                    const orderCount = c._count?.orders ?? 0;
                    let customerSpendUsd = 0;
                    (c.orders || []).forEach((o) => {
                      const amt = parseFloat(o.totalAmount || '0') || 0;
                      customerSpendUsd += o.currencyCode === 'KHR' ? amt / EXCHANGE_RATE : amt;
                    });

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition">
                        {/* Customer Identification */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-xs font-bold text-white shadow-sm">
                              {getInitials(c.name)}
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => void openHistory(c.id)}
                                className="font-semibold text-slate-900 hover:text-emerald-600 text-left transition"
                              >
                                {c.name}
                              </button>
                              <div className="mt-0.5 font-mono text-xs text-slate-500">
                                {c.customerCode}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Contact Info */}
                        <td className="px-5 py-4">
                          <div className="space-y-1 text-xs">
                            {c.phone ? (
                              <a
                                href={`tel:${c.phone}`}
                                className="flex items-center gap-1.5 text-slate-700 hover:text-emerald-600"
                              >
                                <Phone className="h-3.5 w-3.5 text-slate-400" />
                                <span>{c.phone}</span>
                              </a>
                            ) : (
                              <span className="text-slate-400">&mdash;</span>
                            )}
                            {c.email && (
                              <a
                                href={`mailto:${c.email}`}
                                className="flex items-center gap-1.5 text-slate-500 hover:text-emerald-600 truncate max-w-[180px]"
                              >
                                <Mail className="h-3.5 w-3.5 text-slate-400" />
                                <span className="truncate">{c.email}</span>
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Address */}
                        <td className="px-5 py-4">
                          {c.address ? (
                            <div className="flex items-center gap-1.5 text-xs text-slate-600 max-w-xs truncate">
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                              <span className="truncate">{c.address}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">&mdash;</span>
                          )}
                        </td>

                        {/* Orders count */}
                        <td className="px-5 py-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              orderCount > 0
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <ShoppingBag className="h-3 w-3" />
                            {orderCount}
                          </span>
                        </td>

                        {/* Lifetime Spend */}
                        <td className="px-5 py-4">
                          <div className="text-sm font-semibold text-slate-900">
                            {formatCurrency(customerSpendUsd, 'USD')}
                          </div>
                          {customerSpendUsd > 0 && (
                            <div className="text-xs text-slate-500">
                              &asymp; {formatCurrency(customerSpendUsd * EXCHANGE_RATE, 'KHR')}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              c.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void openHistory(c.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
                              title={t.customers?.viewOrders ?? 'View History'}
                            >
                              <Eye className="h-3.5 w-3.5 text-slate-500" />
                              <span>{t.customers?.viewOrders ?? 'History'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(c)}
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm hover:bg-slate-50 transition"
                              title={t.customers?.editCustomer ?? 'Edit'}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <DataTablePagination
            currentPage={currentPage}
            pageSize={pageSize}
            totalItems={filteredCustomers.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            itemName="customers"
          />
        </div>

        {/* Add / Edit Customer Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {editId
                        ? t.customers?.editCustomer ?? 'Edit Customer'
                        : t.customers?.addCustomer ?? 'Add Customer'}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {editId
                        ? 'Update client contact information and settings.'
                        : 'Register a new customer profile for POS and sales tracking.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {t.customers?.customerName ?? 'Full Name'}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Sopheak Vathana"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {t.customers?.customerCode ?? 'Customer Code'}
                    </label>
                    <input
                      disabled={!!editId}
                      value={customerCode}
                      onChange={(e) => setCustomerCode(e.target.value.toUpperCase())}
                      placeholder={editId ? customerCode : 'Auto (e.g. CUST-0001)'}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    {!editId && (
                      <span className="mt-1 block text-[10px] text-slate-400">
                        {t.customers?.newCustomerCode ?? 'Auto-generated if left blank'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {t.customers?.phone ?? 'Phone Number'}
                    </label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +855 12 345 678"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {t.customers?.email ?? 'Email Address'}
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="client@example.com"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    {t.customers?.address ?? 'Physical Address'}
                  </label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="House, Street, Sangkat, Khan, Province"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    {t.customers?.notes ?? 'Notes / Remarks'}
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="VIP member, credit terms, special instructions..."
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {editId && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      {t.customers?.status ?? 'Status'}
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="ACTIVE">{t.customers?.active ?? 'Active'}</option>
                      <option value="INACTIVE">{t.customers?.inactive ?? 'Inactive'}</option>
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
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

        {/* Customer Details & Purchase History Modal */}
        {detail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm print:p-0 print:bg-white">
            <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto print:max-h-none print:shadow-none print:p-8">
              {/* Header Strip */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-base font-bold text-white shadow-md">
                    {getInitials(detail.name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-slate-900">{detail.name}</h2>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          detail.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {detail.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                      <span>{detail.customerCode}</span>
                      <span>&bull;</span>
                      <span className="font-sans">
                        {t.customers?.memberSince ?? 'Member Since'}:{' '}
                        {new Date(detail.createdAt).toLocaleDateString()}
                      </span>
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
                    <span>{t.customers?.printStatement ?? 'Print'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      openEditModal(detail);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    <span>{t.common.edit}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetail(null)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Profile Details Grid */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-xs">
                <div>
                  <span className="font-semibold text-slate-500 block">
                    {t.customers?.phone ?? 'Phone'}:
                  </span>
                  <span className="font-medium text-slate-900 mt-0.5 block">
                    {detail.phone || '—'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block">
                    {t.customers?.email ?? 'Email'}:
                  </span>
                  <span className="font-medium text-slate-900 mt-0.5 block truncate">
                    {detail.email || '—'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block">
                    {t.customers?.address ?? 'Address'}:
                  </span>
                  <span className="font-medium text-slate-900 mt-0.5 block truncate">
                    {detail.address || '—'}
                  </span>
                </div>
                {detail.notes && (
                  <div className="sm:col-span-3 border-t border-slate-200/60 pt-2">
                    <span className="font-semibold text-slate-500 block">
                      {t.customers?.notes ?? 'Notes'}:
                    </span>
                    <p className="text-slate-700 mt-0.5">{detail.notes}</p>
                  </div>
                )}
              </div>

              {/* Customer Performance Summary */}
              {detailStats && (
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      {t.customers?.totalOrders ?? 'Total Orders'}
                    </span>
                    <span className="text-xl font-bold text-slate-900 mt-1 block">
                      {detail.orders.length}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      {t.customers?.totalSpent ?? 'Total Spent'}
                    </span>
                    <span className="text-xl font-bold text-emerald-600 mt-1 block">
                      {formatCurrency(detailStats.spendUsd, 'USD')}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      &asymp; {formatCurrency(detailStats.spendUsd * EXCHANGE_RATE, 'KHR')}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Avg. Basket
                    </span>
                    <span className="text-xl font-bold text-slate-900 mt-1 block">
                      {formatCurrency(detailStats.avgOrder, 'USD')}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      &asymp; {formatCurrency(detailStats.avgOrder * EXCHANGE_RATE, 'KHR')}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      {t.customers?.lastOrder ?? 'Last Order'}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 mt-2 block truncate">
                      {detailStats.lastOrder
                        ? new Date(detailStats.lastOrder.createdAt).toLocaleDateString()
                        : 'No orders'}
                    </span>
                    <span className="text-[10px] text-slate-500 block truncate">
                      {detailStats.lastOrder ? detailStats.lastOrder.branch.name : ''}
                    </span>
                  </div>
                </div>
              )}

              {/* Purchase History Section */}
              <div className="mt-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      {t.customers?.orderHistory ?? 'Purchase History'}
                    </h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {detail.orders.length} transaction(s)
                  </span>
                </div>

                <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                  {detail.orders.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                      <ShoppingBag className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 text-sm font-medium text-slate-800">
                        {t.customers?.noOrders ?? 'No orders recorded yet for this customer.'}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Orders placed with this customer code at checkout will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                        <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Order #</th>
                            <th className="px-4 py-3">Date & Time</th>
                            <th className="px-4 py-3">Branch</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Total Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {detail.orders.map((o) => {
                            const isUsd = o.currencyCode === 'USD';
                            const num = parseFloat(o.totalAmount || '0') || 0;
                            const counterpart = isUsd ? num * EXCHANGE_RATE : num / EXCHANGE_RATE;
                            const counterpartCur: CurrencyCode = isUsd ? 'KHR' : 'USD';

                            return (
                              <tr key={o.id} className="hover:bg-slate-50/70 transition">
                                <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                                  {o.orderNumber}
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {new Date(o.createdAt).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-slate-700 font-medium">
                                  {o.branch.name}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      o.status === 'COMPLETED'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : o.status === 'CANCELLED'
                                        ? 'bg-rose-50 text-rose-700'
                                        : 'bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    {o.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="font-bold text-slate-900">
                                    {formatCurrency(o.totalAmount, o.currencyCode)}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    &asymp; {formatCurrency(counterpart, counterpartCur)}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

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
