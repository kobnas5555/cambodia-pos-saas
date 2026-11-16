'use client';

import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Cpu,
  CreditCard,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  HardDrive,
  History,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Terminal,
  TrendingUp,
  UserCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DataTablePagination } from '@/components/DataTablePagination';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, ApiClientError } from '@/lib/api';

type PlatformTab =
  | 'overview'
  | 'tenants'
  | 'plans'
  | 'subscriptions'
  | 'users'
  | 'monitoring'
  | 'logs';

interface PlatformOverview {
  tenantCount: number;
  activeTenants: number;
  suspendedTenants: number;
  branchCount: number;
  userCount: number;
  orderCount: number;
  totalGmv: number;
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  systemStatus: string;
}

interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  businessType: string;
  defaultCurrency: string;
  status: 'ACTIVE' | 'SUSPENDED';
  email?: string | null;
  phone?: string | null;
  createdAt: string;
  _count: { branches: number; tenantUsers: number; orders: number };
}

interface SubscriptionPlan {
  id: string;
  tier: string;
  name: string;
  description?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  maxBranches: number;
  maxEmployees: number;
  maxProducts: number;
  features: string[];
}

interface TenantSubscriptionRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  planTier: string;
  planName: string;
  status: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED';
  billingCycle: 'MONTHLY' | 'YEARLY';
  monthlyPrice: number;
  currentPeriodEnd: string;
}

interface PlatformUserRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  isPlatformAdmin: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  tenantCount: number;
  createdAt: string;
}

interface SystemMonitoringData {
  system: {
    status: string;
    uptimeSeconds: number;
    uptimeFormatted: string;
    nodeVersion: string;
    platform: string;
    cpuCount: number;
    freeMemoryMB: number;
    totalMemoryMB: number;
  };
  process: {
    rssMB: number;
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
  };
  database: {
    status: string;
    engine: string;
    tableRecordCounts: Record<string, number>;
  };
  backups: {
    status: string;
    retentionPolicy: string;
    checksumVerification: string;
  };
}

interface PlatformActivityLog {
  id: string;
  createdAt: string;
  action: string;
  module: string;
  recordType: string;
  recordId?: string | null;
  ipAddress?: string | null;
  user?: { id: string; name: string; email: string } | null;
  oldValues?: unknown;
  newValues?: unknown;
}

