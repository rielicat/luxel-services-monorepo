import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Features } from '@/components/landing/features';
import { PricingTeaser } from '@/components/landing/pricing-teaser';
import { FAQSection } from '@/components/landing/faq';
import { Reveal } from '@/components/ui/reveal';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Reveal>
        <HowItWorks />
      </Reveal>
      <Reveal>
        <Features />
      </Reveal>
      <Reveal>
        <PricingTeaser />
      </Reveal>
      <Reveal>
        <FAQSection />
      </Reveal>
    </main>
  );
}
