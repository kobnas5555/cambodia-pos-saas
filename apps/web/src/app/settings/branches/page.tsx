'use client';

import {
  Building2,
  CheckCircle2,
  Edit3,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTablePagination } from '@/components/DataTablePagination';
import { SettingsNav } from '@/components/SettingsNav';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError, type BranchSummary } from '@/lib/api';

export default function BranchesPage() {
  const { activeTenant, refreshProfile, hasPermission } = useAuth();
  const { t } = useI18n();
  const canCreate = hasPermission('branches.create');
  const canUpdate = hasPermission('branches.update');

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [mainFilter, setMainFilter] = useState<'ALL' | 'MAIN' | 'SECONDARY'>('ALL');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BranchSummary | null>(null);
  const [name, setName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isMain, setIsMain] = useState(false);
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [submitting, setSubmitting] = useState(false);

  const loadBranches = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const data = await apiRequest<BranchSummary[]>('/branches');
      setBranches(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load branches');
    } finally {
      setLoading(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    const total = branches.length;
    const active = branches.filter((b) => b.status === 'ACTIVE').length;
    const inactive = branches.filter((b) => b.status === 'INACTIVE').length;
    const mainBranch = branches.find((b) => b.isMain);
    return { total, active, inactive, mainBranch };
  }, [branches]);

  // Filtered dataset
  const filteredBranches = useMemo(() => {
    const s = search.toLowerCase().trim();
    return branches.filter((b) => {
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      if (mainFilter === 'MAIN' && !b.isMain) return false;
      if (mainFilter === 'SECONDARY' && b.isMain) return false;

      if (s) {
        const matchesName = b.name.toLowerCase().includes(s);
        const matchesCode = b.branchCode.toLowerCase().includes(s);
        const matchesPhone = b.phone ? b.phone.toLowerCase().includes(s) : false;
        const matchesAddress = b.address ? b.address.toLowerCase().includes(s) : false;
        if (!matchesName && !matchesCode && !matchesPhone && !matchesAddress) {
          return false;
        }
      }
      return true;
    });
  }, [branches, search, statusFilter, mainFilter]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, mainFilter]);

  // Paginated slice
  const paginatedBranches = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredBranches.slice(start, start + pageSize);
  }, [filteredBranches, currentPage, pageSize]);

  const openCreateModal = () => {
    setEditing(null);
    setName('');
    setBranchCode('');
    setPhone('');
    setAddress('');
    setIsMain(branches.length === 0);
    setStatus('ACTIVE');
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = (branch: BranchSummary) => {
    setEditing(branch);
    setName(branch.name);
    setBranchCode(branch.branchCode);
    setPhone(branch.phone ?? '');
    setAddress(branch.address ?? '');
    setIsMain(branch.isMain);
    setStatus(branch.status);
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFeedback(null);

    try {
      if (editing) {
        await apiRequest(`/branches/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            branchCode,
            phone: phone || null,
            address: address || null,
            isMain,
            status,
          }),
        });
        setFeedback(t.branches.updated);
      } else {
        await apiRequest('/branches', {
          method: 'POST',
          body: JSON.stringify({
            name,
            branchCode,
            phone: phone || null,
            address: address || null,
            isMain,
          }),
        });
        setFeedback(t.branches.created);
      }
      setModalOpen(false);
      await loadBranches();
      await refreshProfile();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save branch');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (branch: BranchSummary) => {
    setError(null);
    setFeedback(null);
    try {
      if (branch.status === 'ACTIVE') {
        await apiRequest(`/branches/${branch.id}`, { method: 'DELETE' });
        setFeedback(t.branches.deactivated);
      } else {
        await apiRequest(`/branches/${branch.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'ACTIVE' }),
        });
        setFeedback(t.branches.updated);
      }
      await loadBranches();
      await refreshProfile();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    }
  };

  return (
    <AppShell>
      <div className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
        <SettingsNav activeKey="branches" />
      </div>

      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header & Quick Action */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-emerald-600" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {t.branches.title}
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-600">{t.branches.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadBranches()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition"
              title={t.common.refresh}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t.common.refresh}</span>
            </button>
            {canCreate && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
              >
                <Plus className="h-4 w-4" />
                {t.branches.addBranch}
              </button>
            )}
          </div>
        </div>

        {/* Notifications */}
        {feedback && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>{feedback}</span>
          </div>
        )}
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

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Branches
              </span>
              <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">{metrics.total}</div>
            <p className="mt-1 text-xs text-slate-500">Configured branch locations</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Branches
              </span>
              <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-bold text-emerald-600">{metrics.active}</div>
            <p className="mt-1 text-xs text-slate-500">Open for sales & POS operations</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Primary Branch
              </span>
              <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
                <Star className="h-5 w-5 fill-amber-500" />
              </div>
            </div>
            <div className="mt-3 truncate text-lg font-bold text-slate-900">
              {metrics.mainBranch ? metrics.mainBranch.name : 'None assigned'}
            </div>
            <p className="mt-1 font-mono text-xs text-amber-700">
              {metrics.mainBranch ? metrics.mainBranch.branchCode : '—'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Inactive Branches
              </span>
              <div className="rounded-xl bg-slate-100 p-2.5 text-slate-500">
                <Building2 className="h-5 w-5 opacity-60" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-600">{metrics.inactive}</div>
            <p className="mt-1 text-xs text-slate-500">Temporarily paused branches</p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by branch name, code, phone, or address..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500">Status:</span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
                {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-md px-2.5 py-1 transition ${
                      statusFilter === st
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Designation Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500">Type:</span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
                {(['ALL', 'MAIN', 'SECONDARY'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMainFilter(m)}
                    className={`rounded-md px-2.5 py-1 transition ${
                      mainFilter === m
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {m === 'ALL' ? 'All' : m === 'MAIN' ? 'Main Only' : 'Secondary'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Branch Name</th>
                  <th className="px-5 py-3.5">Branch Code</th>
                  <th className="px-5 py-3.5">Phone</th>
                  <th className="px-5 py-3.5">Address</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Created Date</th>
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
                ) : filteredBranches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      <Building2 className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 text-sm font-medium text-slate-900">{t.common.noData}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {search || statusFilter !== 'ALL' || mainFilter !== 'ALL'
                          ? 'No branch locations match your filters.'
                          : 'Register your first branch location to start selling.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedBranches.map((branch) => (
                    <tr key={branch.id} className="hover:bg-slate-50/60 transition">
                      {/* Name & Main Badge */}
                      <td className="px-5 py-4 font-medium text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs">
                            {branch.branchCode.slice(0, 2)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{branch.name}</span>
                              {branch.isMain && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                  {t.common.main}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">ID: {branch.id.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </td>

                      {/* Code */}
                      <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-800">
                        <span className="rounded bg-slate-100 px-2 py-1">{branch.branchCode}</span>
                      </td>

                      {/* Phone */}
                      <td className="px-5 py-4 text-xs text-slate-600">
                        {branch.phone ? (
                          <a
                            href={`tel:${branch.phone}`}
                            className="inline-flex items-center gap-1 text-slate-700 hover:text-emerald-600"
                          >
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            <span>{branch.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Address */}
                      <td className="px-5 py-4 text-xs text-slate-600 max-w-xs truncate">
                        {branch.address ? (
                          <div className="flex items-center gap-1 truncate" title={branch.address}>
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                            <span className="truncate">{branch.address}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            branch.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {branch.status === 'ACTIVE' ? t.common.active : t.common.inactive}
                        </span>
                      </td>

                      {/* Created Date */}
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {new Date(branch.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        {canUpdate ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(branch)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              {t.common.edit}
                            </button>
                            {!branch.isMain && (
                              <button
                                type="button"
                                onClick={() => void toggleStatus(branch)}
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition ${
                                  branch.status === 'ACTIVE'
                                    ? 'border-red-200 text-red-700 hover:bg-red-50'
                                    : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                }`}
                              >
                                {branch.status === 'ACTIVE'
                                  ? t.common.deactivate
                                  : t.common.activate}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Read-only</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <DataTablePagination
            currentPage={currentPage}
            pageSize={pageSize}
            totalItems={filteredBranches.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            itemName="branches"
          />
        </div>

        {/* Create / Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {editing ? t.branches.editBranch : t.branches.addBranch}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {editing
                        ? 'Update branch details, contacts, and status.'
                        : 'Add a new physical location or warehouse to your business.'}
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
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase">
                    {t.branches.name} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Siem Reap Downtown"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase">
                      {t.branches.code} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={branchCode}
                      onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                      placeholder="e.g. SR-01"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm uppercase font-mono focus:border-emerald-500 focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">2-20 alphanumeric characters</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase">
                      {t.branches.phone}
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+855 12 345 678"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase">
                    {t.branches.address}
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street, Sangkat, Khan, City"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isMain}
                      disabled={editing?.isMain === true}
                      onChange={(e) => setIsMain(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-800">
                        {t.branches.isMain}
                      </span>
                      <p className="text-xs text-slate-500">
                        Primary headquarters branch. Used as default for order transfers and reports.
                      </p>
                    </div>
                  </label>

                  {editing && (
                    <div className="border-t border-slate-200 pt-3">
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                        Branch Status
                      </label>
                      <select
                        value={status}
                        disabled={editing.isMain}
                        onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="ACTIVE">ACTIVE — Open for sales</option>
                        <option value="INACTIVE">INACTIVE — Suspended / Closed</option>
                      </select>
                      {editing.isMain && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Main branch cannot be deactivated. Designate another branch as main first.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {submitting ? t.common.saving : t.common.save}
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
