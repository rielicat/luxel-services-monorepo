/** Aurora-washed centered hero used by the service pages. Pass CTAs as children;
 *  they lay out in a responsive row. `subtitle` accepts rich nodes (t.rich). */
export function ServiceHero({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
      <div className="container py-20 text-center sm:py-28">
        <h1 className="mx-auto max-w-3xl text-balance font-serif text-4xl font-medium tracking-tight sm:text-6xl">
          {title}
        </h1>
        <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-pretty text-lg">
          {subtitle}
        </p>
        {children && (
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
