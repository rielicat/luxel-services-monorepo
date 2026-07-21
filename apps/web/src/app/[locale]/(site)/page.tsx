import { Hero } from '@/components/landing/hero';
import { ServicesOverview } from '@/components/landing/services-overview';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Features } from '@/components/landing/features';
import { PricingTeaser } from '@/components/landing/pricing-teaser';
import { FAQSection } from '@/components/landing/faq';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <ServicesOverview />
      <HowItWorks />
      <Features />
      <PricingTeaser />
      <FAQSection />
    </main>
  );
}
