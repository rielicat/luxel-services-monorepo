import esCL from './es-CL.json';

export const messages = esCL;
export type Messages = typeof esCL;

export const SUPPORTED_LOCALES = ['es'] as const;
export const DEFAULT_LOCALE = 'es' as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
