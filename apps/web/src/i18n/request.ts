import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { messages as esCL } from '@luxel/shared/i18n';
import { TIMEZONE } from '@luxel/shared/constants';
import { routing } from './routing';

function pickLocaleFromCountry(country: string | null): (typeof routing.locales)[number] {
  const ES_COUNTRIES = new Set([
    'CL',
    'AR',
    'BO',
    'CO',
    'CR',
    'CU',
    'DO',
    'EC',
    'ES',
    'GT',
    'HN',
    'MX',
    'NI',
    'PA',
    'PE',
    'PR',
    'PY',
    'SV',
    'UY',
    'VE',
  ]);
  if (country && ES_COUNTRIES.has(country.toUpperCase())) return 'es';
  return routing.defaultLocale;
}

export default getRequestConfig(async () => {
  const h = await headers();
  const country = h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry');
  const locale = pickLocaleFromCountry(country);

  return {
    locale,
    messages: esCL,
    timeZone: TIMEZONE,
    now: new Date(),
  };
});
