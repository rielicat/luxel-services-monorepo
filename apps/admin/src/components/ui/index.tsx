import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-border bg-card shadow-soft rounded-xl border', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-6 pt-0', className)} {...props}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display flex items-center gap-2 font-semibold">{children}</h2>;
}

export function PageHeader({
  icon: Icon,
  title,
  actions,
  children,
}: {
  icon: LucideIcon;
  title: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-accent text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">{title}</h1>
          {children && (
            <div className="text-muted-foreground mt-0.5 max-w-2xl text-sm">{children}</div>
          )}
        </div>
      </div>
      {actions}
    </div>
  );
}

const ALERT_TONE = {
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  ok: 'border-success/40 bg-success/10 text-success',
} as const;

export type AlertTone = keyof typeof ALERT_TONE;

export function Alert({
  tone,
  className,
  children,
}: {
  tone: AlertTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'ok' ? 'status' : 'alert'}
      className={cn(
        'mb-4 rounded-xl border px-4 py-3 text-sm font-medium',
        ALERT_TONE[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-muted-foreground font-medium uppercase">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'border-input bg-background focus:ring-ring/60 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2';
export const primaryButton =
  'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/60 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50';
export const ghostButton =
  'border-border hover:bg-accent focus-visible:ring-ring/60 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50';
export const dangerButton =
  'border-destructive/40 text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50';

export function DataTable({
  head,
  children,
}: {
  head: React.ReactNode[];
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-left text-xs uppercase">
              {head.map((cell, index) => (
                <th key={index} className="whitespace-nowrap px-4 py-3 font-medium">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </Card>
  );
}

export function EmptyRow({ span, children }: { span: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={span} className="text-muted-foreground px-4 py-10 text-center">
        {children}
      </td>
    </tr>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('bg-muted animate-pulse rounded-md', className)} />;
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
