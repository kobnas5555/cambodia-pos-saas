'use client';

import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { ApiClientError } from '@/lib/api';

export default function LoginPage() {
  const { user, login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
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
          <h1 className="text-xl font-bold text-slate-900">{t.auth.loginTitle}</h1>
          <p className="mt-1 text-sm text-slate-600">{t.auth.loginSubtitle}</p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="email">
                {t.auth.email}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@bayv.com.kh"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700" htmlFor="password">
                  {t.auth.password}
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                >
                  {t.auth.forgotLink}
                </Link>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? t.auth.signingIn : t.auth.signIn}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            {t.auth.noAccount}{' '}
            <Link href="/register" className="font-semibold text-emerald-600 hover:text-emerald-700">
              {t.auth.registerLink}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

