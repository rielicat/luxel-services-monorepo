import { PhotoFrame } from '@/components/sections/photo-frame';
import { cn } from '@/lib/utils';

export function ServiceHero({
  title,
  subtitle,
  image,
  children,
}: {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  image?: { src: string; alt: string };
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
      <div
        className={cn(
          'container py-16 sm:py-24',
          image ? 'grid items-center gap-12 lg:grid-cols-2 lg:gap-16 lg:py-28' : 'text-center',
        )}
      >
        <div
          className={cn(
            image ? 'mx-auto max-w-2xl text-center lg:mx-0 lg:text-left' : 'mx-auto max-w-3xl',
          )}
        >
          <h1 className="text-balance font-serif text-4xl font-medium tracking-tight sm:text-6xl">
            {title}
          </h1>
          <p
            className={cn(
              'text-muted-foreground mt-6 max-w-2xl text-pretty text-lg',
              !image && 'mx-auto',
            )}
          >
            {subtitle}
          </p>
          {children && (
            <div
              className={cn(
                'mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center',
                image && 'lg:justify-start',
              )}
            >
              {children}
            </div>
          )}
        </div>
        {image && <PhotoFrame src={image.src} alt={image.alt} priority />}
      </div>
    </section>
  );
}
