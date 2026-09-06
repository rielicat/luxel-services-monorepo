import { getTranslations } from 'next-intl/server';
import { MessagesSquare } from 'lucide-react';
import { listInboxThreads } from '@luxel/core/messaging/drafts';
import { PageHeader } from '@/components/ui';
import { InboxReview } from './inbox-review';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export default async function AdminInboxPage() {
  const t = await getTranslations('inbox');
  const threads = await listInboxThreads();

  return (
    <div className="max-w-4xl">
      <PageHeader icon={MessagesSquare} title={t('title')}>
        {t('subtitle')} {t('review_managed')}
      </PageHeader>

      <InboxReview threads={threads} />
    </div>
  );
}
