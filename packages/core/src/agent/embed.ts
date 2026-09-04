import OpenAI from 'openai';

export const EMBEDDING_MODEL = 'text-embedding-3-small';

export const EMBEDDING_DIMENSIONS = 1536;

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI();
  return client;
}

export async function embed(text: string): Promise<number[] | null> {
  const input = text.trim();
  if (!input) return null;
  const openai = getClient();
  if (!openai) return null;
  try {
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: input.slice(0, 8000),
      dimensions: EMBEDDING_DIMENSIONS,
    });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    console.error('agent.embed_failed', {
      model: EMBEDDING_MODEL,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
