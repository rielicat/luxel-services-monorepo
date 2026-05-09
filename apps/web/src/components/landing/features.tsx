import { useTranslations } from 'next-intl';
import { CalendarCheck, Calculator, MessageCircle, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ITEMS = ['calculator', 'calendar', 'chat', 'sparkles'] as const;
const ICONS: Record<(typeof ITEMS)[number], LucideIcon> = {
  calculator: Calculator,
  calendar: CalendarCheck,
  chat: MessageCircle,
  sparkles: Sparkles,
};

export function Features() {
  const t = useTranslations('landing.features');

  return (
    <section id="caracteristicas" className="container py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h2>
        <p className="text-muted-foreground mt-4">{t('subtitle')}</p>
      </div>
      <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((key) => {
          const Icon = ICONS[key];
          return (
            <div key={key} className="border-border bg-card rounded-lg border p-6 shadow-sm">
              <Icon className="text-primary h-6 w-6" />
              <h3 className="mt-4 font-semibold">{t(`items.${key}.title`)}</h3>
              <p className="text-muted-foreground mt-2 text-sm">{t(`items.${key}.description`)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
