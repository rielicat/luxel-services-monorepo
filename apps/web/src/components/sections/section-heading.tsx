import { cn } from '@/lib/utils';

export function SectionHeading({
  title,
  subtitle,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto max-w-2xl text-center', className)}>
      <h2 className="text-balance font-serif text-4xl font-medium tracking-tight sm:text-5xl">
        {title}
      </h2>
      {subtitle && <p className="text-muted-foreground mt-4 text-pretty">{subtitle}</p>}
    </div>
  );
}
