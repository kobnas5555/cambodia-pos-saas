import { en, type TranslationDictionary } from './en';
import { km } from './km';

export const SUPPORTED_LANGUAGES = ['en', 'km'] as const;
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

export const dictionaries: Record<LanguageCode, TranslationDictionary> = {
  en,
  km,
};

export function getDictionary(lang: LanguageCode): TranslationDictionary {
  return dictionaries[lang] ?? en;
}

export type { TranslationDictionary };
export { en, km };

