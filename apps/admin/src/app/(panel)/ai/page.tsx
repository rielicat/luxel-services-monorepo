import { Bot } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase';
import { Card, Pill } from '@/components/ui';
import { submitAiFlag, submitAiFlagForAll } from './actions';

export const dynamic = 'force-dynamic';

interface PropertyRow {
  id: string;
  nickname: string | null;
  comuna: string | null;
  owner_id: string;
  ai_enabled: boolean;
  ai_review: boolean;
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
    .select('id, nickname, comuna, owner_id, ai_enabled, ai_review')
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

function inboxUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_WEB_URL ?? '').trim().replace(/\/$/, '');
  return base ? `${base}/admin/inbox` : null;
}

export default async function AiPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string }>;
}) {
  const { failed: failedId } = await searchParams;
  const { rows, owners, pending, needsHost, failed, threadsFailed } = await getAiSettings();
  const answering = rows.filter((r) => r.ai_enabled).length;
  const reviewing = rows.filter((r) => r.ai_enabled && r.ai_review).length;
  const pendingTotal = Object.values(pending).reduce((sum, n) => sum + n, 0);
  const inbox = inboxUrl();

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Bot className="text-primary h-5 w-5" /> Respuestas de Lux
        </h1>
        <p className="text-muted-foreground text-sm">
          {rows.length} propiedades · {answering} con Lux activo · {reviewing} esperando revisión
          {!threadsFailed && <> · {pendingTotal} borradores pendientes</>}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Con revisión activa Lux redacta y no envía nada: un operador aprueba el texto
          {inbox ? (
            <>
              {' '}
              en la{' '}
              <a href={inbox} className="text-primary hover:underline">
                bandeja de huéspedes
              </a>
              .
            </>
          ) : (
            <> en la bandeja de huéspedes de la app web.</>
          )}{' '}
          Sin revisión, Lux responde solo. Con Lux apagado, la conversación queda para una persona
          de Luxel.
        </p>
      </div>

      {failed && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-xl border px-4 py-3 text-sm font-medium"
        >
          No se pudieron cargar las propiedades. Recarga la página o revisa los registros del
          servidor.
        </div>
      )}

      {!failed && threadsFailed && (
        <div
          role="alert"
          className="border-warning/40 bg-warning/10 text-warning mb-4 rounded-xl border px-4 py-3 text-sm font-medium"
        >
          No pudimos contar los borradores pendientes. Los interruptores siguen funcionando.
        </div>
      )}

      {failedId === 'all' && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-xl border px-4 py-3 text-sm font-medium"
        >
          No se pudo aplicar el cambio a todas las propiedades. Nada cambió.
        </div>
      )}

      {rows.length > 0 && (
        <Card className="mb-4 p-4">
          <p className="text-sm font-semibold">Aplicar a todas</p>
          <p className="text-muted-foreground mb-3 text-sm">
            Útil al empezar: deja todo en revisión mientras leas lo que Lux contesta.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={submitAiFlagForAll}>
              <input type="hidden" name="flag" value="ai_review" />
              <input type="hidden" name="value" value="true" />
              <button className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold">
                Pedir revisión en todas
              </button>
            </form>
            <form action={submitAiFlagForAll}>
              <input type="hidden" name="flag" value="ai_review" />
              <input type="hidden" name="value" value="false" />
              <button className="border-border hover:bg-accent rounded-lg border px-3 py-1.5 text-xs font-semibold">
                Enviar sin revisar en todas
              </button>
            </form>
          </div>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-xs uppercase">
                <th className="px-4 py-3 font-medium">Propiedad</th>
                <th className="px-4 py-3 font-medium">Anfitrión</th>
                <th className="px-4 py-3 font-medium">Lux responde</th>
                <th className="px-4 py-3 font-medium">Antes de enviar</th>
                <th className="px-4 py-3 font-medium">Pendientes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  id={`p-${r.id}`}
                  className="border-border/60 hover:bg-muted/40 border-b"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.nickname ?? '—'}</div>
                    {r.comuna && <div className="text-muted-foreground text-xs">{r.comuna}</div>}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">{owners[r.owner_id] ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Pill tone={r.ai_enabled ? 'converted' : 'lost'}>
                        {r.ai_enabled ? 'Activo' : 'Apagado'}
                      </Pill>
                      <form action={submitAiFlag}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="flag" value="ai_enabled" />
                        <input type="hidden" name="value" value={r.ai_enabled ? 'false' : 'true'} />
                        <button className="border-border hover:bg-accent rounded-lg border px-3 py-1.5 text-xs font-semibold">
                          {r.ai_enabled ? 'Apagar' : 'Activar'}
                        </button>
                      </form>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.ai_enabled ? (
                      <div className="flex items-center gap-2">
                        <Pill tone={r.ai_review ? 'new' : 'contacted'}>
                          {r.ai_review ? 'Revisamos' : 'Envío directo'}
                        </Pill>
                        <form action={submitAiFlag}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="flag" value="ai_review" />
                          <input
                            type="hidden"
                            name="value"
                            value={r.ai_review ? 'false' : 'true'}
                          />
                          <button className="border-border hover:bg-accent rounded-lg border px-3 py-1.5 text-xs font-semibold">
                            {r.ai_review ? 'Enviar sin revisar' : 'Pedir revisión'}
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
                    {failedId === r.id && (
                      <p className="text-destructive mt-1 text-xs font-semibold">
                        No se pudo actualizar
                      </p>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-4 py-10 text-center">
                    {failed
                      ? 'No se pudo leer la lista de propiedades.'
                      : 'Todavía no hay propiedades importadas.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
