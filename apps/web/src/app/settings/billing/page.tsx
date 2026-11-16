'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../../components/AppShell';
import { api } from '../../../lib/api';
import { useI18n } from '../../../contexts/I18nContext';

interface SubscriptionData {
  subscription: {
    id: string;
    status: string;
    billingCycle: 'MONTHLY' | 'YEARLY';
    currentPeriodEnd: string;
    paymentMethod: string;
    plan: {
      id: string;
      tier: string;
      name: string;
      description: string;
      monthlyPrice: string;
      yearlyPrice: string;
      maxBranches: number;
      maxEmployees: number;
      maxProducts: number;
      features: string[];
    };
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      amount: string;
      currency: string;
      status: string;
      paidAt: string;
    }>;
  };
  usage: {
    branches: { current: number; limit: number };
    employees: { current: number; limit: number };
    products: { current: number; limit: number };
  };
}

export default function BillingPage() {
  const { t } = useI18n();
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadBillingInfo = async () => {
    setLoading(true);
    try {
      const [subRes, plansRes] = await Promise.all([
        api.get<any>('/billing/subscription').catch(() => null),
        api.get<any>('/billing/plans').catch(() => null),
      ]);

      if (subRes?.data) {
        setData(subRes.data);
        setBillingCycle(subRes.data.subscription?.billingCycle ?? 'MONTHLY');
      }
      if (plansRes?.data) {
        setPlans(plansRes.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBillingInfo();
  }, []);

  const handleChangePlan = async (tier: string) => {
    setUpdating(true);
    setFeedback(null);
    try {
      await api.post('/billing/subscription/change', {
        planTier: tier,
        billingCycle,
        paymentMethod: 'BAKONG_KHQR',
      });
      setFeedback({ type: 'success', message: `Successfully updated to ${tier} plan!` });
      loadBillingInfo();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.response?.data?.message || err.message || 'Failed to update plan' });
    } finally {
      setUpdating(false);
    }
  };

  const currentTier = data?.subscription?.plan?.tier ?? 'FREE_TRIAL';

  return (
    <AppShell>
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/settings/system" className="text-xs text-slate-400 hover:text-slate-200">
              ← Back to Settings
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {t.billing?.title ?? 'Subscription & Plans'}
          </h1>
          <p className="text-sm text-slate-400">
            {t.billing?.subtitle ?? 'Manage your SaaS subscription plan, branch/employee limits, and billing history.'}
          </p>
        </div>

        {feedback && (
          <div
            className={`p-4 rounded-xl text-sm font-medium border ${
              feedback.type === 'success'
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading subscription details...</div>
        ) : (
          <>
            {/* Current Plan Overview & Usage */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Active Plan Card */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-6 shadow-sm">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Active Subscription
                </div>
                <div className="text-2xl font-extrabold text-white mb-1">
                  {data?.subscription?.plan?.name ?? 'Free Trial'}
                </div>
                <div className="text-xs text-slate-400 mb-4">
                  Renews:{' '}
                  {data?.subscription?.currentPeriodEnd
                    ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString()
                    : 'N/A'}
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Status: {data?.subscription?.status ?? 'ACTIVE'}
                </div>
              </div>

              {/* Usage Quota Meters */}
              <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Resource Limits & Quotas
                </div>

                {data?.usage && (
                  <div className="space-y-3">
                    {/* Branches */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-300">Retail Branches</span>
                        <span className="text-white">
                          {data.usage.branches.current} / {data.usage.branches.limit}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.usage.branches.current / data.usage.branches.limit) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Staff */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-300">Employee Accounts</span>
                        <span className="text-white">
                          {data.usage.employees.current} / {data.usage.employees.limit}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.usage.employees.current / data.usage.employees.limit) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Products */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-300">Catalog Products</span>
                        <span className="text-white">
                          {data.usage.products.current} / {data.usage.products.limit}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.usage.products.current / data.usage.products.limit) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Billing Cycle Toggle */}
            <div className="flex justify-center items-center gap-3 pt-4">
              <span
                className={`text-sm font-semibold cursor-pointer ${
                  billingCycle === 'MONTHLY' ? 'text-white' : 'text-slate-400'
                }`}
                onClick={() => setBillingCycle('MONTHLY')}
              >
                Monthly Billing
              </span>
              <button
                type="button"
                onClick={() => setBillingCycle((b) => (b === 'MONTHLY' ? 'YEARLY' : 'MONTHLY'))}
                className="w-12 h-6 rounded-full bg-slate-800 p-1 flex items-center transition-colors relative"
              >
                <div
                  className={`w-4 h-4 rounded-full bg-blue-500 transition-transform ${
                    billingCycle === 'YEARLY' ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
              <span
                className={`text-sm font-semibold cursor-pointer flex items-center gap-1.5 ${
                  billingCycle === 'YEARLY' ? 'text-white' : 'text-slate-400'
                }`}
                onClick={() => setBillingCycle('YEARLY')}
              >
                Yearly Billing
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                  SAVE 20%
                </span>
              </span>
            </div>

            {/* Plan Tier Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans.map((p) => {
                const isCurrent = currentTier === p.tier;
                const price =
                  billingCycle === 'YEARLY'
                    ? `$${p.yearlyPrice} / yr`
                    : `$${p.monthlyPrice} / mo`;

                return (
                  <div
                    key={p.id}
                    className={`rounded-xl p-6 flex flex-col justify-between border transition-all ${
                      isCurrent
                        ? 'bg-blue-950/20 border-blue-500 shadow-lg shadow-blue-500/10'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg text-white">{p.name}</h3>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500 text-white">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 min-h-[36px] mb-4">{p.description}</p>

                      <div className="text-2xl font-extrabold text-white mb-6">
                        {p.tier === 'FREE_TRIAL' ? 'Free' : price}
                      </div>

                      <div className="space-y-2 text-xs text-slate-300 border-t border-slate-800 pt-4 mb-6">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>Up to {p.maxBranches} store branches</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>Up to {p.maxEmployees} employee logins</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>{p.maxProducts.toLocaleString()} products catalog</span>
                        </div>
                        {p.tier === 'GROWTH' && (
                          <div className="flex items-center gap-2 text-blue-400 font-medium">
                            <span>★</span>
                            <span>Stock Transfers & Analytics</span>
                          </div>
                        )}
                        {p.tier === 'ENTERPRISE' && (
                          <div className="flex items-center gap-2 text-indigo-400 font-medium">
                            <span>★</span>
                            <span>Custom Receipt & API Access</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isCurrent || updating}
                      onClick={() => handleChangePlan(p.tier)}
                      className={`w-full py-2.5 rounded-lg text-xs font-semibold transition-all ${
                        isCurrent
                          ? 'bg-slate-800 text-slate-500 cursor-default'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      {isCurrent ? 'Current Plan' : 'Select Plan'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Invoices Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-800">
                <h3 className="font-bold text-white text-base">Billing History & Invoices</h3>
              </div>

              {data?.subscription?.invoices && data.subscription.invoices.length > 0 ? (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-xs border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Invoice #</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Amount</th>
                      <th className="px-6 py-3">Method</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {data.subscription.invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-800/40">
                        <td className="px-6 py-3 font-semibold text-white">{inv.invoiceNumber}</td>
                        <td className="px-6 py-3 text-slate-400 text-xs">
                          {new Date(inv.paidAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 font-medium text-slate-200">${inv.amount}</td>
                        <td className="px-6 py-3 text-slate-400 text-xs">Bakong KHQR</td>
                        <td className="px-6 py-3">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Paid
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">No invoices generated yet.</div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

