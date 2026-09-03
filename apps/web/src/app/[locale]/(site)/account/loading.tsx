import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function AccountLoading() {
  return (
    <main className="pb-16">
      <section className="bg-aurora border-border/50 border-b">
        <div className="container max-w-3xl py-10 sm:py-12">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="mt-3 h-4 w-72" />
        </div>
      </section>

      <div className="container grid max-w-3xl gap-10 pt-10">
        <section className="grid gap-3">
          <div className="grid gap-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Card>
            <CardContent className="grid gap-5 p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 rounded-2xl" />
                <div className="grid gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-52" />
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <Skeleton className="h-10 w-36 rounded-lg" />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-3">
          <div className="grid gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Card>
            <CardContent className="grid gap-4 p-6">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-9 w-40 rounded-lg" />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
