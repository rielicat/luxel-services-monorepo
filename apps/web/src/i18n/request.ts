import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { messages as esCL } from '@luxel/shared/i18n';
import { TIMEZONE } from '@luxel/shared/constants';
import { routing } from './routing';

/**
 * Map a 2-letter country code (ISO 3166-1 alpha-2) to a supported locale.
 *
 * Called with the country from `x-vercel-ip-country` (Vercel) or `cf-ipcountry`
 * (Cloudflare). Today every country resolves to 'es' because that's the only
 * locale we support; when 'en' is added, gate non-Spanish-speaking regions here.
 */
function pickLocaleFromCountry(country: string | null): (typeof routing.locales)[number] {
  // Spanish-speaking countries — the broad set so a Mexican or Argentinian
  // visitor gets Spanish too once the second locale lands.
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
  // Fallback while we only support one locale.
  return routing.defaultLocale;
}

export default getRequestConfig(async () => {
  const h = await headers();
  // Vercel sets x-vercel-ip-country; Cloudflare sets cf-ipcountry. Either works.
  const country = h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry');
  const locale = pickLocaleFromCountry(country);

  return {
    locale,
    messages: esCL,
    timeZone: TIMEZONE,
    now: new Date(),
  };
});
