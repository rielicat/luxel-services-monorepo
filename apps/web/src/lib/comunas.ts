/**
 * Fetches the list of comunas for Región Metropolitana (code 13)
 * from Chile's official DPA API. Cached for one week since this data
 * almost never changes.
 */

export interface Comuna {
  codigo: string;
  nombre: string;
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/(?:^|\s|-)\S/g, (c) => c.toUpperCase());
}

export async function getComunasSantiago(): Promise<Comuna[]> {
  try {
    const res = await fetch('https://apis.digital.gob.cl/dpa/regiones/13/comunas', {
      next: { revalidate: 604800 }, // 7 days
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ codigo: string; nombre: string }>;
    return data
      .map((c) => ({ codigo: c.codigo, nombre: toTitleCase(c.nombre) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  } catch {
    return [];
  }
}
