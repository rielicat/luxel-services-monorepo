import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Features } from '@/components/landing/features';
import { PricingTeaser } from '@/components/landing/pricing-teaser';
import { AirbnbTeaser } from '@/components/landing/airbnb-teaser';
import { FAQSection } from '@/components/landing/faq';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <HowItWorks />
      <Features />
      <AirbnbTeaser />
      <PricingTeaser />
      <FAQSection />
    </main>
  );
}
