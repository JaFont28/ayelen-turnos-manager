import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = z.string().regex(/^\d{2}:\d{2}$/);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Verifica que quien llama sea la profesional. La primera cuenta creada en el
 * backend se promueve automáticamente (no existe registro público).
 */
async function assertAdmin(userId: string): Promise<void> {
  const db = await admin();
  const { data: profile } = await db
    .from("profiles")
    .select("id, is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.is_admin) return;

  const { count } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", true);
  if ((count ?? 0) === 0) {
    await db.from("profiles").upsert({ id: userId, is_admin: true }).eq("id", userId);
    return;
  }
  throw new Error("Acceso no autorizado");
}

function fail(error: unknown): never {
  throw new Error(error instanceof Error ? error.message : "Error inesperado");
}

const adminFn = (method: "GET" | "POST" = "POST") =>
  createServerFn({ method }).middleware([requireSupabaseAuth]);

export const adminMe = adminFn("GET").handler(async ({ context }) => {
  await assertAdmin(context.userId);
  return { userId: context.userId, isAdmin: true as const };
});

export const adminSummary = adminFn("GET").handler(async ({ context }) => {
  await assertAdmin(context.userId);
  const { expirePendingBookings } = await import("./booking.server");
  const { todayBA } = await import("./time");
  await expirePendingBookings();
  const db = await admin();
  const today = todayBA();
  const [confirmed, pending, todays, pendingNotifications] = await Promise.all([
    db.from("appointments").select("id", { count: "exact", head: true }).eq("status", "confirmed").gte("date", today),
    db.from("appointments").select("id", { count: "exact", head: true }).eq("status", "payment_pending"),
    db.from("appointments").select("id", { count: "exact", head: true }).eq("date", today).eq("status", "confirmed"),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return {
    today,
    upcomingConfirmed: confirmed.count ?? 0,
    paymentPending: pending.count ?? 0,
    todayAppointments: todays.count ?? 0,
    pendingNotifications: pendingNotifications.count ?? 0,
  };
});

export const adminListAppointments = adminFn("GET")
  .inputValidator((input: unknown) =>
    z
      .object({
        from: dateStr.optional(),
        to: dateStr.optional(),
        status: z.string().optional(),
        modality: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { expirePendingBookings } = await import("./booking.server");
    await expirePendingBookings();
    const db = await admin();
    let query = db
      .from("appointments")
      .select(
        "id, date, start_time, end_time, modality, consultation_type, age_group, status, secure_token, created_by_admin, patients(first_name, last_name, email, phone), payments(status, amount, provider_payment_id)",
      )
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(500);
    if (data.from) query = query.gte("date", data.from);
    if (data.to) query = query.lte("date", data.to);
    if (data.status) query = query.eq("status", data.status as never);
    if (data.modality) query = query.eq("modality", data.modality as never);
    const { data: rows, error } = await query;
    if (error) fail(error);
    return rows ?? [];
  });

export const adminCreateAppointment = adminFn()
  .inputValidator((input: unknown) =>
    z
      .object({
        firstName: z.string().trim().min(2).max(80),
        lastName: z.string().trim().min(2).max(80),
        email: z.string().trim().email(),
        phone: z.string().trim().min(6).max(40),
        date: dateStr,
        startTime: timeStr,
        modality: z.enum(["presencial", "virtual"]),
        consultationType: z.enum(["primera_entrevista", "seguimiento"]),
        ageGroup: z.enum(["adulto", "adolescente", "infancia"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { createManualAppointment } = await import("./booking.server");
    try {
      const id = await createManualAppointment(data);
      return { id };
    } catch (error) {
      fail(error);
    }
  });

export const adminCancelAppointment = adminFn()
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { cancelAppointment } = await import("./booking.server");
    try {
      return await cancelAppointment(data.id, { bySelfService: false });
    } catch (error) {
      fail(error);
    }
  });

export const adminRescheduleAppointment = adminFn()
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), date: dateStr, startTime: timeStr }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { rescheduleAppointment } = await import("./booking.server");
    try {
      await rescheduleAppointment(data.id, data.date, data.startTime, { enforceWindow: false });
      return { ok: true as const };
    } catch (error) {
      fail(error);
    }
  });

export const adminAvailabilityCalendar = adminFn("GET")
  .inputValidator((input: unknown) => z.object({ from: dateStr, to: dateStr }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { computeAvailability } = await import("./booking.server");
    return await computeAvailability(data.from, data.to);
  });

// ---------- Disponibilidad semanal ----------
export const adminListAvailability = adminFn("GET").handler(async ({ context }) => {
  await assertAdmin(context.userId);
  const db = await admin();
  const { data } = await db
    .from("availability")
    .select("id, weekday, start_time, is_active")
    .order("weekday")
    .order("start_time");
  return data ?? [];
});

export const adminSetAvailability = adminFn()
  .inputValidator((input: unknown) =>
    z
      .object({ weekday: z.number().int().min(1).max(5), startTime: timeStr, isActive: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const db = await admin();
    const { error } = await db
      .from("availability")
      .upsert(
        { weekday: data.weekday, start_time: data.startTime, is_active: data.isActive },
        { onConflict: "weekday,start_time" },
      );
    if (error) fail(error);
    return { ok: true as const };
  });

export const adminDeleteAvailability = adminFn()
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const db = await admin();
    await db.from("availability").delete().eq("id", data.id);
    return { ok: true as const };
  });

