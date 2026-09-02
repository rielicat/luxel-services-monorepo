import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function PropertyDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8">
      <Skeleton className="mb-5 h-6 w-40 rounded-full" />

      <div className="mb-6 flex items-center gap-4">
        <Skeleton className="h-20 w-28 shrink-0 rounded-lg" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
      </div>

      <div className="border-border/60 mb-10 grid grid-cols-2 gap-x-6 gap-y-5 border-y py-5 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>

      <Skeleton className="mb-10 h-5 w-64" />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardContent className="grid gap-2 p-4">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardContent className="grid gap-5 p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 w-44" />
              </div>
              <Skeleton className={i === 0 ? 'h-72 rounded-lg' : 'h-40 rounded-lg'} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
