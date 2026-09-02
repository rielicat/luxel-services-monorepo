import { cn } from '@/lib/utils';

export function LuxelMark({ className }: { className?: string }) {
  const gid = 'luxel-mark-grad';
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn('h-6 w-6', className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
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

export function LuxelLogo({
  className,
  markClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LuxelMark className={cn('h-6 w-6', markClassName)} />
      {showWordmark && (
        <span className="font-display text-lg font-extrabold tracking-tight">Luxel</span>
      )}
    </span>
  );
}
