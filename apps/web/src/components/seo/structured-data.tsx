import { getTranslations } from 'next-intl/server';
import { SITE_URL, SUPPORT_EMAIL } from '@luxel/shared/constants';
import { PLAN_COMMISSION_PCT } from '@luxel/core/plan-pricing';

export async function StructuredData() {
  const t = await getTranslations('seo');
  const tl = await getTranslations('landing');

  const organization = {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: t('site_name'),
    url: SITE_URL,
    email: SUPPORT_EMAIL,
    logo: `${SITE_URL}/opengraph-image.png`,
    areaServed: { '@type': 'Country', name: t('country') },
  };

  const service = {
    '@type': 'Service',
    '@id': `${SITE_URL}/#service`,
    name: t('service_name'),
    serviceType: t('service_name'),
    description: tl('meta_description'),
    provider: { '@id': `${SITE_URL}/#organization` },
    areaServed: [
      { '@type': 'City', name: t('area_served') },
      { '@type': 'Country', name: t('country') },
    ],
    offers: {
      '@type': 'Offer',
      priceCurrency: 'CLP',
      description: tl('plans.subtitle', { pct: Math.round(PLAN_COMMISSION_PCT * 100) }),
      url: `${SITE_URL}/calculator`,
    },
  };

  const graph = { '@context': 'https://schema.org', '@graph': [organization, service] };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
