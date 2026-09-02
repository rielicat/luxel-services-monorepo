import { Hero } from '@/components/landing/hero';
import { Scope } from '@/components/landing/scope';
import { Gallery } from '@/components/landing/gallery';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Plans } from '@/components/landing/plans';
import { FAQSection } from '@/components/landing/faq';
import { Reveal } from '@/components/ui/reveal';

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
    </main>
  );
}
