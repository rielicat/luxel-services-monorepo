import type { MetadataRoute } from 'next';
import { SITE_URL } from '@luxel/shared/constants';

const PAGES = [
  { path: '', priority: 1, changeFrequency: 'weekly' as const },
  { path: '/calculator', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: '/about', priority: 0.6, changeFrequency: 'monthly' as const },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));
}
