import 'server-only';
import Stripe from 'stripe';

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  // Let the SDK pin the default API version it ships with.
  cached = new Stripe(key);
  return cached;
}
