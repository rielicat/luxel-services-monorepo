import { Sparkles, Video, PackageSearch, AlertTriangle, ScanSearch } from 'lucide-react';
import {
  CLEANING_CHECKLIST_STEPS,
  parseChecklistSteps,
  parseInventoryDifferences,
  parseInventoryItems,
  type InventoryDifference,
  type InventoryItem,
} from '@luxel/shared/cleaning-inventory';
import { parseFindings, type ReviewFinding } from '@luxel/shared/cleaning-review';
import { createServiceClient } from '@/lib/supabase';
import { cleaningMediaConfigured } from '@/lib/media';
import {
  CHECKLIST_TABLE,
  CLEANINGS_LIMIT,
  CLEANINGS_TABLE,
  DRAFT_STATUS_LABEL,
  DRAFT_TABLE,
  HISTORY_DAYS,
  INVENTORY_SOURCE_LABEL,
  INVENTORY_TABLE,
  WALKTHROUGH_TABLE,
  clock,
  conditionLabel,
  megabytes,
  santiagoToday,
  shiftDays,
  statusLabel,
  statusTone,
} from '@/lib/cleanings';
import {
  FINDING_KIND_LABEL,
  FINDING_SOURCE_LABEL,
  REVIEW_REASON_LABEL,
  REVIEW_STALE_MINUTES,
  REVIEW_TABLE,
  reviewStatusLabel,
  reviewStatusTone,
  reviewStuck,
} from '@/lib/review';
import { Card, Pill, SectionTitle } from '@/components/ui';
import { WalkthroughPlayer } from './walkthrough-player';
import { RetryReview } from './retry-review';

export const dynamic = 'force-dynamic';

const dateText = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

interface CleaningRow {
  id: string;
  property_id: string;
  cleaning_date: string;
  status: string;
  crew_confirmed_at: string | null;
  crew_declined_at: string | null;
}

interface WalkthroughView {
  id: string;
  status: string;
  bytes: number | null;
  durationSeconds: number | null;
  recordedByName: string | null;
  playable: boolean;
}

interface ReviewView {
  id: string;
  status: string;
  reason: string | null;
  attempts: number;
  findings: ReviewFinding[];
  stuck: boolean;
}

interface CleaningView {
  id: string;
  date: string;
  status: string;
  crew: 'confirmed' | 'declined' | 'silent';
  steps: number;
  walkthrough: WalkthroughView | null;
  draftStatus: string | null;
  confirmedSource: 'ai' | 'crew' | null;
  confirmedItems: InventoryItem[];
  confirmedNote: string | null;
  confirmedByName: string | null;
  differences: InventoryDifference[];
  review: ReviewView | null;
}

interface PropertyView {
  id: string;
  nickname: string;
  comuna: string | null;
  cleanings: CleaningView[];
}

