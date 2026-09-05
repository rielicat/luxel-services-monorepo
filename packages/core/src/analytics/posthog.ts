import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';

interface Capture {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}

interface PostHogLike {
  capture(payload: Capture): void;
}

const HOST = 'https://us.i.posthog.com';
const CLERK_ID_CACHE_MAX = 500;

let pending: Promise<PostHogLike | null> | null = null;
const clerkIdByCustomer = new Map<string, string | null>();

function projectKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ||
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ||
    process.env.POSTHOG_PROJECT_KEY?.trim() ||
    null
  );
}

export function posthogConfigured(): boolean {
  return projectKey() !== null;
}

function absoluteHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  return raw?.startsWith('http') ? raw : null;
}

function posthogClient(): Promise<PostHogLike | null> {
  const key = projectKey();
  if (!key) return Promise.resolve(null);
  pending ??= import('posthog-node')
    .then(
      ({ PostHog }) =>
        new PostHog(key, {
          host: absoluteHost() ?? HOST,
          flushAt: 1,
          flushInterval: 0,
        }) as PostHogLike,
    )
    .catch((err: unknown) => {
      console.error('analytics.posthog_unavailable', {
        message: err instanceof Error ? err.message : 'unknown',
      });
      return null;
    });
  return pending;
}

async function clerkIdFor(customerId: string): Promise<string | null> {
  const cached = clerkIdByCustomer.get(customerId);
  if (cached !== undefined) return cached;
  const { data } = await createSupabaseServiceRoleClient()
    .from('customers')
    .select('clerk_user_id')
    .eq('id', customerId)
    .maybeSingle();
  const clerkId = (data?.clerk_user_id as string | null) ?? null;
  if (clerkIdByCustomer.size >= CLERK_ID_CACHE_MAX) clerkIdByCustomer.clear();
  clerkIdByCustomer.set(customerId, clerkId);
  return clerkId;
}

export interface MirrorInput {
  event: string;
  distinctId?: string | null;
  anonId?: string | null;
  customerId?: string | null;
  path?: string | null;
  properties?: Record<string, unknown> | null;
  utm?: Record<string, string> | null;
  source?: string;
}

export async function mirrorToPostHog(input: MirrorInput): Promise<void> {
  const posthog = await posthogClient();
  if (!posthog) return;

  const resolved =
    input.distinctId ??
    (input.customerId ? await clerkIdFor(input.customerId) : null) ??
    input.anonId;
  if (!resolved) return;

  posthog.capture({
    distinctId: resolved,
    event: input.event,
    properties: {
      ...(input.properties ?? {}),
      ...(input.utm ?? {}),
      ...(input.path ? { $current_url: input.path } : {}),
      luxel_source: input.source ?? 'server',
      ...(input.customerId ? { customer_id: input.customerId } : {}),
    },
  });
}
