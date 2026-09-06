import Link from 'next/link';
import { Bot } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase';
import {
  Alert,
  Card,
  DataTable,
  EmptyRow,
  PageHeader,
  Pill,
  ghostButton,
  primaryButton,
} from '@/components/ui';
import { readLuxelPolicy } from '@luxel/core/agent/policy';
import {
  submitAiFlag,
  submitAiFlagForAll,
  submitAiFlagForSelection,
  submitLuxelPolicy,
} from './actions';

export const dynamic = 'force-dynamic';

const SELECTION_FORM = 'ai-selection';
const ALL_FORM = 'ai-all';

const ERROR_MESSAGE: Record<string, string> = {
  denied: 'No tienes permiso de operador. Vuelve a entrar.',
  invalid: 'La operación llegó mal formada. Nada cambió.',
  no_selection: 'Marca al menos una propiedad antes de aplicar el cambio.',
  write_failed: 'No pudimos guardar el cambio. Revisa los registros del servidor.',
};

const SELECTION_OPS = [
  { operation: 'ai_replies:true', label: 'Activar Lux' },
  { operation: 'ai_replies:false', label: 'Apagar Lux' },
  { operation: 'ai_reviews:true', label: 'Pedir revisión' },
  { operation: 'ai_reviews:false', label: 'Enviar sin revisar' },
] as const;

interface PropertyRow {
  id: string;
  nickname: string | null;
  comuna: string | null;
  owner_id: string;
  ai_replies: boolean;
  ai_reviews: boolean;
}

interface AiView {
  rows: PropertyRow[];
  owners: Record<string, string>;
  pending: Record<string, number>;
  needsHost: Record<string, number>;
  failed: boolean;
  threadsFailed: boolean;
}

async function getAiSettings(): Promise<AiView> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('properties')
    .select('id, nickname, comuna, owner_id, ai_replies, ai_reviews')
    .order('nickname', { ascending: true })
    .limit(500);

  if (error) {
    console.error('admin.ai_properties_failed', { message: error.message });
    return { rows: [], owners: {}, pending: {}, needsHost: {}, failed: true, threadsFailed: true };
  }

  const rows = (data ?? []) as unknown as PropertyRow[];
  if (!rows.length) {
    return { rows, owners: {}, pending: {}, needsHost: {}, failed: false, threadsFailed: false };
  }

  const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
  const propertyIds = rows.map((r) => r.id);

  const [customerRes, threadRes] = await Promise.all([
    supabase.from('customers').select('id, email, full_name').in('id', ownerIds),
    supabase.from('guest_threads').select('id, property_id, status').in('property_id', propertyIds),
  ]);

  const owners: Record<string, string> = {};
  for (const c of (customerRes.data ?? []) as unknown as {
    id: string;
    email: string;
    full_name: string | null;
  }[]) {
    owners[c.id] = c.full_name ?? c.email;
  }

  if (threadRes.error) {
    console.error('admin.ai_threads_failed', { message: threadRes.error.message });
    return { rows, owners, pending: {}, needsHost: {}, failed: false, threadsFailed: true };
  }

  const threads = (threadRes.data ?? []) as unknown as {
    id: string;
    property_id: string;
    status: string;
  }[];
  const propertyByThread: Record<string, string> = {};
  const needsHost: Record<string, number> = {};
  for (const t of threads) {
    propertyByThread[t.id] = t.property_id;
    if (t.status === 'needs_host') needsHost[t.property_id] = (needsHost[t.property_id] ?? 0) + 1;
  }

  const pending: Record<string, number> = {};
  if (threads.length) {
    const { data: draftData, error: draftError } = await supabase
      .from('guest_reply_drafts')
      .select('thread_id')
      .eq('status', 'pending')
      .in(
        'thread_id',
        threads.map((t) => t.id),
      );
    if (draftError) {
      console.error('admin.ai_drafts_failed', { message: draftError.message });
      return { rows, owners, pending: {}, needsHost, failed: false, threadsFailed: true };
    }
    for (const d of (draftData ?? []) as unknown as { thread_id: string }[]) {
      const propertyId = propertyByThread[d.thread_id];
      if (propertyId) pending[propertyId] = (pending[propertyId] ?? 0) + 1;
    }
  }

  return { rows, owners, pending, needsHost, failed: false, threadsFailed: false };
}

