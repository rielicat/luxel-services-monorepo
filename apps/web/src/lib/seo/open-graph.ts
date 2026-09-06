import type { Metadata } from 'next';
import { SITE_URL } from '@luxel/shared/constants';

export interface PageOpenGraph {
  title: string;
  description: string;
  path: string;
  siteName: string;
  imageAlt: string;
}

export function pageOpenGraph(input: PageOpenGraph): Metadata['openGraph'] {
  return {
    type: 'website',
    locale: 'es_CL',
    siteName: input.siteName,
    url: `${SITE_URL}${input.path}`,
    title: input.title,
    description: input.description,
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: input.imageAlt }],
  };
}
