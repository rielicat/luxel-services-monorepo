import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { redactSecrets } from './redact';

export interface Grounding {
  source: 'property' | 'global' | 'none';
  text: string;
}

// Strip emails/phones so cross-user snippets never carry contact PII.
function scrub(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[correo]')
    .replace(/\+?\d[\d .-]{7,}\d/g, '[teléfono]')
    .slice(0, 300);
}

type Row = { thread_id: string; source: string; body: string; created_at: string };

/** Pairs each guest question with the reply that followed it (host or AI), in
 *  chronological order per thread — the "experience" the model learns from. */
function pairQA(rows: Row[], secrets: readonly string[]): string[] {
  const byThread = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byThread.get(r.thread_id) ?? [];
    list.push(r);
    byThread.set(r.thread_id, list);
  }
  const clean = (s: string) => scrub(redactSecrets(s, secrets));
  const pairs: string[] = [];
  for (const list of byThread.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (let i = 0; i < list.length - 1; i++) {
      const q = list[i];
      const a = list[i + 1];
      if (q?.source === 'guest' && a && (a.source === 'host' || a.source === 'ai')) {
        pairs.push(`P: ${clean(q.body)}\nR: ${clean(a.body)}`);
      }
    }
  }
  return pairs;
}

type Supabase = ReturnType<typeof createSupabaseServiceRoleClient>;

/** Every value that opens a door or a wifi network — for one property, or for
 *  all of them when the fallback reads other properties' threads: another
 *  host's door code is no less a leak for being someone else's. */
async function accessSecrets(supabase: Supabase, propertyId: string | null): Promise<string[]> {
  const codes = supabase
    .from('property_access')
    .select('keyless_code')
    .not('keyless_code', 'is', null);
  const details = supabase
    .from('properties')
    .select('listing_details')
    .not('listing_details', 'is', null);
  const [{ data: access }, { data: props }] = await Promise.all([
    propertyId ? codes.eq('property_id', propertyId) : codes,
    propertyId ? details.eq('id', propertyId) : details,
  ]);
  const out: string[] = [];
  for (const a of access ?? []) if (a.keyless_code) out.push(String(a.keyless_code));
  for (const p of props ?? []) {
    const pw = (p.listing_details as { wifi_password?: string | null } | null)?.wifi_password;
    if (pw) out.push(pw);
  }
  return out;
}

/**
 * Grounding for a guest reply: learned answers + past conversations (guest
 * question → host/AI answer) of THIS property. When the property has no history
 * yet, falls back to anonymized Q→A experience from other properties on the
 * platform ("context of other users"), scrubbed of contact data and marked as
 * generic so the model won't quote another property's specifics as fact.
 */
export async function buildGrounding(propertyId: string): Promise<Grounding> {
  const supabase = createSupabaseServiceRoleClient();

  const [{ data: learned }, { data: ownThreads }, secrets] = await Promise.all([
    supabase
      .from('learned_answers')
      .select('question, answer')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('guest_threads').select('id').eq('property_id', propertyId),
    accessSecrets(supabase, propertyId),
  ]);
  const ownIds = (ownThreads ?? []).map((t) => t.id as string);

  let ownPairs: string[] = [];
  if (ownIds.length) {
    const { data: msgs } = await supabase
      .from('guest_messages')
      .select('thread_id, source, body, created_at')
      .in('thread_id', ownIds)
      .order('created_at', { ascending: false })
      .limit(200);
    ownPairs = pairQA((msgs ?? []) as Row[], secrets).slice(-24);
  }

  const learnedBlock = (learned ?? []).map(
    (l) => `P: ${redactSecrets(l.question, secrets)}\nR: ${redactSecrets(l.answer, secrets)}`,
  );

  if (learnedBlock.length || ownPairs.length) {
    return {
      source: 'property',
      text: [
        'Experiencia previa de ESTE alojamiento (usa estas respuestas como referencia directa):',
        ...learnedBlock,
        ...ownPairs,
      ].join('\n'),
    };
  }

  // Fallback: anonymized experience from the rest of the platform.
  const [{ data: globalMsgs }, { data: globalLearned }, allSecrets] = await Promise.all([
    supabase
      .from('guest_messages')
      .select('thread_id, source, body, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('learned_answers')
      .select('question, answer')
      .order('created_at', { ascending: false })
      .limit(10),
    accessSecrets(supabase, null),
  ]);
  const globalPairs = pairQA((globalMsgs ?? []) as Row[], allSecrets).slice(-12);
  const globalBlock = (globalLearned ?? []).map(
    (l) =>
      `P: ${scrub(redactSecrets(l.question, allSecrets))}\nR: ${scrub(redactSecrets(l.answer, allSecrets))}`,
  );

  if (!globalPairs.length && !globalBlock.length) return { source: 'none', text: '' };
  return {
    source: 'global',
    text: [
      'Este alojamiento aún no tiene historial. Como referencia GENÉRICA, así se han resuelto consultas similares en otros alojamientos (NO cites datos específicos de otras propiedades como si fueran de esta):',
      ...globalBlock,
      ...globalPairs,
    ].join('\n'),
  };
}
