import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { SectionHeading } from '@/components/sections/section-heading';
import { cn } from '@/lib/utils';

const PHOTOS = [
  { key: 'living', src: '/img/jmi/living.jpg', featured: true },
  { key: 'bedroom', src: '/img/jmi/bedroom-main.jpg', featured: false },
  { key: 'kitchen', src: '/img/jmi/kitchen.jpg', featured: false },
  { key: 'hot_tub', src: '/img/jmi/hot-tub.jpg', featured: false },
  { key: 'dining', src: '/img/jmi/dining.jpg', featured: false },
  { key: 'bath', src: '/img/jmi/bath.jpg', featured: false },
] as const;

export function Gallery() {
  const t = useTranslations('landing.gallery');
  return (
    <section id="galeria" className="border-border/60 bg-muted/40 border-y py-20 sm:py-24">
      <div className="container">
        <SectionHeading title={t('title')} />
        <ul className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {PHOTOS.map(({ key, src, featured }) => (
            <li
              key={key}
              className={cn(
                'border-border/60 bg-muted group relative overflow-hidden rounded-2xl border',
                featured ? 'col-span-2 aspect-[4/3] lg:row-span-2 lg:aspect-auto' : 'aspect-[4/3]',
              )}
            >
              <Image
                src={src}
                alt={t(`alts.${key}`)}
                fill
                sizes={
                  featured ? '(max-width: 1024px) 100vw, 66vw' : '(max-width: 1024px) 50vw, 33vw'
                }
                className="ease-lux object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-5 text-center text-sm">{t('caption')}</p>
      </div>
    </section>
  );
}
