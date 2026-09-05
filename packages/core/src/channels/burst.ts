export interface BurstRow {
  id: string;
  body: string | null;
}

export interface Burst {
  ids: string[];
  text: string;
}

export function coalesceBurst(newestFirst: readonly BurstRow[]): Burst {
  const ordered = newestFirst
    .map((row) => ({ id: row.id, body: (row.body ?? '').trim() }))
    .filter((row) => row.body.length > 0)
    .reverse();
  return { ids: ordered.map((row) => row.id), text: ordered.map((row) => row.body).join('\n') };
}
