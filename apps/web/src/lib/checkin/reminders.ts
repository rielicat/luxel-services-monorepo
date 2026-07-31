import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendHospitableMessage } from '@/lib/channels/hospitable';
import { appUrl } from '@/lib/urls';
import { ACCESS_COLUMNS, hasDeliverableAccess, shapeAccess } from '@/lib/checkin/access';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any, 'public', any>;

const DAY = 86_400_000;
const shift = (isoDate: string, days: number) =>
  new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);

/** A claim older than this had its run die mid-send; another sweep may retake it. */
const CLAIM_GRACE_MS = 15 * 60_000;
/** The check-in link must have gone out in an EARLIER pass, never this one. */
const LINK_SETTLE_MS = 6 * 60 * 60_000;
/** How far back the arrival-day delivery still catches up after a missed sweep. */
const CATCHUP_DAYS = 2;

type Row = {
  id: string;
  token: string;
  reservation_uid: string;
  arrival_date: string;
  reminded_at: string | null;
  access_sent_at: string | null;
  reminder_claim_at: string | null;
  access_claim_at: string | null;
};

/**
 * Closes the gap between "we sent a check-in link" and "the guest can get in".
 *
 * Submitting the form was the ONLY way access ever reached a guest, and ignoring
 * the link is the ordinary outcome, not an edge case. Two passes fix that:
 *
 *  - the day before arrival, one nudge;
 *  - from arrival day on, a message pointing at the access itself.
 *
 * Both carry a LINK and never the access. Anything written into the guest thread
 * is re-imported by syncConversations as a `host` message and then replayed to
 * the AI as grounding for later guests of the property — so a door code posted
 * here would leak to every future guest. The check-in page reveals the code
 * behind the token instead (see page.tsx, which opens up on arrival day when the
 * host does not require identity documents).
 */
export async function remindAndDeliverAccess(
  supabase: Supabase,
  hospToken: string,
  propertyId: string,
  reservationIdByUid: Map<string, string>,
  today: string,
): Promise<{ reminded: number; delivered: number }> {
  let reminded = 0;
  let delivered = 0;

  const now = Date.now();
  const { data: rows } = await supabase
    .from('checkins')
    .select(
      'id, token, reservation_uid, arrival_date, reminded_at, access_sent_at, reminder_claim_at, access_claim_at',
    )
    .eq('property_id', propertyId)
    .eq('status', 'pending')
    .is('revoked_at', null)
    .not('reservation_uid', 'is', null)
    // Only stays whose link actually went out, and went out in an earlier pass.
    // A null notified_at is a silent backfill anchor: those guests booked before
    // the feature existed and must never be messaged.
    .not('notified_at', 'is', null)
    .lt('notified_at', new Date(now - LINK_SETTLE_MS).toISOString())
    .gte('arrival_date', shift(today, -CATCHUP_DAYS))
    .lte('arrival_date', shift(today, 1))
    // A stay already over never gets messaged, however stale its row.
    .gte('departure_date', today);
  if (!rows?.length) return { reminded, delivered };

  const [{ data: prop }, { data: accessRow }] = await Promise.all([
    supabase.from('properties').select('nickname').eq('id', propertyId).maybeSingle(),
    supabase
      .from('property_access')
      .select(ACCESS_COLUMNS)
      .eq('property_id', propertyId)
      .maybeSingle(),
  ]);
  const place = (prop?.nickname as string) ?? 'tu alojamiento';
  const access = shapeAccess(accessRow);

  // Nothing to promise: a property still on the default `physical_none`, or
  // keyless with no code, has no access to point at. Messaging "completa tu
  // check-in para recibir tu acceso" there is a promise we cannot keep.
  if (!hasDeliverableAccess(access)) return { reminded, delivered };

  for (const row of rows as Row[]) {
    const reservationId = reservationIdByUid.get(row.reservation_uid);
    if (!reservationId) continue;

    // Arrival day OR later within the catch-up window — deliver; strictly
    // before arrival — nudge.
    const arrivalDay = row.arrival_date <= today;
    const sentCol = arrivalDay ? 'access_sent_at' : 'reminded_at';
    const claimCol = arrivalDay ? 'access_claim_at' : 'reminder_claim_at';
    if (arrivalDay ? row.access_sent_at : row.reminded_at) continue;

    // Claim before sending: the lazy page-load sync and the scheduled one
    // overlap, and read-send-write would message the same guest twice. The
    // claim expires so a run that dies mid-send does not silence the row
    // forever — the one failure mode that leaves a guest at a door with nothing.
    const staleBefore = new Date(now - CLAIM_GRACE_MS).toISOString();
    const held = row[claimCol as 'access_claim_at' | 'reminder_claim_at'];
    if (held && held > staleBefore) continue;

    // Compare-and-set on the exact value we read, rather than an `.or()` filter:
    // PostgREST splits `or=(col.op.value)` on dots, and an ISO timestamp is full
    // of them, so the filter silently fails to parse. Matching the prior value
    // is also a stricter lock — two sweeps that both saw the same stale claim
    // cannot both win.
    const claim = supabase
      .from('checkins')
      .update({ [claimCol]: new Date().toISOString() })
      .eq('id', row.id)
      .is(sentCol, null);
    const { data: claimed } = await (
      held ? claim.eq(claimCol, held) : claim.is(claimCol, null)
    ).select('id');
    if (!claimed?.length) continue;

    const url = `${appUrl()}/checkin/${row.token}`;
    let ok = false;
    try {
      ok = Boolean(
        await sendHospitableMessage(
          hospToken,
          reservationId,
          arrivalDay
            ? `¡Hola! Llegas hoy a ${place}. Aquí están tus instrucciones de acceso: ${url}`
            : `¡Hola! Llegas mañana a ${place}. Completa tu check-in aquí para recibir tu acceso: ${url}`,
        ),
      );
    } catch {
      ok = false;
    }

    if (ok) {
      await supabase
        .from('checkins')
        .update({ [sentCol]: new Date().toISOString() })
        .eq('id', row.id);
      if (arrivalDay) delivered += 1;
      else reminded += 1;
    } else {
      // Release so the next sweep retries. Retries are bounded by the arrival
      // window itself: once the stay ends, the row drops out of the query.
      await supabase
        .from('checkins')
        .update({ [claimCol]: null })
        .eq('id', row.id);
    }
  }

  return { reminded, delivered };
}
