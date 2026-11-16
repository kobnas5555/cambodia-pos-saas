'use client';

import {
  Activity,
  BarChart3,
  Building2,
  CreditCard,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sliders,
  Store,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Clock,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    user,
    activeTenant,
    tenants,
    activeBranch,
    isLoading,
    logout,
    switchTenant,
    selectBranch,
    hasAnyPermission,
  } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          <p className="text-sm text-slate-600">{t.common.loading}</p>
        </div>
      </div>
    );
  }

  const allPrimaryNav = [
    { href: '/dashboard', label: t.nav.dashboard, icon: LayoutDashboard, permissions: [] as string[] },
    { href: '/pos', label: t.nav.pos, icon: ShoppingCart, permissions: ['sales.create'] },
    { href: '/sales', label: t.nav.sales, icon: Receipt, permissions: ['sales.view'] },
    { href: '/products', label: t.nav.products, icon: Package, permissions: ['products.view'] },
    { href: '/inventory', label: t.nav.inventory, icon: Warehouse, permissions: ['inventory.view'] },
    { href: '/inventory/transfers', label: t.transfers?.title ?? 'Stock Transfers', icon: Truck, permissions: ['inventory.view'] },
    { href: '/purchasing', label: t.nav.purchasing, icon: Truck, permissions: ['purchases.view'] },
    { href: '/customers', label: t.nav.customers, icon: Users, permissions: ['customers.view'] },
    { href: '/finance', label: t.nav.finance, icon: Wallet, permissions: ['finance.view'] },
    { href: '/shifts', label: t.nav.shifts, icon: Clock, permissions: ['shifts.view'] },
    { href: '/reports', label: t.nav.reports, icon: BarChart3, permissions: ['reports.view'] },
    {
      href: '/access',
      label: t.nav.access,
      icon: Shield,
      permissions: ['employees.view', 'roles.view'],
    },
  ];

  const allSettingsNav = [
    { href: '/settings/business', label: t.nav.businessProfile, icon: Building2, permissions: ['tenant.view'] },
    { href: '/settings/branches', label: t.nav.branches, icon: Store, permissions: ['branches.view'] },
    { href: '/settings/system', label: t.nav.systemSettings, icon: Sliders, permissions: ['tenant.view'] },
    { href: '/settings/billing', label: t.billing?.title ?? 'Subscription & Plans', icon: CreditCard, permissions: ['tenant.view'] },
    { href: '/settings/sessions', label: t.nav.sessions, icon: CreditCard, permissions: [] as string[] },
    {
      href: '/settings/activity-logs',
      label: t.nav.activityLogs,
      icon: Activity,
      permissions: ['activity_logs.view'],
    },
  ];

  const primaryNav = allPrimaryNav.filter((item) => hasAnyPermission(item.permissions));
  const settingsNav = allSettingsNav.filter((item) => hasAnyPermission(item.permissions));

  const matchedNav = [...allPrimaryNav, ...allSettingsNav].find((item) => item.href === pathname);
  const isRouteAllowed =
    pathname === '/platform'
      ? user.isPlatformAdmin
      : matchedNav
        ? hasAnyPermission(matchedNav.permissions)
        : true;

  const handleSignOut = async () => {
    await logout();
    router.push('/login');
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-white">Cambodia POS</p>
            <p className="text-[11px] text-emerald-400">SaaS Platform</p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-6 border-t border-slate-800 pt-4">
          <p className="mb-2 flex items-center gap-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Settings className="h-3.5 w-3.5" />
            {t.nav.settings}
          </p>
          <div className="space-y-1">
            {settingsNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}

            {user.isPlatformAdmin && (
              <Link
                href="/platform"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  pathname === '/platform'
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-300 hover:bg-slate-800'
                }`}
              >
                <Globe className="h-4 w-4 shrink-0" />
                <span className="truncate">{t.nav.platform}</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 p-3">
        <div className="mb-2 rounded-lg bg-slate-800/80 px-3 py-2">
          <p className="truncate text-xs font-semibold text-white">{user.name}</p>
          <p className="truncate text-[11px] text-slate-400">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          {t.common.signOut}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 lg:block print:hidden">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden print:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 w-64 max-w-[80vw]">{sidebarContent}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              {activeTenant && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={t.common.business}
                    value={activeTenant.id}
                    onChange={(e) => void switchTenant(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-none sm:text-sm"
                  >
                    {tenants.map((ten) => (
                      <option key={ten.id} value={ten.id}>
                        {ten.name}
                      </option>
                    ))}
                  </select>

                  {activeTenant.branches.length > 0 && (
                    <select
                      aria-label={t.common.branch}
                      value={activeBranch?.id ?? ''}
                      onChange={(e) => selectBranch(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none sm:text-sm"
                    >
                      {activeTenant.branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.branchCode})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {activeTenant && (
                <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 sm:inline-flex">
                  {activeTenant.defaultCurrency} · $1 ={' '}
                  {Number(activeTenant.exchangeRateUsdToKhr).toLocaleString()} ៛
                </span>
              )}
              <LanguageSwitcher />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          {isRouteAllowed ? (
            children
          ) : (
            <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
              <Shield className="mx-auto h-10 w-10 text-amber-600" />
              <h2 className="mt-3 text-lg font-bold text-slate-900">Access Restricted</h2>
              <p className="mt-1 text-sm text-slate-600">
                Your assigned role does not include permission to view this page.
              </p>
              <Link
                href="/dashboard"
                className="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Back to {t.nav.dashboard}
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
