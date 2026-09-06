import { Card, Skeleton } from '@/components/ui';

export default function PanelLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando</span>

      <div className="mb-6 flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="grid gap-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="mt-3 h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-16" />
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-5">
        <div className="grid gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24 shrink-0" />
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