export default async function CleaningsPage() {
  const supabase = createServiceClient();
  const since = shiftDays(santiagoToday(), -HISTORY_DAYS);

  const { data: cleaningRows } = await supabase
    .from(CLEANINGS_TABLE)
    .select('id, property_id, cleaning_date, status, crew_confirmed_at, crew_declined_at')
    .gte('cleaning_date', since)
    .order('cleaning_date', { ascending: false })
    .limit(CLEANINGS_LIMIT);
  const cleanings = (cleaningRows ?? []) as unknown as CleaningRow[];
  const ids = cleanings.map((row) => row.id);
  const propertyIds = [...new Set(cleanings.map((row) => row.property_id))];

  const [properties, walkthroughs, inventories, drafts, checklists, reviews] = await Promise.all([
    propertyIds.length
      ? supabase.from('properties').select('id, nickname, comuna').in('id', propertyIds)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase
          .from(WALKTHROUGH_TABLE)
          .select('id, cleaning_id, status, bytes, duration_seconds, recorded_by_name, object_key')
          .in('cleaning_id', ids)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase
          .from(INVENTORY_TABLE)
          .select('cleaning_id, source, items, note, confirmed_by_name')
          .in('cleaning_id', ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from(DRAFT_TABLE).select('cleaning_id, status, differences').in('cleaning_id', ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from(CHECKLIST_TABLE).select('cleaning_id, done_steps').in('cleaning_id', ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase
          .from(REVIEW_TABLE)
          .select('id, cleaning_id, status, reason, attempts, findings, updated_at')
          .in('cleaning_id', ids)
      : Promise.resolve({ data: [] }),
  ]);

  const propertyById = new Map(
    (
      (properties.data ?? []) as unknown as Array<{
        id: string;
        nickname: string;
        comuna: string | null;
      }>
    ).map((row) => [row.id, row]),
  );

  const walkthroughByCleaning = new Map<string, WalkthroughView>();
  for (const row of (walkthroughs.data ?? []) as unknown as Array<{
    id: string;
    cleaning_id: string;
    status: string;
    bytes: number | null;
    duration_seconds: number | null;
    recorded_by_name: string | null;
    object_key: string | null;
  }>) {
    if (row.status !== 'stored' && row.status !== 'purged') continue;
    if (walkthroughByCleaning.has(row.cleaning_id)) continue;
    walkthroughByCleaning.set(row.cleaning_id, {
      id: row.id,
      status: row.status,
      bytes: row.bytes,
      durationSeconds: row.duration_seconds,
      recordedByName: row.recorded_by_name,
      playable: Boolean(row.object_key),
    });
  }

  const inventoryByCleaning = new Map(
    (
      (inventories.data ?? []) as unknown as Array<{
        cleaning_id: string;
        source: string;
        items: unknown;
        note: string | null;
        confirmed_by_name: string | null;
      }>
    ).map((row) => [row.cleaning_id, row]),
  );
  const draftByCleaning = new Map(
    (
      (drafts.data ?? []) as unknown as Array<{
        cleaning_id: string;
        status: string;
        differences: unknown;
      }>
    ).map((row) => [row.cleaning_id, row]),
  );
  const stepsByCleaning = new Map(
    (
      (checklists.data ?? []) as unknown as Array<{
        cleaning_id: string;
        done_steps: unknown;
      }>
    ).map((row) => [row.cleaning_id, parseChecklistSteps(row.done_steps).length]),
  );

  const reviewByCleaning = new Map(
    (
      (reviews.data ?? []) as unknown as Array<{
        id: string;
        cleaning_id: string;
        status: string;
        reason: string | null;
        attempts: number;
        findings: unknown;
        updated_at: string | null;
      }>
    ).map((row) => [
      row.cleaning_id,
      {
        id: row.id,
        status: row.status,
        reason: row.reason,
        attempts: Number(row.attempts ?? 0),
        findings: parseFindings(row.findings),
        stuck: reviewStuck(row.status, row.updated_at),
      } satisfies ReviewView,
    ]),
  );

  const grouped = new Map<string, PropertyView>();
  for (const row of cleanings) {
    const property = propertyById.get(row.property_id);
    if (!property) continue;
    if (!grouped.has(row.property_id)) {
      grouped.set(row.property_id, {
        id: property.id,
        nickname: property.nickname,
        comuna: property.comuna,
        cleanings: [],
      });
    }
    const inventory = inventoryByCleaning.get(row.id);
    const draft = draftByCleaning.get(row.id);
    grouped.get(row.property_id)!.cleanings.push({
      id: row.id,
      date: row.cleaning_date,
      status: row.status,
      crew: row.crew_confirmed_at ? 'confirmed' : row.crew_declined_at ? 'declined' : 'silent',
      steps: stepsByCleaning.get(row.id) ?? 0,
      walkthrough: walkthroughByCleaning.get(row.id) ?? null,
      draftStatus: (draft?.status as string | undefined) ?? null,
      confirmedSource: inventory ? (inventory.source === 'ai' ? 'ai' : 'crew') : null,
      confirmedItems: inventory ? parseInventoryItems(inventory.items) : [],
      confirmedNote: inventory?.note ?? null,
      confirmedByName: inventory?.confirmed_by_name ?? null,
      differences: draft ? parseInventoryDifferences(draft.differences) : [],
      review: reviewByCleaning.get(row.id) ?? null,
    });
  }

  const views = [...grouped.values()].sort((a, b) => a.nickname.localeCompare(b.nickname, 'es'));
  const mediaReady = cleaningMediaConfigured();

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <SectionTitle>
            <Sparkles className="h-4 w-4" /> Aseos
          </SectionTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Los últimos {HISTORY_DAYS} días y lo que viene. Solo Luxel ve esto: el anfitrión nunca
            ve el equipo ni el video.
          </p>
        </div>
        {!mediaReady && (
          <Pill tone="new">Falta LUXEL_WORKER_URL o INTERNAL_SEND_TOKEN: no hay video</Pill>
        )}
      </div>

      {views.length === 0 && (
        <Card className="p-5">
          <p className="text-muted-foreground text-sm">
            Todavía no hay aseos en esta ventana. Se crean solos con cada salida importada.
          </p>
        </Card>
      )}

      {views.map((property) => (
        <Card key={property.id} className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display font-semibold">{property.nickname}</h3>
            {property.comuna && (
              <span className="text-muted-foreground text-xs">{property.comuna}</span>
            )}
          </div>

          <ul className="mt-3 grid gap-3">
            {property.cleanings.map((cleaning) => (
              <li key={cleaning.id} className="border-border rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold capitalize">
                    {dateText(cleaning.date)}
                  </span>
                  <Pill tone={statusTone(cleaning.status)}>{statusLabel(cleaning.status)}</Pill>
                  <span className="text-muted-foreground text-xs">
                    {cleaning.crew === 'confirmed'
                      ? 'El equipo confirmó'
                      : cleaning.crew === 'declined'
                        ? 'El equipo dijo que no puede'
                        : 'Sin respuesta del equipo'}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Pasos: {cleaning.steps} de {CLEANING_CHECKLIST_STEPS.length}
                  </span>
                </div>

                <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Video className="h-3.5 w-3.5" />
                  {cleaning.walkthrough
                    ? [
                        cleaning.walkthrough.status === 'purged'
                          ? 'Video borrado por retención'
                          : 'Video guardado',
                        megabytes(cleaning.walkthrough.bytes),
                        clock(cleaning.walkthrough.durationSeconds),
                        cleaning.walkthrough.recordedByName,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Sin video'}
                </p>
                {cleaning.walkthrough?.playable && mediaReady && (
                  <WalkthroughPlayer walkthroughId={cleaning.walkthrough.id} />
                )}

                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <PackageSearch className="h-3.5 w-3.5" />
                  {cleaning.confirmedSource ? (
                    <span className="text-success font-semibold">
                      {INVENTORY_SOURCE_LABEL[cleaning.confirmedSource]} ·{' '}
                      {cleaning.confirmedItems.length} cosas
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {cleaning.draftStatus
                        ? (DRAFT_STATUS_LABEL[cleaning.draftStatus] ?? cleaning.draftStatus)
                        : 'Sin inventario'}
                    </span>
                  )}
                </p>

                {cleaning.differences.length > 0 && (
                  <ul className="text-warning mt-2 grid gap-0.5 text-xs">
                    {cleaning.differences.map((difference, index) => (
                      <li key={`${cleaning.id}-diff-${index}`} className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          {[difference.room, difference.name].filter(Boolean).join(' · ')}
                          {difference.detail ? ` — ${difference.detail}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {cleaning.review && (
                  <div className="border-border mt-2 rounded-lg border border-dashed p-2">
                    <p className="flex flex-wrap items-center gap-2 text-xs">
                      <ScanSearch className="h-3.5 w-3.5" />
                      <Pill tone={reviewStatusTone(cleaning.review.status)}>
                        {reviewStatusLabel(cleaning.review.status)}
                      </Pill>
                      {cleaning.review.reason && (
                        <span className="text-muted-foreground">
                          {REVIEW_REASON_LABEL[cleaning.review.reason] ?? cleaning.review.reason}
                        </span>
                      )}
                      {cleaning.review.attempts > 0 && (
                        <span className="text-muted-foreground">
                          Intentos: {cleaning.review.attempts}
                        </span>
                      )}
                    </p>
                    {cleaning.review.findings.length > 0 ? (
                      <ul className="text-warning mt-2 grid gap-0.5 text-xs">
                        {cleaning.review.findings.map((finding, index) => (
                          <li
                            key={`${cleaning.id}-finding-${index}`}
                            className="flex items-start gap-1.5"
                          >
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>
                              <strong>{FINDING_KIND_LABEL[finding.kind] ?? finding.kind}</strong>{' '}
                              {[finding.room, finding.name].filter(Boolean).join(' · ')}
                              {finding.detail ? ` — ${finding.detail}` : ''}
                              <span className="text-muted-foreground">
                                {' '}
                                ({FINDING_SOURCE_LABEL[finding.source] ?? finding.source})
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      cleaning.review.status === 'done' && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Nada que reportar contra el aseo anterior.
                        </p>
                      )
                    )}
                    {cleaning.review.stuck && (
                      <p className="text-warning mt-1 text-xs">
                        Detenida: sin avance hace más de {REVIEW_STALE_MINUTES} minutos. La pasada
                        de la noche la vuelve a tomar, o la reintentas aquí.
                      </p>
                    )}
                    {(cleaning.review.status === 'failed' || cleaning.review.stuck) && (
                      <RetryReview runId={cleaning.review.id} />
                    )}
                  </div>
                )}

                {cleaning.confirmedItems.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-muted-foreground cursor-pointer text-xs font-semibold">
                      Ver el inventario confirmado
                      {cleaning.confirmedByName ? ` · ${cleaning.confirmedByName}` : ''}
                    </summary>
                    <ul className="mt-2 grid gap-1 text-xs">
                      {cleaning.confirmedItems.map((item, index) => (
                        <li
                          key={`${cleaning.id}-item-${index}`}
                          className="flex justify-between gap-3"
                        >
                          <span>{[item.room, item.name].filter(Boolean).join(' · ')}</span>
                          <span className="text-muted-foreground shrink-0">
                            {item.observed} · {conditionLabel(item.condition)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {cleaning.confirmedNote && (
                      <p className="text-muted-foreground mt-2 text-xs">{cleaning.confirmedNote}</p>
                    )}
                  </details>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
