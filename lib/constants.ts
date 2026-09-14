export const LANGS = [
  { code: 'it', label: 'Italien', flag: '🇮🇹', bcp47: 'it-IT' },
  { code: 'es', label: 'Espagnol', flag: '🇪🇸', bcp47: 'es-ES' },
  { code: 'en', label: 'Anglais', flag: '🇬🇧', bcp47: 'en-GB' },
] as const;

export const LEVELS = [
  { code: 'A1', label: 'A1' },
  { code: 'A2', label: 'A2' },
  { code: 'B1', label: 'B1' },
  { code: 'B2', label: 'B2' },
] as const;

export type LangCode = (typeof LANGS)[number]['code'];
export type LevelCode = (typeof LEVELS)[number]['code'];
