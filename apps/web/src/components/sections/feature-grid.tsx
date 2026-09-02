import type { ComponentType } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Feature = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
};

const TONES = {
  primary: 'bg-primary/10 text-primary',
} as const;

export function FeatureGrid({
  features,
  tone = 'primary',
}: {
  features: Feature[];
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {features.map((f) => (
        <Card key={f.title}>
          <CardContent className="p-6">
            <div
              className={cn('flex h-11 w-11 items-center justify-center rounded-xl', TONES[tone])}
            >
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display mt-5 font-semibold">{f.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{f.body}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
