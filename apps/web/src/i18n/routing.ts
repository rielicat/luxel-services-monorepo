import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ['es'],
  defaultLocale: 'es',
  // 'never' = URLs are clean (`/calculator`, not `/es/calculator`).
  // The locale is decided by middleware/request config (today: always 'es'; later:
  // geolocation header — see apps/web/src/i18n/request.ts).
  localePrefix: 'never',
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
