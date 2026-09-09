// Integración real con Mercado Pago. El access token vive SOLO en el backend.
const MP_API = "https://api.mercadopago.com";

export function mpAccessToken(): string | undefined {
  return process.env["MERCADOPAGO_ACCESS_TOKEN"];
}

export function mpConfigured(): boolean {
  return Boolean(mpAccessToken());
}

async function mpFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = mpAccessToken();
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN no configurado");
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`Mercado Pago ${res.status}: ${text.slice(0, 500)}`);
  }
  return body;
}

export type PreferenceInput = {
  appointmentId: string;
  title: string;
  amount: number;
  payerEmail: string;
  baseUrl: string;
  secureToken: string;
  expiresAt: string;
};

export async function createPreference(input: PreferenceInput): Promise<{
  preferenceId: string;
  initPoint: string;
}> {
  const body = {
    items: [
      {
        id: input.appointmentId,
        title: input.title,
        quantity: 1,
        currency_id: "ARS",
        unit_price: Number(input.amount),
      },
    ],
    payer: { email: input.payerEmail },
    external_reference: input.appointmentId,
    expires: true,
    expiration_date_to: input.expiresAt,
    notification_url: `${input.baseUrl}/api/public/webhooks/mercadopago`,
    back_urls: {
      success: `${input.baseUrl}/turno/${input.secureToken}`,
      pending: `${input.baseUrl}/turno/${input.secureToken}`,
      failure: `${input.baseUrl}/turno/${input.secureToken}`,
    },
    auto_return: "approved",
  };
  const pref = await mpFetch("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { preferenceId: String(pref.id), initPoint: String(pref.init_point) };
}

export async function getPayment(paymentId: string): Promise<{
  id: string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
}> {
  return await mpFetch(`/v1/payments/${paymentId}`);
}

export async function getMerchantOrder(orderId: string): Promise<any> {
  return await mpFetch(`/merchant_orders/${orderId}`);
}

export async function createRefund(
  paymentId: string,
  amount?: number,
  idempotencyKey?: string,
): Promise<{ id: string; status: string; amount?: number }> {
  const res = await mpFetch(`/v1/payments/${paymentId}/refunds`, {
    method: "POST",
    body: JSON.stringify(amount != null ? { amount: Number(amount) } : {}),
    headers: idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {},
  });
  return { id: String(res.id), status: String(res.status ?? "approved"), amount: res.amount };
}
