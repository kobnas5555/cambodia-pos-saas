'use client';

import {
  ArrowLeftRight,
  Building2,
  CreditCard,
  FileText,
  History,
  Languages,
  Percent,
  Receipt,
  Store,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';

export type SettingsNavKey =
  | 'business'
  | 'branches'
  | 'currency'
  | 'exchange'
  | 'receipt'
  | 'tax'
  | 'preferences'
  | 'activity'
  | 'billing';

interface SettingsNavProps {
  activeKey?: SettingsNavKey;
}

export function SettingsNav({ activeKey }: SettingsNavProps) {
  const pathname = usePathname();
  const [currentTabParam, setCurrentTabParam] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setCurrentTabParam(params.get('tab') || '');
    }
  }, [pathname]);

  const navItems = [
    {
      key: 'business',
      label: 'Business Profile',
      href: '/settings/business',
      icon: Building2,
      isActive: activeKey === 'business' || pathname === '/settings/business',
    },
    {
      key: 'branches',
      label: 'Branch Settings',
      href: '/settings/branches',
      icon: Store,
      isActive: activeKey === 'branches' || pathname === '/settings/branches',
    },
    {
      key: 'exchange',
      label: 'Currency & Rates',
      href: '/settings/system?tab=exchange',
      icon: ArrowLeftRight,
      isActive:
        activeKey === 'exchange' ||
        activeKey === 'currency' ||
        (pathname === '/settings/system' && currentTabParam === 'exchange'),
    },
    {
      key: 'tax',
      label: 'Tax & VAT',
      href: '/settings/system?tab=tax',
      icon: Percent,
      isActive:
        activeKey === 'tax' ||
        (pathname === '/settings/system' && (currentTabParam === 'tax' || !currentTabParam)),
    },
    {
      key: 'receipt',
      label: 'Receipt Settings',
      href: '/settings/system?tab=receipt',
      icon: Receipt,
      isActive:
        activeKey === 'receipt' ||
        (pathname === '/settings/system' && currentTabParam === 'receipt'),
    },
    {
      key: 'preferences',
      label: 'Language & Prefs',
      href: '/settings/system?tab=preferences',
      icon: Languages,
      isActive:
        activeKey === 'preferences' ||
        (pathname === '/settings/system' && currentTabParam === 'preferences'),
    },
    {
      key: 'activity',
      label: 'Activity Logs',
      href: '/settings/activity-logs',
      icon: History,
      isActive: activeKey === 'activity' || pathname === '/settings/activity-logs',
    },
    {
      key: 'billing',
      label: 'Subscription',
      href: '/settings/billing',
      icon: CreditCard,
      isActive: activeKey === 'billing' || pathname === '/settings/billing',
    },
  ];

  return (
    <div className="border-b border-slate-200 bg-white shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 text-xs font-semibold sm:text-sm no-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 transition ${
                item.isActive
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

