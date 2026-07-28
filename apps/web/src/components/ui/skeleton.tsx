import { cn } from '@/lib/utils';

/** Neutral pulse block for route-level loading states. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('bg-muted animate-pulse rounded-md', className)} />;
}
