import Image from 'next/image';
import { cn } from '@/lib/utils';

export function PhotoFrame({
  src,
  alt,
  priority = false,
  sizes = '(max-width: 1024px) 100vw, 50vw',
  className,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <div
        aria-hidden
        className="bg-secondary/20 pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] blur-2xl"
      />
      <div className="border-border/60 bg-muted shadow-lift relative aspect-[4/3] overflow-hidden rounded-3xl border">
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          className="object-cover"
        />
      </div>
    </div>
  );
}
