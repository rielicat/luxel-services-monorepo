import 'server-only';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

let cached: { client: MercadoPagoConfig; preference: Preference; payment: Payment } | null = null;

export function getMercadoPago() {
  if (cached) return cached;
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN not set');
  const client = new MercadoPagoConfig({ accessToken: token });
  cached = {
    client,
    preference: new Preference(client),
    payment: new Payment(client),
  };
  return cached;
}
