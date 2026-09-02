import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('border-border bg-card shadow-soft rounded-xl border', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display flex items-center gap-2 font-semibold">{children}</h2>;
}

const PILL: Record<string, string> = {
  new: 'bg-warning/15 text-warning',
  contacted: 'bg-accent text-accent-foreground',
  converted: 'bg-success/15 text-success',
  lost: 'bg-muted text-muted-foreground',
};

export function Pill({ tone, children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        (tone && PILL[tone]) || 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

export function LuxelMark({ className }: { className?: string }) {
  const gid = 'luxel-admin-grad';
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('h-6 w-6', className)} fill="none">
      <defs>
        <linearGradient id={gid} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--secondary))" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.2l1.9 6.05a4 4 0 0 0 2.6 2.6L22.5 12.75l-6 1.9a4 4 0 0 0-2.6 2.6L12 23.3l-1.9-6.05a4 4 0 0 0-2.6-2.6L1.5 12.75l6-1.9a4 4 0 0 0 2.6-2.6L12 2.2z"
        fill={`url(#${gid})`}
      />
      <path
        d="M18.6 2.6l.55 1.75a2 2 0 0 0 1.3 1.3l1.75.55-1.75.55a2 2 0 0 0-1.3 1.3l-.55 1.75-.55-1.75a2 2 0 0 0-1.3-1.3L15 6.2l1.75-.55a2 2 0 0 0 1.3-1.3l.55-1.75z"
        fill="hsl(var(--lime))"
      />
    </svg>
  );
}