export default function PlatformAdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<PlatformTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // 1. Overview State
  const [overview, setOverview] = useState<PlatformOverview | null>(null);

  // 2. Tenants State
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantStatusFilter, setTenantStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');

  // 2. Tenants Pagination State
  const [tenantPage, setTenantPage] = useState(1);
  const [tenantPageSize, setTenantPageSize] = useState(10);

  // 3. Plans State
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [planModal, setPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    tier: '',
    name: '',
    description: '',
    monthlyPrice: 0,
    yearlyPrice: 0,
    maxBranches: 1,
    maxEmployees: 5,
    maxProducts: 1000,
    features: 'pos, sales, inventory, reports',
  });

  // 4. Subscriptions State & Pagination
  const [subscriptions, setSubscriptions] = useState<TenantSubscriptionRow[]>([]);
  const [subSearch, setSubSearch] = useState('');
  const [subStatusFilter, setSubStatusFilter] = useState<'ALL' | 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED'>('ALL');
  const [subPage, setSubPage] = useState(1);
  const [subPageSize, setSubPageSize] = useState(10);

  // 5. Users State & Pagination
  const [users, setUsers] = useState<PlatformUserRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | 'ADMIN' | 'TENANT'>('ALL');
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);

  // 6. Monitoring State
  const [monitoring, setMonitoring] = useState<SystemMonitoringData | null>(null);

  // 7. Activity Logs State & Pagination
  const [logs, setLogs] = useState<PlatformActivityLog[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(15);
  const [selectedLog, setSelectedLog] = useState<PlatformActivityLog | null>(null);

  // Filtered & Paginated Tenants
  const paginatedTenants = useMemo(() => {
    const start = (tenantPage - 1) * tenantPageSize;
    return tenants.slice(start, start + tenantPageSize);
  }, [tenants, tenantPage, tenantPageSize]);

  // Filtered & Paginated Subscriptions
  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((s) => {
      if (subStatusFilter !== 'ALL' && s.status !== subStatusFilter) return false;
      if (subSearch.trim()) {
        const q = subSearch.toLowerCase().trim();
        const matchesName = s.tenantName.toLowerCase().includes(q);
        const matchesSlug = s.tenantSlug.toLowerCase().includes(q);
        const matchesPlan = s.planName.toLowerCase().includes(q) || s.planTier.toLowerCase().includes(q);
        if (!matchesName && !matchesSlug && !matchesPlan) return false;
      }
      return true;
    });
  }, [subscriptions, subSearch, subStatusFilter]);

  const paginatedSubscriptions = useMemo(() => {
    const start = (subPage - 1) * subPageSize;
    return filteredSubscriptions.slice(start, start + subPageSize);
  }, [filteredSubscriptions, subPage, subPageSize]);

  // Paginated Users
  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userPageSize;
    return users.slice(start, start + userPageSize);
  }, [users, userPage, userPageSize]);

  // Filtered & Paginated Logs
  const filteredLogs = useMemo(() => {
    if (!logSearch.trim()) return logs;
    const q = logSearch.toLowerCase().trim();
    return logs.filter((l) => {
      const matchesAction = l.action.toLowerCase().includes(q);
      const matchesModule = l.module.toLowerCase().includes(q);
      const matchesUser = l.user?.email.toLowerCase().includes(q) || l.user?.name.toLowerCase().includes(q);
      const matchesType = l.recordType?.toLowerCase().includes(q);
      return matchesAction || matchesModule || Boolean(matchesUser) || Boolean(matchesType);
    });
  }, [logs, logSearch]);

  const paginatedLogs = useMemo(() => {
    const start = (logPage - 1) * logPageSize;
    return filteredLogs.slice(start, start + logPageSize);
  }, [filteredLogs, logPage, logPageSize]);

  // Reset pagination on filter changes
  useEffect(() => { setTenantPage(1); }, [tenantSearch, tenantStatusFilter]);
  useEffect(() => { setSubPage(1); }, [subSearch, subStatusFilter]);
  useEffect(() => { setUserPage(1); }, [userSearch, userRoleFilter]);
  useEffect(() => { setLogPage(1); }, [logSearch]);

  // Load active tab data
  const loadTabData = useCallback(async (activeTab: PlatformTab) => {
    if (!user?.isPlatformAdmin) return;
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'overview') {
        const data = await apiRequest<PlatformOverview>('/platform/overview');
        setOverview(data);
      } else if (activeTab === 'tenants') {
        const query = new URLSearchParams();
        if (tenantSearch) query.set('search', tenantSearch);
        if (tenantStatusFilter !== 'ALL') query.set('status', tenantStatusFilter);
        const data = await apiRequest<PlatformTenant[]>(`/platform/tenants?${query.toString()}`);
        setTenants(data);
      } else if (activeTab === 'plans') {
        const data = await apiRequest<SubscriptionPlan[]>('/platform/plans');
        setPlans(data);
      } else if (activeTab === 'subscriptions') {
        const data = await apiRequest<TenantSubscriptionRow[]>('/platform/subscriptions');
        setSubscriptions(data);
      } else if (activeTab === 'users') {
        const query = new URLSearchParams();
        if (userSearch) query.set('search', userSearch);
        if (userRoleFilter !== 'ALL') query.set('role', userRoleFilter);
        const data = await apiRequest<PlatformUserRow[]>(`/platform/users?${query.toString()}`);
        setUsers(data);
      } else if (activeTab === 'monitoring') {
        const data = await apiRequest<SystemMonitoringData>('/platform/monitoring');
        setMonitoring(data);
      } else if (activeTab === 'logs') {
        const data = await apiRequest<PlatformActivityLog[]>('/platform/activity-logs');
        setLogs(data);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load platform data');
    } finally {
      setLoading(false);
    }
  }, [user, tenantSearch, tenantStatusFilter, userSearch, userRoleFilter]);

  useEffect(() => {
    if (user?.isPlatformAdmin) {
      void loadTabData(tab);
    }
  }, [user, tab, loadTabData]);

  // Tenant Status Toggle
  const handleToggleTenantStatus = async (ten: PlatformTenant) => {
    const nextStatus = ten.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await apiRequest(`/platform/tenants/${ten.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setFeedback(`Tenant "${ten.name}" status updated to ${nextStatus}.`);
      void loadTabData('tenants');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to update tenant status');
    }
  };

  // User Admin Toggle
  const handleToggleUserAdmin = async (u: PlatformUserRow) => {
    const nextAdmin = !u.isPlatformAdmin;
    try {
      await apiRequest(`/platform/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPlatformAdmin: nextAdmin }),
      });
      setFeedback(`User "${u.name}" platform admin status updated.`);
      void loadTabData('users');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to update user platform status');
    }
  };

  // Plan Save Handler
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        id: editingPlan?.id,
        tier: planForm.tier.toUpperCase().trim(),
        name: planForm.name.trim(),
        description: planForm.description.trim(),
        monthlyPrice: Number(planForm.monthlyPrice),
        yearlyPrice: Number(planForm.yearlyPrice),
        maxBranches: Number(planForm.maxBranches),
        maxEmployees: Number(planForm.maxEmployees),
        maxProducts: Number(planForm.maxProducts),
        features: planForm.features.split(',').map((f) => f.trim()).filter(Boolean),
      };

      await apiRequest('/platform/plans', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setFeedback(`Subscription plan "${payload.name}" saved.`);
      setPlanModal(false);
      void loadTabData('plans');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save subscription plan');
    }
  };

  // Export Tenants CSV
  const handleExportTenantsCsv = () => {
    if (tenants.length === 0) return;
    const headers = ['Business Name', 'Slug', 'Business Type', 'Currency', 'Status', 'Branches', 'Orders', 'Joined Date'];
    const rows = tenants.map((t) => [
      `"${t.name}"`,
      `"${t.slug}"`,
      `"${t.businessType}"`,
      `"${t.defaultCurrency}"`,
      `"${t.status}"`,
      t._count.branches,
      t._count.orders,
      `"${new Date(t.createdAt).toISOString()}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `platform-tenants-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Access Denied Screen for Non-Platform Admins
  if (user && !user.isPlatformAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl py-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Platform Administrator Access Required</h1>
          <p className="mt-2 text-sm text-slate-600">
            You are currently signed in as a tenant administrator. SaaS platform administration is strictly segregated, and tenant administrators cannot view or modify other tenants' data.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Return to Store Dashboard
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Platform Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
                <Shield className="h-3.5 w-3.5" />
              </span>
              <h1 className="text-2xl font-bold text-slate-900">SaaS Platform Administration</h1>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Master control plane for multi-tenant governance, subscription billing, system health, and cross-tenant security auditing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Super Admin: {user?.email}
            </span>
          </div>
        </div>

        {/* Feedback / Alert */}
        {feedback && (
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{feedback}</span>
            </div>
            <button type="button" onClick={() => setFeedback(null)} className="text-emerald-700 hover:text-emerald-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError(null)} className="text-red-700 hover:text-red-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 7 Tab Navigation Bar */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
          {[
            { key: 'overview', label: 'SaaS Dashboard', icon: TrendingUp },
            { key: 'tenants', label: 'Business / Tenants', icon: Store },
            { key: 'plans', label: 'Subscription Plans', icon: CreditCard },
            { key: 'subscriptions', label: 'Subscriptions', icon: FileText },
            { key: 'users', label: 'Platform Users', icon: Users },
            { key: 'monitoring', label: 'System Monitoring', icon: Cpu },
            { key: 'logs', label: 'Platform Activity Logs', icon: History },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key as PlatformTab)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
                  active
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: SAAS DASHBOARD */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {overview ? (
              <>
                {/* 6 Key Platform Metrics */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-semibold uppercase text-slate-500">Total Tenants</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{overview.tenantCount}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{overview.activeTenants} active, {overview.suspendedTenants} suspended</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-semibold uppercase text-slate-500">Monthly Revenue</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-700">${overview.mrr.toLocaleString()}</p>
                    <p className="mt-1 text-[11px] text-emerald-600 font-medium">ARR: ${overview.arr.toLocaleString()}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-semibold uppercase text-slate-500">Total Outlets</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{overview.branchCount}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Across Cambodia</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-semibold uppercase text-slate-500">Platform Users</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{overview.userCount}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Registered accounts</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-semibold uppercase text-slate-500">Total Orders</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{overview.orderCount.toLocaleString()}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Processed POS sales</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-semibold uppercase text-slate-500">System Health</p>
                    <p className="mt-1 flex items-center gap-1.5 text-base font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      100% Online
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">All services healthy</p>
                  </div>
                </div>

                {/* Platform Summary Modules */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                    <h3 className="text-base font-bold text-slate-900">Platform Architecture &amp; Multi-Tenancy</h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Cambodia POS SaaS isolates tenant databases and application logic via tenant context middlewares.
                    </p>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                        <span className="font-semibold text-slate-700">Cross-Tenant Isolation Guard</span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                          Active &amp; Enforced
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                        <span className="font-semibold text-slate-700">National Bank of Cambodia (NBC) KHQR</span>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-bold text-indigo-800">
                          Bakong Standard
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                        <span className="font-semibold text-slate-700">Dual Currency (USD &amp; KHR)</span>
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 font-bold text-purple-800">
                          Enabled
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                    <h3 className="text-base font-bold text-slate-900">Quick Platform Actions</h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Direct shortcuts to administrative configuration areas.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setTab('tenants')}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-left text-xs font-semibold text-slate-700 hover:border-indigo-500 hover:bg-slate-50"
                      >
                        <Store className="h-4 w-4 text-indigo-600" />
                        <div>
                          <div>Manage Tenants</div>
                          <span className="text-[10px] text-slate-400">View businesses &amp; status</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('plans')}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-left text-xs font-semibold text-slate-700 hover:border-indigo-500 hover:bg-slate-50"
                      >
                        <CreditCard className="h-4 w-4 text-emerald-600" />
                        <div>
                          <div>Subscription Tiers</div>
                          <span className="text-[10px] text-slate-400">Manage plan pricing</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('monitoring')}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-left text-xs font-semibold text-slate-700 hover:border-indigo-500 hover:bg-slate-50"
                      >
                        <Cpu className="h-4 w-4 text-amber-600" />
                        <div>
                          <div>System Health</div>
                          <span className="text-[10px] text-slate-400">Runtime &amp; memory telemetry</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('logs')}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-left text-xs font-semibold text-slate-700 hover:border-indigo-500 hover:bg-slate-50"
                      >
                        <History className="h-4 w-4 text-purple-600" />
                        <div>
                          <div>Security Audit</div>
                          <span className="text-[10px] text-slate-400">Review cross-tenant logs</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-slate-500">Loading platform overview...</div>
            )}
          </div>
        )}

        {/* TAB 2: BUSINESS / TENANT MANAGEMENT */}
        {tab === 'tenants' && (
          <div className="space-y-4">
            {/* Filter and Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[240px]">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    placeholder="Search tenant or slug..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <select
                  value={tenantStatusFilter}
                  onChange={(e) => setTenantStatusFilter(e.target.value as any)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active Only</option>
                  <option value="SUSPENDED">Suspended Only</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadTabData('tenants')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Filter
                </button>
              </div>

              <button
                type="button"
                onClick={handleExportTenantsCsv}
                disabled={tenants.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                Export CSV
              </button>
            </div>

            {/* Tenants Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Business Name</th>
                      <th className="px-4 py-3">Slug</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Branches</th>
                      <th className="px-4 py-3">Users</th>
                      <th className="px-4 py-3">Orders</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tenants.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                          No tenants found.
                        </td>
                      </tr>
                    ) : (
                      paginatedTenants.map((ten) => (
                        <tr key={ten.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3 font-medium text-slate-900">{ten.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{ten.slug}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{ten.businessType}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-700">{ten._count.branches}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{ten._count.tenantUsers}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{ten._count.orders}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                ten.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {ten.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {new Date(ten.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => void handleToggleTenantStatus(ten)}
                              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                                ten.status === 'ACTIVE'
                                  ? 'border border-rose-200 text-rose-700 hover:bg-rose-50'
                                  : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {ten.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <DataTablePagination
                currentPage={tenantPage}
                pageSize={tenantPageSize}
                totalItems={tenants.length}
                onPageChange={setTenantPage}
                onPageSizeChange={setTenantPageSize}
                itemName="tenants"
              />
            </div>
          </div>
        )}

        {/* TAB 3: SUBSCRIPTION PLANS */}
        {tab === 'plans' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Subscription Plans &amp; Resource Quotas</h2>
                <p className="text-xs text-slate-500">
                  Configure SaaS tier pricing in USD/KHR and branch/product/staff resource thresholds.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingPlan(null);
                  setPlanForm({
                    tier: '',
                    name: '',
                    description: '',
                    monthlyPrice: 29,
                    yearlyPrice: 290,
                    maxBranches: 2,
                    maxEmployees: 10,
                    maxProducts: 2000,
                    features: 'pos, sales, inventory, reports, transfers',
                  });
                  setPlanModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Add Custom Plan
              </button>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                        {p.tier}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPlan(p);
                          setPlanForm({
                            tier: p.tier,
                            name: p.name,
                            description: p.description ?? '',
                            monthlyPrice: p.monthlyPrice,
                            yearlyPrice: p.yearlyPrice,
                            maxBranches: p.maxBranches,
                            maxEmployees: p.maxEmployees,
                            maxProducts: p.maxProducts,
                            features: p.features.join(', '),
                          });
                          setPlanModal(true);
                        }}
                        className="rounded p-1 text-slate-400 hover:text-slate-700"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <h3 className="mt-3 text-lg font-bold text-slate-900">{p.name}</h3>
                    <p className="mt-1 text-xs text-slate-500 min-h-[32px]">{p.description || 'Standard plan tier'}</p>

                    <div className="my-4 border-y border-slate-100 py-3">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-slate-900">${p.monthlyPrice}</span>
                        <span className="text-xs text-slate-500">/ month</span>
                      </div>
                      <p className="text-[11px] text-slate-400">${p.yearlyPrice} billed annually</p>
                    </div>

                    <div className="space-y-2 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>Max Branches</span>
                        <span className="font-semibold text-slate-800">{p.maxBranches}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max Employees</span>
                        <span className="font-semibold text-slate-800">{p.maxEmployees}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max Products</span>
                        <span className="font-semibold text-slate-800">{p.maxProducts.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Entitlements:</p>
                    <div className="flex flex-wrap gap-1">
                      {p.features.map((feat) => (
                        <span key={feat} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: SUBSCRIPTIONS */}
        {tab === 'subscriptions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Tenant Subscriptions Ledger</h2>
                <p className="text-xs text-slate-500">
                  Track subscription status, billing cycles, and next renewal dates across all Cambodian merchants.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadTabData('subscriptions')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
              <div className="relative min-w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  placeholder="Search by business name, slug, or plan..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Status:</span>
                <select
                  value={subStatusFilter}
                  onChange={(e) => setSubStatusFilter(e.target.value as any)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="TRIAL">TRIAL</option>
                  <option value="PAST_DUE">PAST_DUE</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Business</th>
                      <th className="px-4 py-3">Plan Tier</th>
                      <th className="px-4 py-3">Cycle</th>
                      <th className="px-4 py-3">Monthly Value</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Renewal Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSubscriptions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No subscriptions recorded.
                        </td>
                      </tr>
                    ) : (
                      paginatedSubscriptions.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-900">{s.tenantName}</span>
                            <span className="block font-mono text-[11px] text-slate-400">{s.tenantSlug}</span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">{s.planName}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{s.billingCycle}</td>
                          <td className="px-4 py-3 text-xs font-bold text-emerald-700">${s.monthlyPrice}/mo</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                s.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : s.status === 'TRIAL'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {s.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {new Date(s.currentPeriodEnd).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                const next = s.status === 'ACTIVE' ? 'PAST_DUE' : 'ACTIVE';
                                await apiRequest(`/platform/subscriptions/${s.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: next }),
                                });
                                setFeedback(`Subscription status for ${s.tenantName} updated.`);
                                void loadTabData('subscriptions');
                              }}
                              className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Override Status
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <DataTablePagination
                currentPage={subPage}
                pageSize={subPageSize}
                totalItems={filteredSubscriptions.length}
                onPageChange={setSubPage}
                onPageSizeChange={setSubPageSize}
                itemName="subscriptions"
              />
            </div>
          </div>
        )}

        {/* TAB 5: PLATFORM USERS */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[240px]">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search user name or email..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value as any)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ALL">All Roles</option>
                  <option value="ADMIN">Platform Admins Only</option>
                  <option value="TENANT">Tenant Users Only</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadTabData('users')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Search
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">User Name</th>
                      <th className="px-4 py-3">Email Address</th>
                      <th className="px-4 py-3">Platform Role</th>
                      <th className="px-4 py-3">Tenants</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Registered</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      paginatedUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3 font-semibold text-slate-900">{u.name}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{u.email}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                u.isPlatformAdmin
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {u.isPlatformAdmin ? 'Platform Admin' : 'Tenant User'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{u.tenantCount} Workspaces</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                u.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => void handleToggleUserAdmin(u)}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                                u.isPlatformAdmin
                                  ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                  : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                              }`}
                            >
                              {u.isPlatformAdmin ? 'Revoke Admin' : 'Make Platform Admin'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <DataTablePagination
                currentPage={userPage}
                pageSize={userPageSize}
                totalItems={users.length}
                onPageChange={setUserPage}
                onPageSizeChange={setUserPageSize}
                itemName="users"
              />
            </div>
          </div>
        )}

        {/* TAB 6: SYSTEM MONITORING */}
        {tab === 'monitoring' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">System Runtime &amp; Telemetry Monitoring</h2>
                <p className="text-xs text-slate-500">
                  Node.js process status, memory footprint, database tables, and automated disaster recovery.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadTabData('monitoring')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Telemetry
              </button>
            </div>

            {monitoring ? (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* 1. Node.js & Host Telemetry */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <Server className="h-4 w-4 text-indigo-600" />
                      Runtime Process Health
                    </h3>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                      {monitoring.system.status}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <span className="text-slate-400">Process Uptime</span>
                      <p className="mt-1 font-bold text-slate-900">{monitoring.system.uptimeFormatted}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <span className="text-slate-400">Node Engine</span>
                      <p className="mt-1 font-mono font-bold text-slate-900">{monitoring.system.nodeVersion}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <span className="text-slate-400">Host OS</span>
                      <p className="mt-1 font-bold text-slate-900">{monitoring.system.platform}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <span className="text-slate-400">CPU Cores</span>
                      <p className="mt-1 font-bold text-slate-900">{monitoring.system.cpuCount} Logical Cores</p>
                    </div>
                  </div>

                  {/* Memory meters */}
                  <div className="mt-5 space-y-3">
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span>Process Heap Memory</span>
                        <span>{monitoring.process.heapUsedMB} MB / {monitoring.process.heapTotalMB} MB</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          style={{
                            width: `${Math.min(
                              Math.round((monitoring.process.heapUsedMB / monitoring.process.heapTotalMB) * 100),
                              100,
                            )}%`,
                          }}
                          className="h-full bg-indigo-600 rounded-full"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span>Resident Set Size (RSS)</span>
                        <span>{monitoring.process.rssMB} MB</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Database & Backups */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <Database className="h-4 w-4 text-emerald-600" />
                      Database &amp; Backup Integrity
                    </h3>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                      {monitoring.database.status}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-slate-500">
                    Engine: <strong className="text-slate-700">{monitoring.database.engine}</strong>
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    {Object.entries(monitoring.database.tableRecordCounts).map(([tbl, cnt]) => (
                      <div key={tbl} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-center">
                        <span className="text-[10px] uppercase font-bold text-slate-400">{tbl}</span>
                        <p className="mt-0.5 text-base font-black text-slate-800">{cnt.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800">
                    <div className="flex items-center gap-2 font-bold">
                      <ShieldCheck className="h-4 w-4" />
                      <span>{monitoring.backups.retentionPolicy}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-700">
                      {monitoring.backups.checksumVerification} · Disaster recovery ready.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500">Loading system metrics...</div>
            )}
          </div>
        )}

        {/* TAB 7: PLATFORM ACTIVITY LOGS */}
        {tab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Platform Security &amp; Activity Audit</h2>
                <p className="text-xs text-slate-500">
                  Immutable audit records of platform administrators modifying tenant statuses, plans, or privileges.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadTabData('logs')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Logs
              </button>
            </div>

            {/* Log Search Filter */}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
              <div className="relative flex-1 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Filter logs by action, module, or user email..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Module</th>
                      <th className="px-4 py-3">Record Type</th>
                      <th className="px-4 py-3">Actor Email</th>
                      <th className="px-4 py-3">IP Address</th>
                      <th className="px-4 py-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No platform activity logs found.
                        </td>
                      </tr>
                    ) : (
                      paginatedLogs.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                            {new Date(l.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{l.action}</td>
                          <td className="px-4 py-3">
                            <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                              {l.module}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{l.recordType}</td>
                          <td className="px-4 py-3 text-xs font-medium text-slate-700">
                            {l.user?.email || 'System'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{l.ipAddress || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedLog(l)}
                              className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <DataTablePagination
                currentPage={logPage}
                pageSize={logPageSize}
                totalItems={filteredLogs.length}
                onPageChange={setLogPage}
                onPageSizeChange={setLogPageSize}
                itemName="audit logs"
              />
            </div>
          </div>
        )}

        {/* Modal: Plan Add / Edit */}
        {planModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900">
                  {editingPlan ? `Edit ${editingPlan.name}` : 'Create Subscription Plan'}
                </h3>
                <button type="button" onClick={() => setPlanModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSavePlan} className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Tier Key</label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingPlan)}
                      value={planForm.tier}
                      onChange={(e) => setPlanForm({ ...planForm, tier: e.target.value })}
                      placeholder="ENTERPRISE_PLUS"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Display Name</label>
                    <input
                      type="text"
                      required
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                      placeholder="Enterprise Plus"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Description</label>
                  <input
                    type="text"
                    value={planForm.description}
                    onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                    placeholder="Designed for large supermarket chains"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Monthly Price (USD)</label>
                    <input
                      type="number"
                      required
                      value={planForm.monthlyPrice}
                      onChange={(e) => setPlanForm({ ...planForm, monthlyPrice: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Yearly Price (USD)</label>
                    <input
                      type="number"
                      required
                      value={planForm.yearlyPrice}
                      onChange={(e) => setPlanForm({ ...planForm, yearlyPrice: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Max Branches</label>
                    <input
                      type="number"
                      required
                      value={planForm.maxBranches}
                      onChange={(e) => setPlanForm({ ...planForm, maxBranches: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Max Staff</label>
                    <input
                      type="number"
                      required
                      value={planForm.maxEmployees}
                      onChange={(e) => setPlanForm({ ...planForm, maxEmployees: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Max Products</label>
                    <input
                      type="number"
                      required
                      value={planForm.maxProducts}
                      onChange={(e) => setPlanForm({ ...planForm, maxProducts: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Features (comma-separated tags)
                  </label>
                  <input
                    type="text"
                    value={planForm.features}
                    onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })}
                    placeholder="pos, sales, transfers, analytics, pwa_offline"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setPlanModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    Save Plan
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Activity Log Diff */}
        {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedLog.action}</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {new Date(selectedLog.createdAt).toISOString()} · Actor: {selectedLog.user?.email || 'System'}
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {Boolean(selectedLog.oldValues) && (
                  <div>
                    <span className="text-xs font-semibold text-rose-700">Previous Values:</span>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-rose-300 font-mono">
                      {JSON.stringify(selectedLog.oldValues, null, 2)}
                    </pre>
                  </div>
                )}
                {Boolean(selectedLog.newValues) && (
                  <div>
                    <span className="text-xs font-semibold text-emerald-700">New Values:</span>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-emerald-300 font-mono">
                      {JSON.stringify(selectedLog.newValues, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
