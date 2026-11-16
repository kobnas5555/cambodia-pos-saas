'use client';

import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import React, { useState } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setDevToken(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string; devResetToken?: string }>(
        '/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email }),
          skipAuth: true,
        },
      );
      setMessage(res.message);
      if (res.devResetToken) {
        setDevToken(res.devResetToken);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Request failed');
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
          <h1 className="text-xl font-bold text-slate-900">{t.auth.forgotTitle}</h1>
          <p className="mt-1 text-sm text-slate-600">{t.auth.forgotSubtitle}</p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
              <p>{message}</p>
              {devToken && (
                <div className="mt-3 rounded-md bg-white p-2.5 text-xs">
                  <p className="font-semibold text-slate-700">Dev Reset Token:</p>
                  <code className="mt-1 block break-all text-emerald-700">{devToken}</code>
                  <Link
                    href={`/reset-password?token=${encodeURIComponent(devToken)}`}
                    className="mt-2 inline-block font-semibold text-emerald-700 underline"
                  >
                    Continue to Reset Password →
                  </Link>
                </div>
              )}
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
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {t.auth.sendReset}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            <Link href="/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
              {t.auth.loginLink}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

