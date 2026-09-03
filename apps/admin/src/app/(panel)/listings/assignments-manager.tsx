'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, TriangleAlert, Link2, Trash2, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import {
  assignListingToCustomer,
  unassignListingFromCustomer,
  type UnclaimedListing,
  type AssignedListing,
  type AssignableCustomer,
} from './assignment-actions';

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Santiago',
  }).format(new Date(iso));

export function AssignmentsManager({
  unclaimed,
  unclaimedFailed,
  assigned,
  assignedFailed,
  customers,
}: {
  unclaimed: UnclaimedListing[];
  unclaimedFailed: boolean;
  assigned: AssignedListing[];
  assignedFailed: boolean;
  customers: AssignableCustomer[];
}) {
  const t = useTranslations('assign');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [confirmOff, setConfirmOff] = useState<AssignedListing | null>(null);
  const [confirmMove, setConfirmMove] = useState<{
    row: AssignedListing;
    customerId: string;
    label: string;
  } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const selectCls =
    'border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2';

  return (
    <div className="grid gap-4">
      {note && (
        <p className="text-success flex items-center gap-1.5 text-sm font-medium">
          <Check className="h-4 w-4" /> {note}
        </p>
      )}

      <Card>
        <CardContent className="grid gap-3 p-4 sm:p-5">
          <div>
            <p className="font-display font-semibold">{t('unclaimed_title')}</p>
            <p className="text-muted-foreground text-xs">{t('unclaimed_help')}</p>
          </div>

          {unclaimedFailed && (
            <p className="text-warning flex items-start gap-1.5 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {t('unclaimed_failed')}
            </p>
          )}

          {!unclaimedFailed && unclaimed.length === 0 && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Inbox className="h-4 w-4" /> {t('unclaimed_none')}
            </p>
          )}

          {unclaimed.map((l) => (
            <div
              key={l.externalListingId}
              className="border-border grid gap-2 rounded-lg border p-3 sm:flex sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {l.address ?? l.externalListingId}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  className={selectCls}
                  value={picked[l.externalListingId] ?? ''}
                  onChange={(e) =>
                    setPicked((p) => ({ ...p, [l.externalListingId]: e.target.value }))
                  }
                  aria-label={t('pick_customer')}
                >
                  <option value="">{t('pick_customer')}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={pending || !picked[l.externalListingId]}
                  onClick={() =>
                    run(async () => {
                      const r = await assignListingToCustomer({
                        externalListingId: l.externalListingId,
                        customerId: picked[l.externalListingId],
                        expectedOwnerId: null,
                      });
                      setNote(
                        !r.ok
                          ? r.error === 'stale'
                            ? t('stale')
                            : t('assigned_fail')
                          : r.importOk
                            ? t('assigned_ok', { name: l.name })
                            : t('assigned_no_import', { name: l.name }),
                      );
                    })
                  }
                >
                  <Link2 className="mr-1 h-3.5 w-3.5" /> {t('assign')}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:p-5">
          <div>
            <p className="font-display font-semibold">{t('assigned_title')}</p>
            <p className="text-muted-foreground text-xs">{t('assigned_help')}</p>
          </div>

          {assignedFailed && (
            <p className="text-warning flex items-start gap-1.5 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {t('assigned_failed')}
            </p>
          )}
          {!assignedFailed && assigned.length === 0 && (
            <p className="text-muted-foreground text-sm">{t('assigned_none')}</p>
          )}

          {assigned.map((row) => (
            <div
              key={row.externalListingId}
              className="border-border grid gap-2 rounded-lg border p-3 sm:flex sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {row.nickname ?? row.externalListingId}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {row.customerLabel} · {fmt(row.assignedAt)}
                  {!row.nickname && ` · ${t('not_imported_yet')}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  className={selectCls}
                  value=""
                  disabled={pending}
                  onChange={(e) => {
                    const customerId = e.target.value;
                    if (!customerId) return;
                    setConfirmMove({
                      row,
                      customerId,
                      label: customers.find((c) => c.id === customerId)?.label ?? customerId,
                    });
                    e.currentTarget.selectedIndex = 0;
                  }}
                  aria-label={t('reassign')}
                >
                  <option value="">{t('reassign')}</option>
                  {customers
                    .filter((c) => c.id !== row.customerId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirmOff(row)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> {t('offboard')}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Modal
        open={confirmMove != null}
        onClose={() => setConfirmMove(null)}
        title={t('move_title')}
      >
        {confirmMove && (
          <div className="grid gap-3">
            <p className="text-sm">
              {t('move_body', {
                name: confirmMove.row.nickname ?? confirmMove.row.externalListingId,
                from: confirmMove.row.customerLabel,
                to: confirmMove.label,
              })}
            </p>
            <p className="text-warning text-xs">{t('move_warning')}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await assignListingToCustomer({
                      externalListingId: confirmMove.row.externalListingId,
                      customerId: confirmMove.customerId,
                      expectedOwnerId: confirmMove.row.customerId,
                    });
                    setNote(
                      r.ok ? t('moved_ok') : r.error === 'stale' ? t('stale') : t('assigned_fail'),
                    );
                    setConfirmMove(null);
                  })
                }
              >
                {t('move_confirm')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmMove(null)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmOff != null}
        onClose={() => setConfirmOff(null)}
        title={t('offboard_title')}
      >
        {confirmOff && (
          <div className="grid gap-3">
            <p className="text-sm">
              {t('offboard_body', {
                name: confirmOff.nickname ?? confirmOff.externalListingId,
                customer: confirmOff.customerLabel,
              })}
            </p>
            <p className="text-warning text-xs">{t('offboard_warning')}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await unassignListingFromCustomer({
                      externalListingId: confirmOff.externalListingId,
                      expectedCustomerId: confirmOff.customerId,
                    });
                    setNote(
                      r.ok
                        ? t('offboard_ok')
                        : r.error === 'stale'
                          ? t('stale')
                          : t('assigned_fail'),
                    );
                    setConfirmOff(null);
                  })
                }
              >
                {t('offboard_confirm')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmOff(null)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
