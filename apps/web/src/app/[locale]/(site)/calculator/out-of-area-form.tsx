'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { MapPinOff, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSessionId, track } from '@/lib/analytics/client';
import { EVENTS } from '@/lib/analytics/events';
import { captureOutOfAreaLead } from './lead-actions';

interface Props {
  serviceSlug?: string;
  squareMeters?: number;
  addressLine?: string;
  commune?: string;
}

export function OutOfAreaLeadForm({ serviceSlug, squareMeters, addressLine, commune }: Props) {
  const t = useTranslations('lead');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    startTransition(async () => {
      const r = await captureOutOfAreaLead({
        email: email.trim(),
        phone: phone.trim() || undefined,
        serviceSlug,
        squareMeters,
        addressLine,
        commune,
        sessionId: getSessionId(),
      });
      if (r.ok) {
        setDone(true);
        track(EVENTS.LEAD_OUT_OF_AREA_SUBMITTED, { commune, service_slug: serviceSlug });
      }
    });
  };

  return (
    <Card className="border-warning/40 bg-warning/5 mt-4">
      <CardContent className="p-5">
        {done ? (
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="bg-success/15 text-success flex h-8 w-8 items-center justify-center rounded-full">
              <Check className="h-4 w-4" />
            </span>
            {t('success')}
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <MapPinOff className="text-warning mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-display font-semibold">{t('out_of_area_title')}</p>
                <p className="text-muted-foreground text-sm">{t('out_of_area_subtitle')}</p>
              </div>
            </div>
            <form onSubmit={onSubmit} className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="lead-email">{t('email')}</Label>
                <Input
                  id="lead-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.cl"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lead-phone">{t('phone')}</Label>
                <Input
                  id="lead-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+56 9 ..."
                />
              </div>
              <Button type="submit" disabled={pending || !email.trim()}>
                {pending ? t('sending') : t('submit')}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
