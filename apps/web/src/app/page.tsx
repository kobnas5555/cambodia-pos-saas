'use client';

import { ArrowRight, Building2, CheckCircle2, Globe2, ShieldCheck, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';

export default function HomePage() {
  const { t } = useI18n();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/70 via-white to-slate-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-bold text-slate-900">{t.app.name}</p>
            <p className="text-xs text-slate-500">Multi-Tenant Cloud POS</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {t.nav.dashboard}
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t.auth.signIn}
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {t.auth.registerLink}
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t.app.phaseBadge}
          </span>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            {t.app.name}
          </h1>
          <p className="mt-4 text-base text-slate-600 sm:text-lg">{t.app.tagline}</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={user ? '/dashboard' : '/register'}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              {user ? t.nav.dashboard : t.auth.createBusiness}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {!user && (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t.auth.signIn}
              </Link>
            )}
          </div>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-900">
              Multi-Tenant Isolation
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Every shop receives an isolated PostgreSQL tenant workspace with role-based permissions and audit logs.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Building2 className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-900">
              Multi-Branch Ready
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Manage Phnom Penh, Siem Reap, or provincial branches from one account with distinct branch codes.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Globe2 className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-900">
              USD / KHR &amp; Khmer Unicode
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Built for Cambodian retail with exact decimal currency handling ($1 = 4,100 ៛) and bilingual Khmer/English UI.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

