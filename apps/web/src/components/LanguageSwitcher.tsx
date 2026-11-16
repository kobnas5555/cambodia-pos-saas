'use client';

import { useI18n } from '@/contexts/I18nContext';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n();

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium shadow-sm ${className}`}
      role="group"
      aria-label="Language switcher"
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`rounded-md px-2.5 py-1 transition ${
          lang === 'en'
            ? 'bg-emerald-600 text-white'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('km')}
        className={`rounded-md px-2.5 py-1 transition ${
          lang === 'km'
            ? 'bg-emerald-600 text-white'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        ខ្មែរ
      </button>
    </div>
  );
}

