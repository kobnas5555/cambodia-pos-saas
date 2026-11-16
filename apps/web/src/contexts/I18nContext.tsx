'use client';

import {
  getDictionary,
  type LanguageCode,
  type TranslationDictionary,
} from '@cambodia-pos/shared';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, tokenStorage } from '@/lib/api';

const LANG_STORAGE_KEY = 'cambodia_pos_lang';

interface I18nContextValue {
  lang: LanguageCode;
  setLang: (lang: LanguageCode) => void;
  t: TranslationDictionary;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>('en');

  useEffect(() => {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'km') {
      setLangState(saved);
    }
  }, []);

  const setLang = (next: LanguageCode) => {
    setLangState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    }
    if (tokenStorage.getAccessToken()) {
      apiRequest('/settings/user-preferences', {
        method: 'PUT',
        body: JSON.stringify({ language: next }),
      }).catch(() => {});
    }
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: getDictionary(lang),
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}

