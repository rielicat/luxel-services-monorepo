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
      <h2 className="font-display text-3xl font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="text-muted-foreground mt-4">{subtitle}</p>}
    </div>
  );
}
