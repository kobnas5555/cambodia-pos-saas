'use client';

import {
  DEFAULT_SYSTEM_SETTINGS,
  DEFAULT_USER_PREFERENCES,
  formatCurrency,
  type PaperSize,
  type SystemSettingsMap,
  type UserPreferences,
} from '@cambodia-pos/shared';
import {
  ArrowLeftRight,
  Calculator,
  Check,
  CheckCircle2,
  Copy,
  DollarSign,
  FileText,
  Hash,
  Percent,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  User,
  Volume2,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SettingsNav } from '@/components/SettingsNav';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';
import { downloadOrderReceiptHtml, type PrintableReceiptOrder } from '@/lib/receipt';

interface ExchangeRateRow {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  effectiveAt: string;
}

export interface ExtendedSystemSettings extends SystemSettingsMap {
  returnPolicy: string;
  wifiDetails: string;
  socialLink: string;
  fontSize: 'small' | 'medium' | 'large';
  showBarcode: boolean;
  showCategory: boolean;
  showSavings: boolean;
}

const DEFAULT_EXTENDED_SETTINGS: ExtendedSystemSettings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  returnPolicy: 'ទំនិញទិញរួចមិនអាចដូរយកប្រាក់វិញបានទេ / Goods sold are exchangeable within 7 days with valid receipt.',
  wifiDetails: 'WiFi: StoreGuest / Pass: cambodia2026',
  socialLink: 't.me/cambodiapos',
  fontSize: 'medium',
  showBarcode: true,
  showCategory: true,
  showSavings: true,
};

type SettingsTab = 'tax' | 'receipt' | 'numbering' | 'exchange' | 'preferences' | 'records';

interface SettingDbRecord {
  id: string;
  tenantId: string;
  branchId: string | null;
  settingKey: string;
  settingValue: unknown;
  createdAt: string;
  updatedAt: string;
}

