import { cn } from '@/lib/utils';

const TONES = {
  primary: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
} as const;

export function Steps({
  steps,
  tone = 'primary',
}: {
  steps: { title: string; body: string }[];
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-3">
      {steps.map((s, i) => (
        <div key={s.title} className="text-center">
          <span
            className={cn(
              'font-display mx-auto flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold',
              TONES[tone],
            )}
          >
            {i + 1}
          </span>
          <h3 className="font-display mt-4 font-semibold">{s.title}</h3>
          <p className="text-muted-foreground mt-2 text-sm">{s.body}</p>
        </div>
      ))}
    </div>
  );
}
