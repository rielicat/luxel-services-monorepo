import { useTranslations } from 'next-intl';
import {
  TrendingUp,
  MessageCircle,
  Sparkles,
  ShieldCheck,
  Package,
  Wrench,
  Sofa,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FeatureGrid } from '@/components/sections/feature-grid';
import { SectionHeading } from '@/components/sections/section-heading';

const ITEMS = [
  'pricing',
  'guests',
  'cleaning',
  'conflicts',
  'inventory',
  'repairs',
  'setup',
] as const;

const ICONS: Record<(typeof ITEMS)[number], LucideIcon> = {
  pricing: TrendingUp,
  guests: MessageCircle,
  cleaning: Sparkles,
  conflicts: ShieldCheck,
  inventory: Package,
  repairs: Wrench,
  setup: Sofa,
};

export function ScopeGrid() {
  const t = useTranslations('landing.scope');
  return (
    <FeatureGrid
      features={ITEMS.map((key) => ({
        key,
        icon: ICONS[key],
        title: t(`items.${key}.title`),
        body: t(`items.${key}.body`),
      }))}
    />
  );
}

export function Scope() {
  const t = useTranslations('landing.scope');
  return (
    <section id="servicio" className="container py-20 sm:py-24">
      <SectionHeading title={t('title')} subtitle={t('subtitle')} />
      <ScopeGrid />
    </section>
  );
}
