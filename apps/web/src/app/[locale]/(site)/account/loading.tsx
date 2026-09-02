import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function AccountLoading() {
  return (
    <main className="pb-16">
      <section className="bg-aurora border-border/50 border-b">
        <div className="container flex max-w-5xl flex-col gap-4 py-10 sm:flex-row sm:items-end sm:justify-between sm:py-12">
          <div className="grid gap-2">
            <Skeleton className="h-9 w-52" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>
      </section>

      <div className="container max-w-5xl space-y-12 pt-10">
        <section>
          <Skeleton className="mb-5 h-6 w-32" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="grid gap-3 p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <Skeleton className="h-5 w-40" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-9 w-32 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
