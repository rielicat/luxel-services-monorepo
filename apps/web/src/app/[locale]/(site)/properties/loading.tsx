import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function PropertiesLoading() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2.5">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="grid gap-1.5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      <div className="grid gap-6">
        <Card className="mb-5">
          <CardContent className="grid gap-5 p-4 sm:p-5">
            <div className="flex items-start gap-2.5">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="grid gap-1.5">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1].map((i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-[16/9] w-full rounded-none" />
              <CardContent className="grid gap-3 p-4">
                <div className="grid gap-1.5">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
