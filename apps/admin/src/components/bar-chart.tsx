interface Datum {
  label: string;
  value: number;
}

/** Minimal in-house bar chart (no chart library) — responsive flex bars. */
export function BarChart({ data }: { data: Datum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const first = data[0]?.label ?? '';
  const last = data[data.length - 1]?.label ?? '';

  return (
    <div>
      <div className="flex h-36 items-end gap-1">
        {data.map((d, i) => (
          <div key={i} className="flex h-full flex-1 items-end" title={`${d.label}: ${d.value}`}>
            <div
              className="bg-primary/75 hover:bg-primary w-full rounded-t transition-colors"
              style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="text-muted-foreground mt-2 flex justify-between text-xs">
        <span>{first}</span>
        <span>máx {max}</span>
        <span>{last}</span>
      </div>
    </div>
  );
}
