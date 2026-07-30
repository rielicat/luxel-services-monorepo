'use client';

import { useState, useTransition } from 'react';
import { Check, X, Link2, Sparkles, RefreshCw, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  runProbes,
  debugCheckinLink,
  debugCleaningLink,
  debugAutoAssign,
  type ProbeResult,
  type DebugProperty,
} from './actions';

const LABELS: Record<string, string> = {
  channel: 'Cuenta central (Airbnb/PMS)',
  pricelabs: 'Motor de precios',
  email: 'Correo transaccional',
  whatsapp: 'Puente WhatsApp',
  assignments: 'Asignaciones',
};

export function DebugBench({
  probes: initialProbes,
  properties,
}: {
  probes: ProbeResult[];
  properties: DebugProperty[];
}) {
  const [pending, start] = useTransition();
  const [probes, setProbes] = useState(initialProbes);
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [link, setLink] = useState<{ label: string; url: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const selectCls =
    'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2';

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-display font-semibold">Integraciones</p>
              <p className="text-muted-foreground text-xs">
                Estado real de cada sistema del que depende el producto.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await runProbes();
                  if (r.probes) setProbes(r.probes);
                })
              }
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Revisar
            </Button>
          </div>
          {probes.map((p) => (
            <div
              key={p.name}
              className="border-border flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{LABELS[p.name] ?? p.name}</p>
                <p className="text-muted-foreground text-xs">{p.detail}</p>
              </div>
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                  p.ok ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning',
                )}
              >
                {p.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {p.ok ? 'OK' : 'Revisar'}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:p-5">
          <div>
            <p className="font-display font-semibold">Enlaces de prueba</p>
            <p className="text-muted-foreground text-xs">
              Genera lo que reciben huéspedes y personal de aseo, para revisarlo tal cual lo ven
              ellos. En producción estos enlaces salen solos.
            </p>
          </div>

          <select
            className={selectCls}
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            aria-label="Propiedad"
          >
            {properties.length === 0 && <option value="">Sin propiedades</option>}
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname} · {p.owner}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending || !propertyId}
              onClick={() =>
                start(async () => {
                  const r = await debugCheckinLink({ propertyId });
                  setLink(r.ok && r.url ? { label: 'Check-in del huésped', url: r.url } : null);
                  setNote(r.ok ? null : 'No se pudo generar el enlace de check-in.');
                })
              }
            >
              <Link2 className="mr-1 h-3.5 w-3.5" /> Check-in de huésped
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !propertyId}
              onClick={() =>
                start(async () => {
                  const r = await debugCleaningLink({ propertyId });
                  setLink(r.ok && r.url ? { label: 'Confirmación de aseo', url: r.url } : null);
                  setNote(
                    r.ok
                      ? null
                      : r.error === 'no_cleaning'
                        ? 'Esta propiedad no tiene aseos próximos.'
                        : 'No se pudo generar el enlace de aseo.',
                  );
                })
              }
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Confirmación de aseo
            </Button>
          </div>

          {note && <p className="text-warning text-xs">{note}</p>}
          {link && (
            <div className="bg-muted/50 grid gap-1.5 rounded-md p-2.5">
              <p className="text-xs font-medium">{link.label}</p>
              <div className="flex items-center gap-2">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary min-w-0 flex-1 truncate font-mono text-xs hover:underline"
                >
                  {link.url}
                </a>
                <button
                  type="button"
                  aria-label="Copiar"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => void navigator.clipboard.writeText(link.url)}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:p-5">
          <div>
            <p className="font-display font-semibold">Atribución automática</p>
            <p className="text-muted-foreground text-xs">
              Corre la asignación por correo de la cuenta del anfitrión sin esperar al cron.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="justify-self-start"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await debugAutoAssign();
                setNote(
                  r.ok
                    ? `Asignadas ${r.assigned}; quedan ${r.ambiguous} para revisión manual.`
                    : 'No se pudo ejecutar la atribución.',
                );
              })
            }
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Ejecutar ahora
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
