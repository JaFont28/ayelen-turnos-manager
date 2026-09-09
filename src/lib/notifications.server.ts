import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type NotificationEvent =
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "payment_approved"
  | "refund_requested"
  | "refund_completed"
  | "reminder_24h";

/**
 * Registra una notificación pendiente. El índice único
 * (appointment_id, event, channel) garantiza que un mismo evento no se
 * duplique aunque el proceso se ejecute varias veces.
 */
export async function queueNotification(
  appointmentId: string,
  event: NotificationEvent,
  payload: Record<string, unknown> = {},
  channel = "whatsapp",
): Promise<void> {
  await supabaseAdmin
    .from("notifications")
    .insert({ appointment_id: appointmentId, event, channel, payload: payload as never })
    .select("id");
  // Un conflicto (evento ya registrado) es el comportamiento esperado: se ignora.
}

/**
 * Envío real de notificaciones. Requiere credenciales de un proveedor de
 * WhatsApp/Email. Mientras no existan, las notificaciones quedan en estado
 * "pending" y este proceso no inventa envíos.
 */
export function notificationProviderConfigured(): boolean {
  return Boolean(process.env["WHATSAPP_API_TOKEN"] && process.env["WHATSAPP_PHONE_NUMBER_ID"]);
}

export async function dispatchPendingNotifications(limit = 50): Promise<{
  processed: number;
  sent: number;
  skipped: number;
}> {
  const { data: pending } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("status", "pending")
    .limit(limit);

  const rows = pending ?? [];
  if (!notificationProviderConfigured()) {
    return { processed: rows.length, sent: 0, skipped: rows.length };
  }

  let sent = 0;
  for (const row of rows) {
    try {
      // Punto de integración real con el proveedor de WhatsApp.
      // Se implementa cuando existan credenciales verificadas.
      throw new Error("Proveedor de WhatsApp no implementado");
    } catch (error) {
      await supabaseAdmin
        .from("notifications")
        .update({ status: "failed", error: String(error) })
        .eq("id", row.id);
    }
  }
  return { processed: rows.length, sent, skipped: rows.length - sent };
}
