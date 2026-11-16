'use client';

import {
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  FileText,
  History,
  Languages,
  Percent,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
} from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SettingsNav } from '@/components/SettingsNav';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest } from '@/lib/api';

interface SettingsSummary {
  taxEnabled: boolean;
  taxRatePercent: string;
  taxIdentificationNumber: string;
  activeRate: string;
  paperSize: string;
}

export default function SettingsHubPage() {
  const { activeTenant } = useAuth();
  const { t } = useI18n();

  const [summary, setSummary] = useState<SettingsSummary>({
    taxEnabled: false,
    taxRatePercent: '0',
    taxIdentificationNumber: '',
    activeRate: '4100',
    paperSize: '80mm',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSettingsSummary() {
      if (!activeTenant) return;
      try {
        const res = await apiRequest<{
          settings: Record<string, unknown>;
          exchangeRates: Array<{ rate: string }>;
        }>('/settings');
        setSummary({
          taxEnabled: Boolean(res.settings?.taxEnabled),
          taxRatePercent: String(res.settings?.taxRatePercent ?? '0'),
          taxIdentificationNumber: String(res.settings?.taxIdentificationNumber ?? ''),
          activeRate: res.exchangeRates?.[0]?.rate ?? '4100',
          paperSize: String(res.settings?.paperSize ?? '80mm'),
        });
      } catch {
        // fallback to defaults
      } finally {
        setLoading(false);
      }
    }
    void loadSettingsSummary();
  }, [activeTenant]);

  const branchCount = activeTenant?.branches?.length ?? 1;
  const mainBranch = activeTenant?.branches?.find((b) => b.isMain) ?? activeTenant?.branches?.[0];

  const modules = [
    {
      title: 'Business Profile',
      category: 'Legal & Branding',
      desc: 'Company name, registered business type, legal contact info, store logo URL, and multi-business workspaces.',
      href: '/settings/business',
      icon: Building2,
      badge: activeTenant?.businessType ?? 'RETAIL',
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      iconColor: 'text-blue-600',
    },
    {
      title: 'Branch Settings',
      category: 'Multi-Location Operations',
      desc: 'Manage store outlets, headquarters assignment, branch phone numbers, addresses, and activation status.',
      href: '/settings/branches',
      icon: Store,
      badge: `${branchCount} Branch${branchCount > 1 ? 'es' : ''}`,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      iconColor: 'text-emerald-600',
    },
    {
      title: 'Currency',
      category: 'Financial Core',
      desc: 'Primary operating currency (USD or KHR), multi-currency POS pricing, and cash register change calculations.',
      href: '/settings/business',
      icon: DollarSign,
      badge: activeTenant?.defaultCurrency ?? 'USD',
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      iconColor: 'text-amber-600',
    },
    {
      title: 'Exchange Rates',
      category: 'NBC Dual-Currency Engine',
      desc: 'Official NBC USD/KHR conversion rate publisher, rate change history, and interactive currency converter.',
      href: '/settings/system?tab=exchange',
      icon: ArrowLeftRight,
      badge: `1 USD = ${Number(summary.activeRate).toLocaleString()} KHR`,
      color: 'bg-purple-50 text-purple-700 border-purple-200',
      iconColor: 'text-purple-600',
    },
    {
      title: 'Language',
      category: 'Localization',
      desc: 'Bilingual platform localization with instantaneous switching between English (EN) and ភាសាខ្មែរ (KM).',
      href: '/settings/system?tab=preferences',
      icon: Languages,
      badge: activeTenant?.defaultLanguage === 'km' ? 'ភាសាខ្មែរ (KM)' : 'English (EN)',
      color: 'bg-sky-50 text-sky-700 border-sky-200',
      iconColor: 'text-sky-600',
    },
    {
      title: 'Receipt Settings',
      category: 'POS & Thermal Printing',
      desc: 'Thermal printer paper sizing (80mm/58mm/A4), custom headers/footers, store policy, WiFi info, and live preview.',
      href: '/settings/system?tab=receipt',
      icon: Receipt,
      badge: `${summary.paperSize} Thermal`,
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      iconColor: 'text-indigo-600',
    },
    {
      title: 'Tax Settings',
      category: 'GDT Compliance',
      desc: 'Cambodia General Department of Taxation VAT configuration (10%), VATTIN registration, and tax simulation.',
      href: '/settings/system?tab=tax',
      icon: Percent,
      badge: summary.taxEnabled ? `${summary.taxRatePercent}% VAT Active` : 'Tax Inactive',
      color: summary.taxEnabled
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-slate-100 text-slate-600 border-slate-200',
      iconColor: 'text-emerald-600',
    },
    {
      title: 'Activity Logs',
      category: 'Audit & Security',
      desc: 'Complete audit trail of system events, cashier actions, price overrides, discount approvals, and data diffs.',
      href: '/settings/activity-logs',
      icon: History,
      badge: 'Audit Trail',
      color: 'bg-slate-100 text-slate-800 border-slate-200',
      iconColor: 'text-slate-600',
    },
  ];

  return (
    <AppShell>
      <div className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
        <SettingsNav />
      </div>

      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Settings &amp; Store Administration</h1>
            <p className="mt-1 text-sm text-slate-600">
              Configure your business legal profile, branch locations, dual-currency rates, receipts, tax compliance, and security logs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Tenant ID: {activeTenant?.slug ?? 'workspace'}
            </span>
          </div>
        </div>

        {/* 4 Status / Overview Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Business Identity</span>
              <Building2 className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-lg font-bold text-slate-900 truncate">{activeTenant?.name ?? 'Loading...'}</p>
            <p className="text-xs text-slate-500">Type: {activeTenant?.businessType ?? 'Retail'}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Branches</span>
              <Store className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-lg font-bold text-slate-900">{branchCount} Outlets</p>
            <p className="text-xs text-slate-500">HQ: {mainBranch?.name ?? 'Main Branch'}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dual Currency (NBC)</span>
              <ArrowLeftRight className="h-4 w-4 text-purple-600" />
            </div>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {Number(summary.activeRate).toLocaleString()} ៛ / $1
            </p>
            <p className="text-xs text-slate-500">Base Currency: {activeTenant?.defaultCurrency ?? 'USD'}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tax &amp; Language</span>
              <Percent className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {summary.taxEnabled ? `${summary.taxRatePercent}% VAT Active` : 'No Tax'}
            </p>
            <p className="text-xs text-slate-500">
              Lang: {activeTenant?.defaultLanguage === 'km' ? 'ភាសាខ្មែរ (KM)' : 'English (EN)'}
            </p>
          </div>
        </div>

        {/* 8 Feature Action Cards */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Configuration Modules</h2>
            <span className="text-xs font-medium text-slate-500">8 Management Sections</span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((m) => {
              const Icon = m.icon;
              return (
                <Link
                  key={m.title}
                  href={m.href}
                  className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-emerald-500 hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 transition group-hover:bg-emerald-50">
                        <Icon className={`h-5 w-5 ${m.iconColor}`} />
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${m.color}`}
                      >
                        {m.badge}
                      </span>
                    </div>

                    <h3 className="mt-4 text-base font-bold text-slate-900 group-hover:text-emerald-700">
                      {m.title}
                    </h3>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {m.category}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">{m.desc}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-emerald-600">
                    <span>Manage Settings</span>
                    <ExternalLink className="h-3.5 w-3.5 transition transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
