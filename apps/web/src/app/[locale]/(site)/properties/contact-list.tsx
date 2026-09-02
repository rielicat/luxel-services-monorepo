'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { formatPhone } from '@/lib/phone';
import { addPropertyContact, removePropertyContact } from './contact-actions';

export type ContactRole = 'cleaning' | 'concierge';
export type PropertyContact = {
  id: string;
  role: ContactRole;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
};

export function ContactList({
  propertyId,
  role,
  contacts,
  title,
  body,
  addTitle,
}: {
  propertyId: string;
  role: ContactRole;
  contacts: PropertyContact[];
  title: string;
  body: string;
  addTitle: string;
}) {
  const t = useTranslations('contacts');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', whatsapp: '', email: '' });
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const add = () =>
    run(async () => {
      const r = await addPropertyContact({ propertyId, role, ...draft });
      if (r.ok) {
        setDraft({ name: '', whatsapp: '', email: '' });
        setError(null);
        setOpen(false);
      } else {
        setError(r.error === 'whatsapp_invalid' ? t('error_whatsapp') : t('error'));
      }
    });

  return (
    <div className="grid gap-2">
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-muted-foreground text-xs">{body}</p>
      </div>
      {contacts.length === 0 && <p className="text-muted-foreground text-xs">{t('none')}</p>}
      {contacts.map((c) => (
        <div
          key={c.id}
          className="bg-muted/40 flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm"
        >
          <span className="min-w-0 truncate">
            <span className="font-medium">{c.name || t('unnamed')}</span>
            <span className="text-muted-foreground ml-1.5 text-xs">
              {[c.whatsapp ? formatPhone(c.whatsapp) : null, c.email].filter(Boolean).join(' · ')}
            </span>
          </span>
          <button
            type="button"
            aria-label={t('remove')}
            disabled={pending}
            onClick={() => run(() => removePropertyContact({ propertyId, contactId: c.id }))}
            className="text-muted-foreground hover:text-warning shrink-0 rounded-md p-1 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="justify-self-start"
        disabled={pending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> {t('add')}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={addTitle}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${role}-wa`}>
              {t('whatsapp')} <span className="text-warning">*</span>
            </Label>
            <Input
              id={`${role}-wa`}
              type="tel"
              autoFocus
              required
              value={draft.whatsapp}
              onChange={(e) => setDraft((d) => ({ ...d, whatsapp: e.target.value }))}
              placeholder="+56 9 1234 5678"
              aria-describedby={`${role}-wa-hint`}
            />
            <p id={`${role}-wa-hint`} className="text-muted-foreground text-xs">
              {t('whatsapp_hint')}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${role}-name`}>{t('name')}</Label>
            <Input
              id={`${role}-name`}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={t('name_ph')}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${role}-email`}>
              {t('email')}{' '}
              <span className="text-muted-foreground font-normal">{t('optional')}</span>
            </Label>
            <Input
              id={`${role}-email`}
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder="persona@correo.cl"
            />
          </div>

          {error && <p className="text-warning text-sm">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending || !draft.whatsapp.trim()}>
              {t('save')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
