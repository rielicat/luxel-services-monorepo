import 'server-only';
import { createSupabasePublicClient } from './supabase/server';
import { unstable_cache } from 'next/cache';

export interface FaqEntry {
  id: string;
  question_key: string;
  answer_key: string;
  keywords: string[];
  priority: number;
}

export interface FaqMatch {
  questionKey: string;
  answerKey: string;
  score: number;
}

const ACCENT_MAP: Record<string, string> = {
  á: 'a',
  é: 'e',
  í: 'i',
  ó: 'o',
  ú: 'u',
  ü: 'u',
  ñ: 'n',
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ACCENT_MAP[c] ?? c)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const getFaqEntries = unstable_cache(
  async (): Promise<FaqEntry[]> => {
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from('faq_entries')
      .select('id, question_key, answer_key, keywords, priority')
      .eq('active', true)
      .order('priority', { ascending: false });
    return (data ?? []) as FaqEntry[];
  },
  ['faq-entries'],
  { revalidate: 600, tags: ['faq-entries'] },
);

/**
 * Naive keyword scorer: each matched keyword adds 1, weighted by priority.
 * Returns the best match if any keyword hit, else null.
 */
export function matchFaq(question: string, entries: FaqEntry[]): FaqMatch | null {
  const tokens = new Set(normalize(question).split(' ').filter(Boolean));
  if (tokens.size === 0) return null;

  let best: FaqMatch | null = null;
  for (const entry of entries) {
    let hits = 0;
    for (const kw of entry.keywords) {
      if (tokens.has(normalize(kw))) hits++;
    }
    if (hits === 0) continue;
    const score = hits + entry.priority / 1000;
    if (!best || score > best.score) {
      best = { questionKey: entry.question_key, answerKey: entry.answer_key, score };
    }
  }
  return best;
}
