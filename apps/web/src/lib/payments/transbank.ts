import 'server-only';

const INTEGRATION = {
  baseUrl: 'https://webpay3gint.transbank.cl',
  commerceCode: '597055555532',
  apiKey: '579B532A7440BB0C9079DED94D31EA1615BB1234',
};
const PRODUCTION_BASE_URL = 'https://webpay3g.transbank.cl';
const API_PATH = '/rswebpaytransaction/api/webpay/v1.2/transactions';

interface TbkConfig {
  baseUrl: string;
  commerceCode: string;
  apiKey: string;
}

function getConfig(): TbkConfig {
  const commerceCode = process.env.TRANSBANK_COMMERCE_CODE;
  const apiKey = process.env.TRANSBANK_API_KEY;
  if (commerceCode && apiKey) {
    const integration = process.env.TRANSBANK_ENV === 'integration';
    return {
      baseUrl: integration ? INTEGRATION.baseUrl : PRODUCTION_BASE_URL,
      commerceCode,
      apiKey,
    };
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('TRANSBANK_COMMERCE_CODE / TRANSBANK_API_KEY not set');
  }
  return INTEGRATION;
}

function headers(cfg: TbkConfig): HeadersInit {
  return {
    'Tbk-Api-Key-Id': cfg.commerceCode,
    'Tbk-Api-Key-Secret': cfg.apiKey,
    'Content-Type': 'application/json',
  };
}

export async function createWebpayTransaction(input: {
  buyOrder: string;
  sessionId: string;
  amount: number;
  returnUrl: string;
}): Promise<{ token: string; url: string }> {
  const cfg = getConfig();
  const res = await fetch(`${cfg.baseUrl}${API_PATH}`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({
      buy_order: input.buyOrder,
      session_id: input.sessionId,
      amount: input.amount,
      return_url: input.returnUrl,
    }),
  });
  if (!res.ok) throw new Error(`Webpay create failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { token: string; url: string };
}

interface WebpayCommitResult {
  status: string;
  response_code: number;
  amount: number;
  buy_order: string;
  session_id: string;
  authorization_code?: string;
}

export async function commitWebpayTransaction(token: string): Promise<WebpayCommitResult> {
  const cfg = getConfig();
  const res = await fetch(`${cfg.baseUrl}${API_PATH}/${token}`, {
    method: 'PUT',
    headers: headers(cfg),
  });
  if (!res.ok) throw new Error(`Webpay commit failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as WebpayCommitResult;
}

export function isWebpayApproved(r: WebpayCommitResult): boolean {
  return r.status === 'AUTHORIZED' && r.response_code === 0;
}
