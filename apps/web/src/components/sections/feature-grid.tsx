import type { ComponentType } from 'react';
import { Card, CardContent } from '@/components/ui/card';

type Feature = {
  key: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
};

export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <div className="mx-auto mt-12 flex max-w-5xl flex-wrap justify-center gap-5">
      {features.map((f) => (
        <Card
          key={f.key}
          className="hover:border-primary/30 hover:shadow-lift hover-lift group w-full sm:w-[calc(50%-0.625rem)] lg:w-[calc(25%-0.9375rem)]"
        >
          <CardContent className="p-6">
            <div className="bg-primary/10 text-primary ease-lux flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110">
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
