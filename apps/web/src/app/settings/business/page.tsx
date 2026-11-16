'use client';

import {
  BUSINESS_TYPES,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LANGUAGES,
  type BusinessType,
  type CurrencyCode,
  type LanguageCode,
} from '@cambodia-pos/shared';
import { Plus } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SettingsNav } from '@/components/SettingsNav';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

export default function BusinessSettingsPage() {
  const { activeTenant, refreshProfile, createAdditionalBusiness, hasPermission } = useAuth();
  const { t, setLang } = useI18n();
  const canUpdate = hasPermission('tenant.update');

  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('RETAIL');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>('USD');
  const [defaultLanguage, setDefaultLanguage] = useState<LanguageCode>('en');
  const [timezone, setTimezone] = useState('Asia/Phnom_Penh');

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Additional Business Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newBizName, setNewBizName] = useState('');
  const [newBizType, setNewBizType] = useState<BusinessType>('RETAIL');
  const [newBizBranchName, setNewBizBranchName] = useState('Main Branch');
  const [newBizBranchCode, setNewBizBranchCode] = useState('MAIN');
  const [newBizCurrency, setNewBizCurrency] = useState<CurrencyCode>('USD');
  const [newBizLanguage, setNewBizLanguage] = useState<LanguageCode>('en');
  const [creatingBiz, setCreatingBiz] = useState(false);

  useEffect(() => {
    if (activeTenant) {
      setName(activeTenant.name);
      setBusinessType((activeTenant.businessType as BusinessType) || 'RETAIL');
      setEmail(activeTenant.email ?? '');
      setPhone(activeTenant.phone ?? '');
      setAddress(activeTenant.address ?? '');
      setLogoUrl(activeTenant.logoUrl ?? '');
      setDefaultCurrency(activeTenant.defaultCurrency);
      setDefaultLanguage(activeTenant.defaultLanguage);
      setTimezone(activeTenant.timezone);
    }
  }, [activeTenant]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setError(null);
    setSaving(true);
    try {
      await apiRequest('/tenants/current', {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          businessType,
          email: email || null,
          phone: phone || null,
          address: address || null,
          logoUrl: logoUrl.trim() || null,
          defaultCurrency,
          defaultLanguage,
          timezone,
        }),
      });
      setLang(defaultLanguage);
      await refreshProfile();
      setFeedback(t.business.saved);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save business profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNewBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingBiz(true);
    setError(null);
    try {
      await createAdditionalBusiness({
        businessName: newBizName,
        businessType: newBizType,
        defaultCurrency: newBizCurrency,
        defaultLanguage: newBizLanguage,
        mainBranchName: newBizBranchName,
        mainBranchCode: newBizBranchCode,
      });
      setLang(newBizLanguage);
      setShowNewModal(false);
      setNewBizName('');
      setNewBizType('RETAIL');
      setNewBizBranchName('Main Branch');
      setNewBizBranchCode('MAIN');
      setNewBizCurrency('USD');
      setNewBizLanguage('en');
      setFeedback('New business workspace created and selected.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create business');
    } finally {
      setCreatingBiz(false);
    }
  };

  return (
    <AppShell>
      <div className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
        <SettingsNav activeKey="business" />
      </div>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.business.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{t.business.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-white px-3.5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            <Plus className="h-4 w-4" />
            {t.business.newBusinessBtn}
          </button>
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

        <form
          onSubmit={handleSave}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t.business.name}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t.business.slug}
              </label>
              <input
                type="text"
                disabled
                value={activeTenant?.slug ?? ''}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t.business.type}
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as BusinessType)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                {BUSINESS_TYPES.map((bt) => (
                  <option key={bt} value={bt}>
                    {bt.replace('_', ' / ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t.business.timezone}
              </label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t.business.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t.business.phone}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t.auth.defaultCurrency}
              </label>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value as CurrencyCode)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                {SUPPORTED_CURRENCIES.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t.auth.defaultLanguage}
              </label>
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value as LanguageCode)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l === 'km' ? 'ខ្មែរ (KM)' : 'English (EN)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">
                Business Logo URL (Optional)
              </label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
                {logoUrl && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Image shown on thermal printed receipts, HTML downloads, and reports.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">
                {t.business.address}
              </label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {canUpdate && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? t.common.saving : t.common.save}
              </button>
            </div>
          )}
        </form>

        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-lg font-bold text-slate-900">{t.business.newBusinessTitle}</h2>
              <form onSubmit={handleCreateNewBusiness} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {t.auth.businessName}
                  </label>
                  <input
                    type="text"
                    required
                    value={newBizName}
                    onChange={(e) => setNewBizName(e.target.value)}
                    placeholder="ABC Coffee Shop"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {t.auth.businessType}
                  </label>
                  <select
                    value={newBizType}
                    onChange={(e) => setNewBizType(e.target.value as BusinessType)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {BUSINESS_TYPES.map((bt) => (
                      <option key={bt} value={bt}>
                        {bt.replace('_', ' / ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      {t.auth.mainBranchName}
                    </label>
                    <input
                      type="text"
                      required
                      value={newBizBranchName}
                      onChange={(e) => setNewBizBranchName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      {t.auth.mainBranchCode}
                    </label>
                    <input
                      type="text"
                      required
                      value={newBizBranchCode}
                      onChange={(e) => setNewBizBranchCode(e.target.value.toUpperCase())}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      {t.auth.defaultCurrency}
                    </label>
                    <select
                      value={newBizCurrency}
                      onChange={(e) => setNewBizCurrency(e.target.value as CurrencyCode)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {SUPPORTED_CURRENCIES.map((cur) => (
                        <option key={cur} value={cur}>
                          {cur}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      {t.auth.defaultLanguage}
                    </label>
                    <select
                      value={newBizLanguage}
                      onChange={(e) => setNewBizLanguage(e.target.value as LanguageCode)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {l === 'km' ? 'ខ្មែរ (KM)' : 'English (EN)'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={creatingBiz}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {t.common.create}
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

