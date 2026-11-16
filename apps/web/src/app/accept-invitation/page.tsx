'use client';

import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

export default function AcceptInvitationPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [acceptedTenant, setAcceptedTenant] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tokenParam = params.get('token');
      if (tokenParam) {
        setToken(tokenParam);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ tenantName: string; email: string }>(
        '/auth/accept-invitation',
        {
          method: 'POST',
          body: JSON.stringify({
            token,
            name: name.trim() || undefined,
            phone: phone.trim() || undefined,
            password: password || undefined,
          }),
          skipAuth: true,
        },
      );
      setAcceptedTenant(res.tenantName);
      setTimeout(() => router.push('/login'), 1500);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to accept invitation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-md">
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
          <h1 className="text-xl font-bold text-slate-900">{t.auth.acceptInviteTitle}</h1>
          <p className="mt-1 text-sm text-slate-600">{t.auth.acceptInviteSubtitle}</p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {acceptedTenant && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
              Joined <strong>{acceptedTenant}</strong>! Redirecting to login...
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="inviteToken">
                {t.auth.inviteToken}
              </label>
              <input
                id="inviteToken"
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="name">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dara Staff"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="phone">
                {t.auth.phone}
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+855 12 777 555"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="password">
                {t.auth.password}
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {t.auth.acceptInviteBtn}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
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

