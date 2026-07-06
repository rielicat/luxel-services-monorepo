'use client';

import { useState, useTransition } from 'react';
import { Plus, Check, X, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, Pill } from '@/components/ui';
import type { OperatorRow, OperationPointRow } from '@/lib/stats';
import { createOperator, setOperatorActive, renameOperator } from './actions';

export function CrewManager({
  operators,
  operationPoints,
}: {
  operators: OperatorRow[];
  operationPoints: OperationPointRow[];
}) {
  const [name, setName] = useState('');
  const [opId, setOpId] = useState(operationPoints[0]?.id ?? '');
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const add = () => {
    if (name.trim().length < 2 || !opId) return;
    startTransition(async () => {
      const r = await createOperator({ name, operationPointId: opId });
      if (r.ok) setName('');
    });
  };

  const toggle = (id: string, active: boolean) => {
    setBusyId(id);
    startTransition(async () => {
      await setOperatorActive({ id, active });
      setBusyId(null);
    });
  };

  const saveName = () => {
    if (!editing || editing.name.trim().length < 2) return;
    const { id, name: newName } = editing;
    setBusyId(id);
    startTransition(async () => {
      await renameOperator({ id, name: newName });
      setBusyId(null);
      setEditing(null);
    });
  };

  const inputCls =
    'border-border bg-background focus-visible:ring-primary h-9 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2';

  return (
    <div className="grid gap-5">
      {/* Add operator */}
      <Card>
        <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="grid gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Nombre</span>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Nombre del operador"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Punto de operación</span>
            <select className={inputCls} value={opId} onChange={(e) => setOpId(e.target.value)}>
              {operationPoints.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={add}
            disabled={pending || name.trim().length < 2 || !opId}
            className="bg-primary text-primary-foreground inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </div>
      </Card>

      {/* Operator list */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-xs uppercase">
                <th className="px-4 py-3 font-medium">Operador</th>
                <th className="px-4 py-3 font-medium">Punto de operación</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {operators.map((o) => {
                const busy = busyId === o.id;
                const isEditing = editing?.id === o.id;
                return (
                  <tr key={o.id} className="border-border/60 hover:bg-muted/40 border-b">
                    <td className="px-4 py-3 font-medium">
                      {isEditing ? (
                        <input
                          autoFocus
                          className={cn(inputCls, 'h-8')}
                          value={editing.name}
                          onChange={(e) => setEditing({ id: o.id, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveName();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                        />
                      ) : (
                        o.name
                      )}
                    </td>
                    <td className="text-muted-foreground px-4 py-3">{o.operation_point ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Pill tone={o.active ? 'confirmed' : 'lost'}>
                        {o.active ? 'Activo' : 'Inactivo'}
                      </Pill>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <IconBtn onClick={saveName} disabled={busy} title="Guardar">
                              <Check className="h-4 w-4" />
                            </IconBtn>
                            <IconBtn onClick={() => setEditing(null)} title="Cancelar">
                              <X className="h-4 w-4" />
                            </IconBtn>
                          </>
                        ) : (
                          <>
                            <IconBtn
                              onClick={() => setEditing({ id: o.id, name: o.name })}
                              title="Renombrar"
                            >
                              <Pencil className="h-4 w-4" />
                            </IconBtn>
                            <button
                              type="button"
                              onClick={() => toggle(o.id, !o.active)}
                              disabled={busy}
                              className="border-border hover:bg-accent rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {o.active ? 'Desactivar' : 'Activar'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!operators.length && (
                <tr>
                  <td colSpan={4} className="text-muted-foreground px-4 py-10 text-center">
                    Sin operadores. Agrega el primero arriba.
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

function IconBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}
