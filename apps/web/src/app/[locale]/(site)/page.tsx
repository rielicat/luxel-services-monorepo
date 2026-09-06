import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageOpenGraph } from '@/lib/seo/open-graph';
import { Hero } from '@/components/landing/hero';
import { Scope } from '@/components/landing/scope';
import { Gallery } from '@/components/landing/gallery';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Plans } from '@/components/landing/plans';
import { FAQSection } from '@/components/landing/faq';
import { ClosingCta } from '@/components/landing/closing-cta';
import { Reveal } from '@/components/ui/reveal';

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getTranslations('seo');
  return {
    title: seo('home_title'),
    description: seo('home_description'),
    alternates: { canonical: '/' },
    openGraph: pageOpenGraph({
      title: seo('home_title'),
      description: seo('home_description'),
      path: '',
      siteName: seo('site_name'),
      imageAlt: seo('og_alt'),
    }),
  };
}

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Reveal>
        <Scope />
      </Reveal>
      <Reveal>
        <Gallery />
      </Reveal>
      <Reveal>
        <HowItWorks />
      </Reveal>
      <Reveal>
        <Plans />
      </Reveal>
      <Reveal>
        <FAQSection />
      </Reveal>
      <Reveal>
        <ClosingCta />
      </Reveal>
    </main>
  );
}