export default async function AiPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string; ok?: string }>;
}) {
  const { failed, ok } = await searchParams;
  const {
    rows,
    owners,
    pending,
    needsHost,
    failed: readFailed,
    threadsFailed,
  } = await getAiSettings();
  const policy = await readLuxelPolicy();
  const answering = rows.filter((r) => r.ai_replies).length;
  const reviewing = rows.filter((r) => r.ai_replies && r.ai_reviews).length;
  const pendingTotal = Object.values(pending).reduce((sum, n) => sum + n, 0);
  const changed = ok === undefined ? null : Number(ok);

  return (
    <div>
      <PageHeader icon={Bot} title="Respuestas de Lux">
        <p>
          {rows.length} propiedades · {answering} con Lux activo · {reviewing} esperando revisión
          {!threadsFailed && <> · {pendingTotal} borradores pendientes</>}
        </p>
        <p className="mt-1">
          Con revisión activa Lux redacta y no envía nada: un operador aprueba el texto en la{' '}
          <Link href="/inbox" className="text-primary hover:underline">
            bandeja de huéspedes
          </Link>
          . Sin revisión, Lux responde solo. Con Lux apagado, la conversación queda para una persona
          de Luxel.
        </p>
      </PageHeader>

      <Card id="policy" className="mb-6 p-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">Política de Luxel</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Lo que Lux debe saber para responder a cualquier huésped, en todas las propiedades: cuándo
          aceptamos un check-in temprano, qué hacemos ante una cancelación, hasta dónde llega un
          descuento. Va en cada conversación y manda sobre lo que Lux aprendió solo. Deja fuera
          códigos, contraseñas y datos de una persona.
        </p>
        <form action={submitLuxelPolicy} className="mt-3 grid gap-2">
          <textarea
            name="policy"
            defaultValue={policy}
            rows={8}
            maxLength={4000}
            placeholder="Una regla por línea."
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border p-2 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <div>
            <button
              type="submit"
              className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-semibold"
            >
              Guardar política
            </button>
          </div>
        </form>
      </Card>

      {readFailed && (
        <Alert tone="error">
          No se pudieron cargar las propiedades. Recarga la página o revisa los registros del
          servidor.
        </Alert>
      )}

      {!readFailed && threadsFailed && (
        <Alert tone="warning">
          No pudimos contar los borradores pendientes. Los interruptores siguen funcionando.
        </Alert>
      )}

      {failed && <Alert tone="error">{ERROR_MESSAGE[failed] ?? ERROR_MESSAGE.write_failed}</Alert>}

      {changed !== null && !Number.isNaN(changed) && (
        <Alert tone="ok">
          {changed === 1 ? 'Cambiamos 1 propiedad.' : `Cambiamos ${changed} propiedades.`}
        </Alert>
      )}

      {rows.length > 0 && (
        <Card className="mb-4 p-4">
          <p className="text-sm font-semibold">Cambio en lote</p>
          <p className="text-muted-foreground mb-3 text-sm">
            Marca las propiedades en la tabla y aplica el cambio a todas las marcadas. Los botones
            de la derecha alcanzan a cada propiedad importada, esté marcada o no.
          </p>
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <form id={SELECTION_FORM} action={submitAiFlagForSelection}>
              <p className="text-muted-foreground mb-1.5 text-xs font-semibold uppercase">
                A las marcadas
              </p>
              <div className="flex flex-wrap gap-2">
                {SELECTION_OPS.map((op) => (
                  <button
                    key={op.operation}
                    name="operation"
                    value={op.operation}
                    className={ghostButton}
                  >
                    {op.label}
                  </button>
                ))}
              </div>
            </form>

            <form id={ALL_FORM} action={submitAiFlagForAll}>
              <p className="text-muted-foreground mb-1.5 text-xs font-semibold uppercase">
                A todas
              </p>
              <div className="flex flex-wrap gap-2">
                <button name="operation" value="ai_reviews:true" className={primaryButton}>
                  Pedir revisión en todas
                </button>
                <button name="operation" value="ai_reviews:false" className={ghostButton}>
                  Enviar sin revisar en todas
                </button>
              </div>
            </form>
          </div>
        </Card>
      )}

      <DataTable
        head={[
          <span key="mark" className="sr-only">
            Marcar
          </span>,
          'Propiedad',
          'Anfitrión',
          'Lux responde',
          'Antes de enviar',
          'Pendientes',
        ]}
      >
        {rows.map((r) => (
          <tr key={r.id} id={`p-${r.id}`} className="border-border/60 hover:bg-muted/40 border-b">
            <td className="px-4 py-3">
              <input
                type="checkbox"
                form={SELECTION_FORM}
                name="ids"
                value={r.id}
                aria-label={`Marcar ${r.nickname ?? 'propiedad'}`}
                className="accent-primary h-4 w-4"
              />
            </td>
            <td className="px-4 py-3">
              <div className="font-medium">{r.nickname ?? '—'}</div>
              {r.comuna && <div className="text-muted-foreground text-xs">{r.comuna}</div>}
            </td>
            <td className="text-muted-foreground px-4 py-3">{owners[r.owner_id] ?? '—'}</td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <Pill tone={r.ai_replies ? 'converted' : 'lost'}>
                  {r.ai_replies ? 'Activo' : 'Apagado'}
                </Pill>
                <form action={submitAiFlag}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="flag" value="ai_replies" />
                  <input type="hidden" name="value" value={r.ai_replies ? 'false' : 'true'} />
                  <button className={ghostButton}>{r.ai_replies ? 'Apagar' : 'Activar'}</button>
                </form>
              </div>
            </td>
            <td className="px-4 py-3">
              {r.ai_replies ? (
                <div className="flex items-center gap-2">
                  <Pill tone={r.ai_reviews ? 'new' : 'contacted'}>
                    {r.ai_reviews ? 'Revisamos' : 'Envío directo'}
                  </Pill>
                  <form action={submitAiFlag}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="flag" value="ai_reviews" />
                    <input type="hidden" name="value" value={r.ai_reviews ? 'false' : 'true'} />
                    <button className={ghostButton}>
                      {r.ai_reviews ? 'Enviar sin revisar' : 'Pedir revisión'}
                    </button>
                  </form>
                </div>
              ) : (
                <span className="text-muted-foreground">Responde una persona</span>
              )}
            </td>
            <td className="px-4 py-3">
              {threadsFailed ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="tabular-nums">{pending[r.id] ?? 0} borradores</span>
                  {(needsHost[r.id] ?? 0) > 0 && (
                    <span className="text-warning text-xs font-semibold">
                      {needsHost[r.id]} para una persona
                    </span>
                  )}
                </div>
              )}
            </td>
          </tr>
        ))}
        {!rows.length && (
          <EmptyRow span={6}>
            {readFailed
              ? 'No se pudo leer la lista de propiedades.'
              : 'Todavía no hay propiedades importadas.'}
          </EmptyRow>
        )}
      </DataTable>
    </div>
  );
}
