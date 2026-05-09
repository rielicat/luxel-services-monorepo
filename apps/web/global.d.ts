import type { Messages } from '@luxel/shared/i18n';

declare global {
  // Augments next-intl message typing so `useTranslations()` keys are checked against es-CL.json.
  interface IntlMessages extends Messages {}
}

export {};
