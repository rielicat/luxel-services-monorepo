import { useTranslations } from 'next-intl';
import { CalendarCheck, Calculator, MessageCircle, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ITEMS = ['calculator', 'calendar', 'chat', 'sparkles'] as const;
const ICONS: Record<(typeof ITEMS)[number], LucideIcon> = {
  calculator: Calculator,
  calendar: CalendarCheck,
  chat: MessageCircle,
  sparkles: ShieldCheck,
};

export function Features() {
  const t = useTranslations('landing.features');

  return (
    <section id="caracteristicas" className="container py-20 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t('title')}</h2>
        <p className="text-muted-foreground mt-4">{t('subtitle')}</p>
      </div>
      <div className="mx-auto mt-14 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((key) => {
          const Icon = ICONS[key];
          return (
            <div
              key={key}
              className="border-border bg-card shadow-soft hover:border-primary/30 hover:shadow-lift hover-lift group rounded-xl border p-6"
            >
              <div className="bg-accent text-accent-foreground group-hover:bg-primary group-hover:text-primary-foreground ease-lux flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-display mt-5 font-semibold">{t(`items.${key}.title`)}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {t(`items.${key}.description`)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
