'use client';

import {
  BUSINESS_TYPES,
  slugifyBusinessName,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LANGUAGES,
  type BusinessType,
  type CurrencyCode,
  type LanguageCode,
} from '@cambodia-pos/shared';
import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { ApiClientError } from '@/lib/api';

export default function RegisterPage() {
  const { user, registerBusiness } = useAuth();
  const { t, setLang } = useI18n();
  const router = useRouter();

  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessSlug, setBusinessSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [businessType, setBusinessType] = useState<BusinessType>('RETAIL');
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>('USD');
  const [defaultLanguage, setDefaultLanguage] = useState<LanguageCode>('en');
  const [mainBranchName, setMainBranchName] = useState('Phnom Penh Main');
  const [mainBranchCode, setMainBranchCode] = useState('PP-01');
  const [branchAddress, setBranchAddress] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const handleBusinessNameChange = (value: string) => {
    setBusinessName(value);
    if (!slugEdited) {
      setBusinessSlug(slugifyBusinessName(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerBusiness({
        ownerName,
        email,
        phone,
        password,
        businessName,
        businessSlug: businessSlug || undefined,
        businessType,
        defaultCurrency,
        defaultLanguage,
        mainBranchName,
        mainBranchCode,
        branchAddress: branchAddress || undefined,
      });
      setLang(defaultLanguage);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to reach server. Please ensure the API is running.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <span className="text-base font-bold text-slate-900">{t.app.name}</span>
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">{t.auth.registerTitle}</h1>
          <p className="mt-1 text-sm text-slate-600">{t.auth.registerSubtitle}</p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  {t.auth.fullName}
                </label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Sokha Chan"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">{t.auth.phone}</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+855 12 345 678"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">{t.auth.email}</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@business.com.kh"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  {t.auth.password}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 chars, letters + numbers"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {t.auth.businessName}
                  </label>
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => handleBusinessNameChange(e.target.value)}
                    placeholder="BayV Accessories"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {t.auth.businessSlug}
                  </label>
                  <input
                    type="text"
                    required
                    value={businessSlug}
                    onChange={(e) => {
                      setSlugEdited(true);
                      setBusinessSlug(e.target.value.toLowerCase());
                    }}
                    placeholder="bayv-accessories"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {t.auth.businessType}
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

                <div className="grid grid-cols-2 gap-3">
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
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {t.auth.mainBranchName}
                  </label>
                  <input
                    type="text"
                    required
                    value={mainBranchName}
                    onChange={(e) => setMainBranchName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {t.auth.mainBranchCode}
                  </label>
                  <input
                    type="text"
                    required
                    value={mainBranchCode}
                    onChange={(e) => setMainBranchCode(e.target.value.toUpperCase())}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">
                    {t.auth.branchAddress}
                  </label>
                  <input
                    type="text"
                    value={branchAddress}
                    onChange={(e) => setBranchAddress(e.target.value)}
                    placeholder="Street 271, Sangkat Boeung Tompun, Phnom Penh"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? t.auth.creatingBusiness : t.auth.createBusiness}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            {t.auth.haveAccount}{' '}
            <Link href="/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
              {t.auth.loginLink}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

