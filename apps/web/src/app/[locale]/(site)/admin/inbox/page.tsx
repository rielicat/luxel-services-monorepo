import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getTranslations } from 'next-intl/server';
import { MessagesSquare } from 'lucide-react';
import { isClerkAdmin } from '@/lib/auth/admin';
import { listInboxThreads } from '@/lib/messaging/drafts';
import { InboxReview } from './inbox-review';

export const dynamic = 'force-dynamic';

export default async function AdminInboxPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  if (!(await isClerkAdmin(userId))) notFound();

  const t = await getTranslations('inbox');
  const threads = await listInboxThreads();

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
          <MessagesSquare className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('subtitle')} {t('review_managed')}
          </p>
        </div>
      </div>

      <InboxReview threads={threads} />
    </div>
  );
}