export default function SystemSettingsPage() {
  const { activeTenant, refreshProfile, hasPermission } = useAuth();
  const { t, setLang } = useI18n();
  const canUpdate = hasPermission('tenant.update');

  const [activeTab, setActiveTab] = useState<SettingsTab>('tax');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // System Settings State
  const [settings, setSettings] = useState<ExtendedSystemSettings>(DEFAULT_EXTENDED_SETTINGS);
  const [rates, setRates] = useState<ExchangeRateRow[]>([]);
  const [newUsdKhrRate, setNewUsdKhrRate] = useState('4100');

  // User Preferences State
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Quick Currency Calculator State
  const [calcUsd, setCalcUsd] = useState('10');
  const [calcKhr, setCalcKhr] = useState('41000');

  // Database Setting Records State
  const [dbRecords, setDbRecords] = useState<SettingDbRecord[]>([]);
  const [dbRecordsLoading, setDbRecordsLoading] = useState(false);
  const [recordSearch, setRecordSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // URL Sync for Tab Navigation
  useEffect(() => {
    function syncTabFromUrl() {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get('tab') as SettingsTab | null;
        if (tabParam && ['tax', 'receipt', 'numbering', 'exchange', 'preferences', 'records'].includes(tabParam)) {
          setActiveTab(tabParam);
        }
      }
    }
    syncTabFromUrl();
    window.addEventListener('popstate', syncTabFromUrl);
    return () => window.removeEventListener('popstate', syncTabFromUrl);
  }, []);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const activeRateNumber = useMemo(() => {
    const r = rates[0]?.rate ? Number(rates[0].rate) : 4100;
    return Number.isFinite(r) && r > 0 ? r : 4100;
  }, [rates]);

  // Recalculate calculator preview
  const handleCalcUsdChange = (val: string) => {
    setCalcUsd(val);
    const num = Number(val);
    if (!Number.isNaN(num)) {
      setCalcKhr(Math.round(num * activeRateNumber).toString());
    }
  };

  const handleCalcKhrChange = (val: string) => {
    setCalcKhr(val);
    const num = Number(val);
    if (!Number.isNaN(num)) {
      setCalcUsd((num / activeRateNumber).toFixed(2));
    }
  };

  const loadAll = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const [sysRes, prefRes] = await Promise.all([
        apiRequest<{
          settings: Record<string, unknown>;
          exchangeRates: ExchangeRateRow[];
        }>('/settings'),
        apiRequest<UserPreferences>('/settings/user-preferences').catch(() => DEFAULT_USER_PREFERENCES),
      ]);

      const raw = sysRes.settings;
      setSettings({
        taxEnabled: Boolean(raw.taxEnabled),
        taxRatePercent: String(raw.taxRatePercent ?? '0'),
        taxIdentificationNumber: String(raw.taxIdentificationNumber ?? ''),
        taxInclusive: Boolean(raw.taxInclusive),

        receiptHeader: String(raw.receiptHeader ?? ''),
        receiptFooter: String(raw.receiptFooter ?? DEFAULT_SYSTEM_SETTINGS.receiptFooter),
        returnPolicy: String(raw.returnPolicy ?? DEFAULT_EXTENDED_SETTINGS.returnPolicy),
        wifiDetails: String(raw.wifiDetails ?? DEFAULT_EXTENDED_SETTINGS.wifiDetails),
        socialLink: String(raw.socialLink ?? DEFAULT_EXTENDED_SETTINGS.socialLink),
        fontSize: (raw.fontSize as 'small' | 'medium' | 'large') || 'medium',
        showLogo: raw.showLogo !== false,
        showTaxDetails: raw.showTaxDetails !== false,
        showCashierName: raw.showCashierName !== false,
        showCustomerInfo: raw.showCustomerInfo !== false,
        showBarcode: raw.showBarcode !== false,
        showCategory: Boolean(raw.showCategory ?? true),
        showSavings: raw.showSavings !== false,
        paperSize: (raw.paperSize as PaperSize) || '80mm',

        orderPrefix: String(raw.orderPrefix ?? 'ORD'),
        purchasePrefix: String(raw.purchasePrefix ?? 'PUR'),
        returnPrefix: String(raw.returnPrefix ?? 'RET'),
        adjustmentPrefix: String(raw.adjustmentPrefix ?? 'ADJ'),
        expensePrefix: String(raw.expensePrefix ?? 'EXP'),
        incomePrefix: String(raw.incomePrefix ?? 'INC'),
        shiftPrefix: String(raw.shiftPrefix ?? 'SFT'),
      });

      setRates(sysRes.exchangeRates);
      if (sysRes.exchangeRates[0]) {
        setNewUsdKhrRate(sysRes.exchangeRates[0].rate);
      }

      setPreferences(prefRes);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load system settings');
    } finally {
      setLoading(false);
    }
  }, [activeTenant]);

  const loadDbRecords = useCallback(async () => {
    if (!activeTenant) return;
    setDbRecordsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; data: SettingDbRecord[] }>('/settings/records');
      setDbRecords(res.data || []);
    } catch {
      // ignore
    } finally {
      setDbRecordsLoading(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (activeTab === 'records') {
      void loadDbRecords();
    }
  }, [activeTab, loadDbRecords]);

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setFeedback(null);
    setSaving(true);
    try {
      await apiRequest('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          settings,
        }),
      });
      setFeedback('System configuration updated successfully.');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save system settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSaving(true);
    try {
      await apiRequest('/settings/exchange-rates', {
        method: 'POST',
        body: JSON.stringify({
          baseCurrency: 'USD',
          targetCurrency: 'KHR',
          rate: newUsdKhrRate,
        }),
      });
      setFeedback(`New official exchange rate (1 USD = ${Number(newUsdKhrRate).toLocaleString()} KHR) published.`);
      await refreshProfile();
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update exchange rate');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUserPreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSavingPrefs(true);
    try {
      const updated = await apiRequest<UserPreferences>('/settings/user-preferences', {
        method: 'PUT',
        body: JSON.stringify(preferences),
      });
      setPreferences(updated);
      setLang(updated.language);
      setFeedback('Your personal preferences have been saved.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save user preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  // Sample document preview helpers
  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }, []);

  return (
    <AppShell>
      <div className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
        <SettingsNav />
      </div>

      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.nav.systemSettings}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Tax rules, thermal receipt customizer, document numbering prefixes, currency exchange rates, and personal user preferences.
            </p>
          </div>
          {loading && <span className="text-xs text-slate-400">Loading settings...</span>}
        </div>

        {feedback && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{feedback}</span>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {[
            { key: 'tax', label: 'Tax Configuration', icon: Percent },
            { key: 'receipt', label: 'Receipt & Printing', icon: Receipt },
            { key: 'numbering', label: 'Numbering Formats', icon: Hash },
            { key: 'exchange', label: 'Exchange Rates & Currency', icon: ArrowLeftRight },
            { key: 'preferences', label: 'User Preferences', icon: User },
            { key: 'records', label: 'Settings Records (DB)', icon: Sliders },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleTabChange(item.key as SettingsTab)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold sm:text-sm ${
                  active ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* 1. TAX CONFIGURATION TAB */}
        {activeTab === 'tax' && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Tax &amp; VAT Settings</h2>
                    <p className="text-xs text-slate-500">
                      Configure default tax rates and tax identification numbers for invoices and POS sales.
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.taxEnabled}
                      onChange={(e) => setSettings({ ...settings, taxEnabled: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-semibold text-slate-700">Enable Tax</span>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Default Tax Rate (%)
                    </label>
                    <div className="relative mt-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={settings.taxRatePercent}
                        onChange={(e) => setSettings({ ...settings, taxRatePercent: e.target.value })}
                        disabled={!settings.taxEnabled}
                        placeholder="10.00"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-8 text-sm disabled:bg-slate-100"
                      />
                      <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-slate-400">
                        %
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Standard Cambodia VAT is 10%. Applied automatically on cart subtotal in POS.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Tax ID / VATTIN Number
                    </label>
                    <input
                      type="text"
                      value={settings.taxIdentificationNumber}
                      onChange={(e) => setSettings({ ...settings, taxIdentificationNumber: e.target.value })}
                      placeholder="e.g. K001-902103456"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Official General Department of Taxation (GDT) registration number printed on receipts.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="inline-flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={settings.taxInclusive}
                      onChange={(e) => setSettings({ ...settings, taxInclusive: e.target.checked })}
                      disabled={!settings.taxEnabled}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-800">
                        Tax Inclusive Pricing (Prices include VAT)
                      </span>
                      <p className="text-xs text-slate-500">
                        When enabled, catalogue prices already include VAT. The tax breakdown will be calculated backwards on receipts.
                      </p>
                    </div>
                  </label>
                </div>

                {canUpdate && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? 'Saving...' : 'Save Tax Settings'}
                    </button>
                  </div>
                )}
              </div>

              {/* Tax Calculation Explainer */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                  <Percent className="h-4 w-4 text-emerald-700" />
                  Cambodia Tax Guide
                </h3>
                <ul className="mt-3 space-y-2 text-xs leading-relaxed text-emerald-800">
                  <li>
                    <strong>Standard VAT:</strong> General supply of taxable goods and services is taxed at 10%.
                  </li>
                  <li>
                    <strong>Zero-rated (0%):</strong> Goods exported outside Cambodia and international transportation services.
                  </li>
                  <li>
                    <strong>Tax Exemption:</strong> Small taxpayers under the self-assessment regime below official turnover thresholds may configure 0%.
                  </li>
                  <li>
                    <strong>POS Override:</strong> Cashiers can apply tax exemptions on specific walk-in orders when required.
                  </li>
                </ul>
              </div>
            </div>
          </form>
        )}

        {/* 2. RECEIPT & PRINTING TAB */}
        {activeTab === 'receipt' && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-12">
              {/* Receipt Options Form */}
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-7">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">Receipt Layout &amp; Content</h2>
                  <p className="text-xs text-slate-500">
                    Customize headers, footers, customer details, WiFi access, return policies, and paper size for thermal printers.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Thermal Paper Size</label>
                    <select
                      value={settings.paperSize}
                      onChange={(e) => setSettings({ ...settings, paperSize: e.target.value as PaperSize })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="80mm">80mm (Standard POS Roll)</option>
                      <option value="58mm">58mm (Compact Mobile / Bluetooth Roll)</option>
                      <option value="A4">A4 (Standard Invoice Sheet)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Typography / Font Scale</label>
                    <select
                      value={settings.fontSize}
                      onChange={(e) =>
                        setSettings({ ...settings, fontSize: e.target.value as 'small' | 'medium' | 'large' })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="small">Small (High Data Density)</option>
                      <option value="medium">Medium (Standard Thermal)</option>
                      <option value="large">Large (High Readability)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Receipt Header / Greeting</label>
                  <input
                    type="text"
                    value={settings.receiptHeader}
                    onChange={(e) => setSettings({ ...settings, receiptHeader: e.target.value })}
                    placeholder="Welcome to our store! / សូមស្វាគមន៍!"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Displays right below the store name at the top of the receipt.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Receipt Footer / Thank You Note</label>
                  <input
                    type="text"
                    value={settings.receiptFooter}
                    onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
                    placeholder="Thank you for your business! / សូមអរគុណ!"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Return &amp; Exchange Policy</label>
                  <textarea
                    rows={2}
                    value={settings.returnPolicy}
                    onChange={(e) => setSettings({ ...settings, returnPolicy: e.target.value })}
                    placeholder="Goods sold are exchangeable within 7 days with valid receipt."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Customer WiFi Access</label>
                    <input
                      type="text"
                      value={settings.wifiDetails}
                      onChange={(e) => setSettings({ ...settings, wifiDetails: e.target.value })}
                      placeholder="WiFi: StoreGuest / Pass: pos2026"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Social Channel / Telegram</label>
                    <input
                      type="text"
                      value={settings.socialLink}
                      onChange={(e) => setSettings({ ...settings, socialLink: e.target.value })}
                      placeholder="t.me/cambodiapos"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Display Elements
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.showLogo}
                        onChange={(e) => setSettings({ ...settings, showLogo: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      Show Business Logo
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.showTaxDetails}
                        onChange={(e) => setSettings({ ...settings, showTaxDetails: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      Show Tax Details &amp; VATTIN
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.showCashierName}
                        onChange={(e) => setSettings({ ...settings, showCashierName: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      Show Cashier Name
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.showCustomerInfo}
                        onChange={(e) => setSettings({ ...settings, showCustomerInfo: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      Show Customer Info &amp; Member
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.showBarcode}
                        onChange={(e) => setSettings({ ...settings, showBarcode: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      Show Barcode at Bottom
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.showCategory}
                        onChange={(e) => setSettings({ ...settings, showCategory: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      Show Item Categories
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.showSavings}
                        onChange={(e) => setSettings({ ...settings, showSavings: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      Show Customer Savings Banner
                    </label>
                  </div>
                </div>

                {canUpdate && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? 'Saving...' : 'Save Receipt Settings'}
                    </button>
                  </div>
                )}
              </div>

              {/* Live Interactive Receipt Preview */}
              <div className="space-y-3 lg:col-span-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Live Thermal Preview ({settings.paperSize})
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      const sampleOrder: PrintableReceiptOrder = {
                        orderNumber: `${settings.orderPrefix || 'ORD'}-${todayStr}-0001-A7X`,
                        subtotal: '8.50',
                        discountAmount: '0.50',
                        taxAmount: settings.taxEnabled
                          ? ((8.0 * Number(settings.taxRatePercent || 0)) / 100).toFixed(2)
                          : '0',
                        totalAmount: (
                          8.0 +
                          (settings.taxEnabled ? (8.0 * Number(settings.taxRatePercent || 0)) / 100 : 0)
                        ).toFixed(2),
                        paidAmount: '10.00',
                        changeAmount: (
                          10.0 -
                          (8.0 + (settings.taxEnabled ? (8.0 * Number(settings.taxRatePercent || 0)) / 100 : 0))
                        ).toFixed(2),
                        currencyCode: 'USD',
                        completedAt: new Date().toISOString(),
                        branch: {
                          name: activeTenant?.branches?.[0]?.name ?? 'Phnom Penh Main Branch',
                          phone: activeTenant?.branches?.[0]?.phone ?? '+855 23 888 999',
                          address: activeTenant?.branches?.[0]?.address ?? 'St. 214, Daun Penh, Phnom Penh',
                        },
                        customer: { name: 'Sokha Meng (VIP Member)' },
                        cashierEmployee: { name: 'Bopha Keo' },
                        orderItems: [
                          {
                            id: 'item-1',
                            productNameSnapshot: 'Iced Latte 500ml',
                            skuSnapshot: 'BEV-LAT-001',
                            quantity: '2',
                            unitPrice: '3.00',
                            lineTotal: '6.00',
                          },
                          {
                            id: 'item-2',
                            productNameSnapshot: 'Fresh Butter Croissant',
                            skuSnapshot: 'BAK-CRO-004',
                            quantity: '1',
                            unitPrice: '2.50',
                            lineTotal: '2.50',
                          },
                        ],
                        payments: [
                          {
                            id: 'pay-1',
                            paymentMethod: 'CASH',
                            amount: '10.00',
                            currencyCode: 'USD',
                            referenceNumber: null,
                          },
                        ],
                      };

                      downloadOrderReceiptHtml(sampleOrder, {
                        businessName: activeTenant?.name ?? 'Sample Store',
                        logoUrl: settings.showLogo ? activeTenant?.logoUrl : null,
                        receiptHeader: settings.receiptHeader,
                        receiptFooter: `${settings.receiptFooter || ''}\n${settings.returnPolicy || ''}\n${
                          settings.wifiDetails || ''
                        }`,
                        showLogo: settings.showLogo,
                        showTaxDetails: settings.showTaxDetails,
                        showCashierName: settings.showCashierName,
                        showCustomerInfo: settings.showCustomerInfo,
                        paperSize: settings.paperSize,
                        taxIdentificationNumber: settings.taxIdentificationNumber,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Printer className="h-3.5 w-3.5 text-slate-500" />
                    <span>Test Print</span>
                  </button>
                </div>

                <div
                  className={`mx-auto rounded-xl border border-slate-300 bg-white p-5 font-mono shadow-md ${
                    settings.paperSize === '58mm'
                      ? 'max-w-[270px]'
                      : settings.paperSize === 'A4'
                      ? 'max-w-[420px]'
                      : 'max-w-[340px]'
                  } ${
                    settings.fontSize === 'small'
                      ? 'text-[11px]'
                      : settings.fontSize === 'large'
                      ? 'text-sm'
                      : 'text-xs'
                  }`}
                >
                  <div className="text-center">
                    {settings.showLogo && activeTenant?.logoUrl && (
                      <div className="mb-2 flex justify-center">
                        <img
                          src={activeTenant.logoUrl}
                          alt="Store Logo"
                          className="max-h-10 max-w-[120px] object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    <p className="font-bold text-slate-900">{activeTenant?.name ?? 'Store Name'}</p>
                    {settings.receiptHeader && (
                      <p className="mt-0.5 font-sans text-emerald-700">{settings.receiptHeader}</p>
                    )}
                    <p className="text-[11px] text-slate-500">
                      Phnom Penh Main Branch · +855 12 345 678
                    </p>
                    {settings.showTaxDetails && settings.taxIdentificationNumber && (
                      <p className="text-[10px] text-slate-500">
                        VATTIN: <strong>{settings.taxIdentificationNumber}</strong>
                      </p>
                    )}
                    <p className="mt-2 font-bold text-slate-800">
                      {settings.orderPrefix}-{todayStr}-0001-A7X
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {new Date().toLocaleString()}
                      {settings.showCashierName ? ' · Cashier: Sokha Chan' : ''}
                    </p>
                    {settings.showCustomerInfo && (
                      <p className="text-[10px] text-slate-400">Customer: Walk-in (VIP Member)</p>
                    )}
                  </div>

                  <div className="my-3 border-y border-dashed border-slate-300 py-2">
                    <div className="flex justify-between py-0.5">
                      <span>
                        Iced Latte 500ml × 2
                        {settings.showCategory && (
                          <span className="ml-1 text-[10px] text-slate-400 font-sans">[Beverage]</span>
                        )}
                      </span>
                      <span className="font-semibold">$6.00</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span>
                        Croissant Butter × 1
                        {settings.showCategory && (
                          <span className="ml-1 text-[10px] text-slate-400 font-sans">[Bakery]</span>
                        )}
                      </span>
                      <span className="font-semibold">$2.50</span>
                    </div>
                  </div>

                  <div className="space-y-1 text-slate-600">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>$8.50</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span>Discount</span>
                      <span>-$0.50</span>
                    </div>
                    {settings.showSavings && (
                      <div className="rounded bg-emerald-50 px-1.5 py-0.5 text-center text-[10px] font-bold text-emerald-700">
                        You saved $0.50 on this order!
                      </div>
                    )}
                    {settings.taxEnabled && (
                      <div className="flex justify-between">
                        <span>Tax ({settings.taxRatePercent}%)</span>
                        <span>
                          ${((8.0 * Number(settings.taxRatePercent || 0)) / 100).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-bold text-slate-900">
                      <span>TOTAL</span>
                      <span>
                        $
                        {(
                          8.0 +
                          (settings.taxEnabled
                            ? (8.0 * Number(settings.taxRatePercent || 0)) / 100
                            : 0)
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>KHR Equivalent (4,100 ៛)</span>
                      <span>
                        {(
                          (8.0 +
                            (settings.taxEnabled
                              ? (8.0 * Number(settings.taxRatePercent || 0)) / 100
                              : 0)) *
                          4100
                        ).toLocaleString()}{' '}
                        ៛
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Paid (CASH)</span>
                      <span>$10.00</span>
                    </div>
                    <div className="flex justify-between font-semibold text-emerald-700">
                      <span>Change Due</span>
                      <span>
                        $
                        {(
                          10.0 -
                          (8.0 +
                            (settings.taxEnabled
                              ? (8.0 * Number(settings.taxRatePercent || 0)) / 100
                              : 0))
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {settings.wifiDetails && (
                    <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-center text-[10px] text-slate-600 font-sans">
                      {settings.wifiDetails}
                    </div>
                  )}

                  {settings.socialLink && (
                    <div className="mt-1 text-center text-[10px] text-slate-500 font-sans">
                      Follow us: {settings.socialLink}
                    </div>
                  )}

                  {settings.returnPolicy && (
                    <div className="mt-2 text-center text-[10px] text-slate-500 font-sans italic">
                      {settings.returnPolicy}
                    </div>
                  )}

                  {settings.receiptFooter && (
                    <div className="mt-2 border-t border-dashed border-slate-300 pt-1.5 text-center text-[10px] text-slate-500 whitespace-pre-line font-sans">
                      {settings.receiptFooter}
                    </div>
                  )}

                  {settings.showBarcode && (
                    <div className="mt-3 flex flex-col items-center justify-center border-t border-slate-100 pt-2">
                      <div className="flex h-8 items-center gap-[2px]">
                        {[4, 2, 6, 2, 4, 8, 2, 6, 4, 2, 8, 4, 6, 2, 4, 8, 2, 6, 4, 2, 8, 4].map(
                          (w, idx) => (
                            <div
                              key={idx}
                              style={{ width: `${w}px` }}
                              className="h-full bg-slate-900"
                            />
                          ),
                        )}
                      </div>
                      <span className="mt-1 text-[9px] text-slate-400">
                        {settings.orderPrefix}-{todayStr}-0001
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </form>
        )}

        {/* 3. NUMBERING FORMATS TAB */}
        {activeTab === 'numbering' && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Document Numbering Prefixes</h2>
                <p className="text-xs text-slate-500">
                  Define customized document prefixes for sales, returns, purchases, adjustments, expenses, incomes, and cashier shifts.
                </p>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    key: 'orderPrefix',
                    label: 'Sales Orders / Invoices',
                    defaultVal: 'ORD',
                    example: `${settings.orderPrefix || 'ORD'}-${todayStr}-0001-A7X`,
                  },
                  {
                    key: 'purchasePrefix',
                    label: 'Purchase Orders',
                    defaultVal: 'PUR',
                    example: `${settings.purchasePrefix || 'PUR'}-${todayStr}-0001-B9K`,
                  },
                  {
                    key: 'returnPrefix',
                    label: 'Sales Returns',
                    defaultVal: 'RET',
                    example: `${settings.returnPrefix || 'RET'}-${todayStr}-0001-C2M`,
                  },
                  {
                    key: 'adjustmentPrefix',
                    label: 'Stock Adjustments',
                    defaultVal: 'ADJ',
                    example: `${settings.adjustmentPrefix || 'ADJ'}-${todayStr}-0001-D4P`,
                  },
                  {
                    key: 'expensePrefix',
                    label: 'Expense Vouchers',
                    defaultVal: 'EXP',
                    example: `${settings.expensePrefix || 'EXP'}-${todayStr}-0001-E8W`,
                  },
                  {
                    key: 'incomePrefix',
                    label: 'Income Receipts',
                    defaultVal: 'INC',
                    example: `${settings.incomePrefix || 'INC'}-${todayStr}-0001-F3L`,
                  },
                  {
                    key: 'shiftPrefix',
                    label: 'Cashier Shifts',
                    defaultVal: 'SFT',
                    example: `${settings.shiftPrefix || 'SFT'}-${todayStr}-0001-G6Q`,
                  },
                ].map((item) => (
                  <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <label className="block text-xs font-semibold text-slate-700">{item.label}</label>
                    <input
                      type="text"
                      maxLength={10}
                      value={String(settings[item.key as keyof SystemSettingsMap] ?? item.defaultVal)}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          [item.key]: e.target.value.toUpperCase().trim(),
                        })
                      }
                      placeholder={item.defaultVal}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm uppercase"
                    />
                    <div className="mt-2">
                      <p className="text-[10px] text-slate-400">Sample Generated Number:</p>
                      <p className="font-mono text-xs font-bold text-slate-800">{item.example}</p>
                    </div>
                  </div>
                ))}
              </div>

              {canUpdate && (
                <div className="mt-6 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save Numbering Formats'}
                  </button>
                </div>
              )}
            </div>
          </form>
        )}

        {/* 4. EXCHANGE RATES TAB */}
        {activeTab === 'exchange' && (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              {/* Rate Publisher */}
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">Publish USD / KHR Exchange Rate</h2>
                  <p className="text-xs text-slate-500">
                    The active exchange rate applies automatically across POS dual pricing, payments, inventory valuation, and reports.
                  </p>
                </div>

                <form onSubmit={handleAddRate} className="space-y-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-semibold text-slate-700">
                        1 US Dollar (USD) equals:
                      </label>
                      <div className="relative mt-1">
                        <input
                          type="number"
                          step="0.000001"
                          required
                          value={newUsdKhrRate}
                          onChange={(e) => setNewUsdKhrRate(e.target.value)}
                          placeholder="4100"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-12 text-sm font-semibold text-slate-900"
                        />
                        <span className="pointer-events-none absolute right-3 top-2 text-xs font-bold text-slate-500">
                          KHR (៛)
                        </span>
                      </div>
                    </div>

                    {canUpdate && (
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        Publish Rate
                      </button>
                    )}
                  </div>
                </form>

                {/* Quick Currency Converter Sandbox */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <Calculator className="h-4 w-4 text-emerald-600" />
                    Quick Conversion Calculator (At Active Rate: {activeRateNumber.toLocaleString()} ៛)
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500">USD Amount ($)</label>
                      <input
                        type="number"
                        value={calcUsd}
                        onChange={(e) => handleCalcUsdChange(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500">KHR Amount (៛)</label>
                      <input
                        type="number"
                        value={calcKhr}
                        onChange={(e) => handleCalcKhrChange(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-emerald-700"
                      />
                    </div>
                  </div>
                </div>

                {/* Rate History */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Recent Exchange Rate History
                  </h3>
                  <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {rates.length === 0 ? (
                      <p className="p-4 text-center text-xs text-slate-400">No rates published yet.</p>
                    ) : (
                      rates.map((r, i) => (
                        <div key={r.id} className="flex items-center justify-between p-3 text-xs">
                          <div>
                            <span className="font-semibold text-slate-800">
                              1 {r.baseCurrency} = {Number(r.rate).toLocaleString()} {r.targetCurrency}
                            </span>
                            {i === 0 && (
                              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                Active Rate
                              </span>
                            )}
                          </div>
                          <span className="text-slate-400">{new Date(r.effectiveAt).toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* NBC Cambodia Rate Info */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900">National Bank of Cambodia (NBC)</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  In Cambodia, businesses typically reference the National Bank of Cambodia daily official exchange rate (around 4,080 – 4,120 KHR per USD).
                </p>
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
                  <strong>Important:</strong> Changing this rate will immediately update currency conversions for all upcoming POS orders, purchase costs, inventory valuations, and financial summaries.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. USER PREFERENCES TAB */}
        {activeTab === 'preferences' && (
          <form onSubmit={handleSaveUserPreferences} className="space-y-6">
            <div className="max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Personal User Preferences</h2>
                <p className="text-xs text-slate-500">
                  These settings apply specifically to your login account and current workstation.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Preferred Language</label>
                  <select
                    value={preferences.language}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        language: e.target.value as 'en' | 'km',
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="en">English (EN)</option>
                    <option value="km">ភាសាខ្មែរ (KM)</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Switch UI language for navigation, tables, and buttons.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Display Theme</label>
                  <select
                    value={preferences.theme}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        theme: e.target.value as 'light' | 'dark' | 'system',
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="light">Light Theme</option>
                    <option value="dark">Dark Theme (Preview)</option>
                    <option value="system">Follow System</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Default Workstation Branch</label>
                  <select
                    value={preferences.defaultBranchId ?? ''}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        defaultBranchId: e.target.value || null,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Auto-select Main Branch</option>
                    {activeTenant?.branches?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.branchCode})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Branch automatically selected upon logging in.
                  </p>
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={preferences.posSoundEnabled}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        posSoundEnabled: e.target.checked,
                      })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-800">
                      POS Audio Sound Effects
                    </span>
                    <p className="text-xs text-slate-500">
                      Play audio confirmation beeps upon barcode scanning and checkout completion.
                    </p>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={preferences.autoPrintReceipt}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        autoPrintReceipt: e.target.checked,
                      })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-800">
                      Auto-Print Receipt on Sale Completion
                    </span>
                    <p className="text-xs text-slate-500">
                      Automatically prompt the browser printer dialog when a transaction completes.
                    </p>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={preferences.compactTables}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        compactTables: e.target.checked,
                      })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-800">
                      Compact Data Density Mode
                    </span>
                    <p className="text-xs text-slate-500">
                      Reduces table row padding in inventory, sales, and reports to fit more rows on screen.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingPrefs}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingPrefs ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 6. SETTINGS DB RECORDS TAB */}
        {activeTab === 'records' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-base font-bold text-slate-900">Database Settings Records</h2>
                <p className="text-xs text-slate-500">
                  Direct inspection of all persisted key-value setting entity rows in PostgreSQL (`settings` table).
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Filter by setting key..."
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={loadDbRecords}
                  disabled={dbRecordsLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RotateCcw className={`h-3.5 w-3.5 ${dbRecordsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Setting Key</th>
                      <th className="px-4 py-3">Setting Value</th>
                      <th className="px-4 py-3">Scope / Branch</th>
                      <th className="px-4 py-3">Setting ID</th>
                      <th className="px-4 py-3">Created / Updated At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                    {dbRecordsLoading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                          Loading setting records...
                        </td>
                      </tr>
                    ) : dbRecords.filter(
                        (r) =>
                          !recordSearch ||
                          r.settingKey.toLowerCase().includes(recordSearch.toLowerCase()) ||
                          JSON.stringify(r.settingValue).toLowerCase().includes(recordSearch.toLowerCase()),
                      ).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                          No matching database settings records found.
                        </td>
                      </tr>
                    ) : (
                      dbRecords
                        .filter(
                          (r) =>
                            !recordSearch ||
                            r.settingKey.toLowerCase().includes(recordSearch.toLowerCase()) ||
                            JSON.stringify(r.settingValue).toLowerCase().includes(recordSearch.toLowerCase()),
                        )
                        .map((rec) => (
                          <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-900 font-mono">
                              {rec.settingKey}
                            </td>
                            <td className="px-4 py-3 font-mono">
                              <span className="inline-block max-w-xs truncate rounded bg-slate-100 px-2 py-0.5 text-slate-800" title={typeof rec.settingValue === 'object' ? JSON.stringify(rec.settingValue, null, 2) : String(rec.settingValue)}>
                                {typeof rec.settingValue === 'object' ? JSON.stringify(rec.settingValue) : String(rec.settingValue)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {rec.branchId ? (
                                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-blue-700 border border-blue-200">
                                  Branch: {rec.branchId.slice(0, 8)}...
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                                  Global (Tenant)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono">
                              <button
                                type="button"
                                onClick={() => handleCopy(rec.id, rec.id)}
                                title="Copy Setting ID"
                                className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 hover:bg-slate-200 border border-slate-200"
                              >
                                {copiedId === rec.id ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" />
                                    <span className="text-emerald-700">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3 text-slate-500" />
                                    <span>#{rec.id.slice(0, 8)}</span>
                                  </>
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-[11px] whitespace-nowrap">
                              <div>Created: {new Date(rec.createdAt).toLocaleDateString()}</div>
                              <div>Updated: {new Date(rec.updatedAt).toLocaleDateString()}</div>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
