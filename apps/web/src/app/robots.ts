import type { MetadataRoute } from 'next';
import { SITE_URL } from '@luxel/shared/constants';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/eve',
        '/account',
        '/properties',
        '/checkin/',
        '/cleaning/',
        '/sign-in',
        '/sign-up',
        '/sso-callback',
        '/dev-preview',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
