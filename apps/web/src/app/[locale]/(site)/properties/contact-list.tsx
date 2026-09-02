'use client';

import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { formatPhone } from '@/lib/phone';

export type ContactRole = 'cleaning' | 'concierge';
export type PropertyContact = {
  id: string;
  role: ContactRole;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
};

const HOSPITABLE_TEAM_URL = 'https://my.hospitable.com/operations/team';

export function ContactList({
  role,
  contacts,
  title,
  body,
}: {
  role: ContactRole;
  contacts: PropertyContact[];
  title: string;
  body: string;
}) {
  const t = useTranslations('contacts');

  return (
    <div className="grid gap-2">
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-muted-foreground text-xs">{body}</p>
      </div>
      {contacts.length === 0 && (
        <p className="text-muted-foreground text-xs">
          {t(role === 'cleaning' ? 'none_cleaning' : 'none_concierge')}
        </p>
      )}
      {contacts.map((c) => (
        <div
          key={c.id}
          className="bg-muted/40 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm"
        >
          <span className="min-w-0 truncate">
            <span className="font-medium">{c.name || t('unnamed')}</span>
            <span className="text-muted-foreground ml-1.5 text-xs">
              {[c.whatsapp ? formatPhone(c.whatsapp) : null, c.email].filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>
      ))}
      <p className="text-muted-foreground text-xs">
        {t('managed_pre')}{' '}
        <a
          href={HOSPITABLE_TEAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary inline-flex items-center gap-1 underline underline-offset-2"
        >
          {t('managed_link')} <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  );
}
