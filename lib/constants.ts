export const LANGS = [
  { code: 'it', label: 'Italien', flag: '🇮🇹' },
  { code: 'es', label: 'Espagnol', flag: '🇪🇸' },
  { code: 'en', label: 'Anglais', flag: '🇬🇧' },
] as const;

export const LEVELS = [
  { code: 'A1', label: 'A1' },
  { code: 'A2', label: 'A2' },
  { code: 'B1', label: 'B1' },
  { code: 'B2', label: 'B2' },
] as const;

export type LangCode = (typeof LANGS)[number]['code'];
export type LevelCode = (typeof LEVELS)[number]['code'];
