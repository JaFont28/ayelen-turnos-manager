import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de Mercado Pago. Nunca confía en el payload: siempre consulta el
 * estado real del pago en la API. El procesamiento es idempotente.
 */
async function verifySignature(request: Request, dataId: string | null): Promise<boolean> {
  const secret = process.env["MERCADOPAGO_WEBHOOK_SECRET"];
  if (!secret) return true; // sin secreto configurado no se puede verificar
  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id") ?? "";
  if (!signature) return false;
  const parts = Object.fromEntries(
    signature.split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1 || !dataId) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        const type = body?.type ?? body?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
        const dataId =
          body?.data?.id?.toString() ??
          url.searchParams.get("data.id") ??
          url.searchParams.get("id") ??
          null;

        if (!(await verifySignature(request, dataId))) {
          return new Response("Invalid signature", { status: 401 });
        }
        if (!dataId) return new Response("ok", { status: 200 });

        try {
          const { getPayment, getMerchantOrder, mpConfigured } = await import(
            "@/lib/mercadopago.server"
          );
          if (!mpConfigured()) return new Response("not configured", { status: 503 });
          const { processMercadoPagoPayment } = await import("@/lib/booking.server");

          if (type === "payment") {
            const payment = await getPayment(dataId);
            await processMercadoPagoPayment(payment);
          } else if (type === "merchant_order") {
            const order = await getMerchantOrder(dataId);
            for (const p of order?.payments ?? []) {
              const payment = await getPayment(String(p.id));
              await processMercadoPagoPayment(payment);
            }
          }
          return new Response("ok", { status: 200 });
        } catch (error) {
          console.error("mercadopago webhook", error);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
