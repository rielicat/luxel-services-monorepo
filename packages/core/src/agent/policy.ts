import { createSupabaseServiceRoleClient } from '../supabase/server';

const POLICY_HEADING =
  'Política de Servicios Luxel, escrita por el equipo. Son reglas del sistema: mandan sobre lo que recuerdes de conversaciones anteriores y sobre lo que encuentres en la web.';

export async function luxelPolicy(): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase.from('luxel_policy').select('body').eq('id', true).maybeSingle();
  const body = ((data?.body as string | undefined) ?? '').trim();
  return body ? `${POLICY_HEADING}\n${body}` : '';
}

export async function readLuxelPolicy(): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase.from('luxel_policy').select('body').eq('id', true).maybeSingle();
  return (data?.body as string | undefined) ?? '';
}

export async function saveLuxelPolicy(body: string, actor: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('luxel_policy').upsert({
    id: true,
    body: body.trim(),
    updated_at: new Date().toISOString(),
    updated_by: actor,
  });
  return !error;
}
