import OpenAI from 'openai';

const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

let client: OpenAI | null = null;
let clientKey: string | null = null;

function credential(): { apiKey: string; baseURL?: string } | null {
  const gateway = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (gateway) return { apiKey: gateway, baseURL: GATEWAY_BASE_URL };
  const direct = process.env.OPENAI_API_KEY?.trim();
  if (direct) return { apiKey: direct };
  return null;
}

export function gatewayTarget(): { url: string; key: string } | null {
  const key = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  return key ? { url: `${GATEWAY_BASE_URL}/chat/completions`, key } : null;
}

export function gatewayConfigured(): boolean {
  return credential() !== null;
}

export function usingGateway(): boolean {
  return credential()?.baseURL !== undefined;
}

export function getAgentModelClient(): OpenAI | null {
  const cred = credential();
  if (!cred) return null;
  if (!client || clientKey !== cred.apiKey) {
    client = new OpenAI(cred.baseURL ? { apiKey: cred.apiKey, baseURL: cred.baseURL } : cred);
    clientKey = cred.apiKey;
  }
  return client;
}

export function modelId(bare: string): string {
  return usingGateway() ? `openai/${bare}` : bare;
}
