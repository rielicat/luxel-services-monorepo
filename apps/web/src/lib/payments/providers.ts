import 'server-only';
import { devMockPaymentsEnabled } from './dev-mock';

export type PaymentProvider = 'mercadopago' | 'transbank' | 'stripe';

/**
 * The payment providers whose checkout would actually succeed in this environment
 * — so the booking form never offers a button that fails for a missing key.
 *
 * A provider is offered when its real credentials are configured, or the dev mock
 * is active, or (Transbank only) we're off production where its public
 * integration sandbox works without credentials. Order is the display order.
 */
export function availablePaymentProviders(): PaymentProvider[] {
  const isProd = process.env.NODE_ENV === 'production';
  const providers: PaymentProvider[] = [];

  if (Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN) || devMockPaymentsEnabled('mercadopago')) {
    providers.push('mercadopago');
  }
  if (
    Boolean(process.env.TRANSBANK_COMMERCE_CODE && process.env.TRANSBANK_API_KEY) ||
    !isProd // integration sandbox / dev mock work off production
  ) {
    providers.push('transbank');
  }
  if (Boolean(process.env.STRIPE_SECRET_KEY) || devMockPaymentsEnabled('stripe')) {
    providers.push('stripe');
  }

  return providers;
}
