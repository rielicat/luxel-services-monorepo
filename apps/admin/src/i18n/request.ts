import { getRequestConfig } from 'next-intl/server';
import { adminMessages } from '@luxel/shared/i18n';
import { TIMEZONE } from '@luxel/shared/constants';

export default getRequestConfig(async () => ({
  locale: 'es',
  messages: adminMessages,
  timeZone: TIMEZONE,
  now: new Date(),
}));
