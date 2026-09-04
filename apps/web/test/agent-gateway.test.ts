import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { gatewayConfigured, modelId, usingGateway } from '@luxel/core/agent/gateway';

const KEYS = ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'OPENAI_API_KEY'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('agent model credential', () => {
  it('prefers the gateway key and namespaces the model', () => {
    process.env.AI_GATEWAY_API_KEY = 'gw';
    expect(gatewayConfigured()).toBe(true);
    expect(usingGateway()).toBe(true);
    expect(modelId('gpt-5.6-terra')).toBe('openai/gpt-5.6-terra');
    expect(modelId('text-embedding-3-small')).toBe('openai/text-embedding-3-small');
  });

  it('accepts Vercel OIDC when no gateway key is set', () => {
    process.env.VERCEL_OIDC_TOKEN = 'oidc';
    expect(usingGateway()).toBe(true);
    expect(modelId('gpt-5.6-terra')).toBe('openai/gpt-5.6-terra');
  });

  it('falls back to a direct key and stops namespacing', () => {
    process.env.OPENAI_API_KEY = 'sk-local';
    expect(gatewayConfigured()).toBe(true);
    expect(usingGateway()).toBe(false);
    expect(modelId('gpt-5.6-terra')).toBe('gpt-5.6-terra');
  });

  it('reports nothing configured when no credential exists', () => {
    expect(gatewayConfigured()).toBe(false);
    expect(usingGateway()).toBe(false);
  });

  it('ignores a blank credential rather than sending it', () => {
    process.env.AI_GATEWAY_API_KEY = '   ';
    process.env.OPENAI_API_KEY = 'sk-local';
    expect(usingGateway()).toBe(false);
  });
});