// ---------- Bloqueos ----------
export const adminListBlocks = adminFn("GET").handler(async ({ context }) => {
  await assertAdmin(context.userId);
  const { todayBA } = await import("./time");
  const db = await admin();
  const { data } = await db
    .from("blocked_slots")
    .select("id, date, start_time, reason")
    .gte("date", todayBA())
    .order("date");
  return data ?? [];
});

export const adminCreateBlock = adminFn()
  .inputValidator((input: unknown) =>
    z
      .object({ date: dateStr, startTime: timeStr.nullable().optional(), reason: z.string().max(200).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const db = await admin();
    let existing = db
      .from("appointments")
      .select("id, start_time")
      .eq("date", data.date)
      .in("status", ["payment_pending", "confirmed"]);
    if (data.startTime) existing = existing.eq("start_time", data.startTime);
    const { data: conflicts } = await existing;

    const { error } = await db.from("blocked_slots").insert({
      date: data.date,
      start_time: data.startTime ?? null,
      reason: data.reason ?? null,
    });
    if (error && error.code !== "23505") fail(error);

    return {
      ok: true as const,
      warning:
        (conflicts?.length ?? 0) > 0
          ? `Atención: ya existen ${conflicts!.length} turno(s) activo(s) en esa fecha. No se cancelaron automáticamente.`
          : null,
    };
  });

export const adminDeleteBlock = adminFn()
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const db = await admin();
    await db.from("blocked_slots").delete().eq("id", data.id);
    return { ok: true as const };
  });

// ---------- Pagos y reembolsos ----------
export const adminListPayments = adminFn("GET").handler(async ({ context }) => {
  await assertAdmin(context.userId);
  const db = await admin();
  const { data } = await db
    .from("payments")
    .select(
      "id, amount, currency, status, provider, provider_payment_id, created_at, appointment_id, appointments(date, start_time, status, patients(first_name, last_name, email)), refunds(id, status, amount)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  return data ?? [];
});

export const adminRefund = adminFn()
  .inputValidator((input: unknown) =>
    z.object({ paymentId: z.string().uuid(), amount: z.number().positive().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { requestRefund } = await import("./booking.server");
    const db = await admin();
    const { data: payment } = await db
      .from("payments")
      .select("id, appointment_id, amount, status")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!payment) fail(new Error("Pago no encontrado"));
    if (payment.status !== "approved") fail(new Error("Sólo se reembolsan pagos aprobados"));
    const amount = data.amount ?? Number(payment.amount);
    if (amount > Number(payment.amount)) fail(new Error("El monto supera el pago"));
    try {
      return await requestRefund(payment.id, payment.appointment_id, amount, "decisión de la profesional");
    } catch (error) {
      fail(error);
    }
  });

// ---------- Precios y configuración ----------
export const adminGetSettings = adminFn("GET").handler(async ({ context }) => {
  await assertAdmin(context.userId);
  const { getSettings } = await import("./booking.server");
  return await getSettings();
});

export const adminUpdateSettings = adminFn()
  .inputValidator((input: unknown) =>
    z
      .object({
        professional_name: z.string().trim().min(2).max(120).optional(),
        license: z.string().trim().max(40).optional(),
        whatsapp: z.string().trim().max(60).optional(),
        email: z.string().trim().max(160).optional(),
        instagram: z.string().trim().max(200).optional(),
        address: z.string().trim().max(200).optional(),
        price_presencial: z.number().min(0).optional(),
        price_virtual: z.number().min(0).optional(),
        hold_minutes: z.number().int().min(5).max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const db = await admin();
    const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const { error } = await db.from("site_settings").update(patch as never).eq("id", true);
    if (error) fail(error);
    return { ok: true as const };
  });

export const adminListNotifications = adminFn("GET").handler(async ({ context }) => {
  await assertAdmin(context.userId);
  const db = await admin();
  const { data } = await db
    .from("notifications")
    .select("id, event, status, channel, created_at, sent_at, appointment_id")
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
});
