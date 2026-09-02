import 'server-only';
import { devMockPaymentsEnabled } from './dev-mock';

type PaymentProvider = 'mercadopago' | 'transbank' | 'stripe';

export function availablePaymentProviders(): PaymentProvider[] {
  const isProd = process.env.NODE_ENV === 'production';
  const providers: PaymentProvider[] = [];

  if (Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN) || devMockPaymentsEnabled('mercadopago')) {
    providers.push('mercadopago');
  }
  if (Boolean(process.env.TRANSBANK_COMMERCE_CODE && process.env.TRANSBANK_API_KEY) || !isProd) {
    providers.push('transbank');
  }
  if (Boolean(process.env.STRIPE_SECRET_KEY) || devMockPaymentsEnabled('stripe')) {
    providers.push('stripe');
  }

  return providers;
}
