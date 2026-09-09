import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  addDays,
  endTimeOf,
  hhmm,
  hoursUntil,
  isWeekend,
  isoWeekday,
  slotInstant,
  todayBA,
} from "./time";
import type { AgeGroup, ConsultationType, Modality } from "./domain";
import { CANCELLATION_WINDOW_HOURS } from "./domain";
import { queueNotification } from "./notifications.server";
import { createPreference, createRefund, mpConfigured } from "./mercadopago.server";

export class BusinessError extends Error {}

const ACTIVE_STATUSES = ["payment_pending", "confirmed"] as const;

export async function getSettings() {
  const { data, error } = await supabaseAdmin
    .from("site_settings")
    .select("*")
    .eq("id", true)
    .single();
  if (error) throw error;
  return data;
}

/** Marca como expiradas las reservas payment_pending vencidas y libera el horario. */
export async function expirePendingBookings(): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .update({ status: "expired" })
    .eq("status", "payment_pending")
    .lt("expires_at", nowIso)
    .select("id");
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length > 0) {
    await supabaseAdmin
      .from("payments")
      .update({ status: "expired" })
      .in("appointment_id", ids)
      .eq("status", "pending");
  }
  return ids.length;
}

export type DayAvailability = { date: string; slots: string[] };

/**
 * Disponibilidad calculada dinámicamente en el backend:
 * agenda base - fines de semana - fechas pasadas - bloqueos - ocupados.
 */
export async function computeAvailability(
  fromDate: string,
  toDate: string,
  options: { ignoreAppointmentId?: string } = {},
): Promise<DayAvailability[]> {
  await expirePendingBookings();

  const today = todayBA();
  const start = fromDate < today ? today : fromDate;
  if (start > toDate) return [];

  const [{ data: availability }, { data: blocks }, { data: taken }] = await Promise.all([
    supabaseAdmin.from("availability").select("weekday, start_time").eq("is_active", true),
    supabaseAdmin.from("blocked_slots").select("date, start_time").gte("date", start).lte("date", toDate),
    supabaseAdmin
      .from("appointments")
      .select("id, date, start_time, status")
      .in("status", ACTIVE_STATUSES as unknown as string[])
      .gte("date", start)
      .lte("date", toDate),
  ]);

  const byWeekday = new Map<number, string[]>();
  for (const row of availability ?? []) {
    if (row.weekday > 5) continue; // sábado y domingo nunca son reservables
    const list = byWeekday.get(row.weekday) ?? [];
    list.push(hhmm(row.start_time));
    byWeekday.set(row.weekday, list);
  }

  const fullDayBlocked = new Set<string>();
  const blockedSlots = new Set<string>();
  for (const b of blocks ?? []) {
    if (b.start_time == null) fullDayBlocked.add(b.date);
    else blockedSlots.add(`${b.date}|${hhmm(b.start_time)}`);
  }

  const occupied = new Set<string>();
  for (const a of taken ?? []) {
    if (options.ignoreAppointmentId && a.id === options.ignoreAppointmentId) continue;
    occupied.add(`${a.date}|${hhmm(a.start_time)}`);
  }

  const now = Date.now();
  const result: DayAvailability[] = [];
  for (let date = start; date <= toDate; date = addDays(date, 1)) {
    if (isWeekend(date)) continue;
    if (fullDayBlocked.has(date)) continue;
    const base = (byWeekday.get(isoWeekday(date)) ?? []).slice().sort();
    const slots = base.filter(
      (time) =>
        !blockedSlots.has(`${date}|${time}`) &&
        !occupied.has(`${date}|${time}`) &&
        slotInstant(date, time).getTime() > now,
    );
    if (slots.length > 0) result.push({ date, slots });
  }
  return result;
}

/** Valida un horario contra TODAS las reglas de negocio (server-side). */
export async function assertSlotBookable(
  date: string,
  startTime: string,
  options: { ignoreAppointmentId?: string } = {},
): Promise<void> {
  const time = hhmm(startTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BusinessError("Fecha inválida");
  if (isWeekend(date)) throw new BusinessError("No se atiende sábados ni domingos");
  if (slotInstant(date, time).getTime() <= Date.now())
    throw new BusinessError("El horario ya pasó");

  const day = await computeAvailability(date, date, options);
  const slots = day[0]?.slots ?? [];
  if (!slots.includes(time))
    throw new BusinessError("El horario no está disponible");
}

export type BookingInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  date: string;
  startTime: string;
  modality: Modality;
  consultationType: ConsultationType;
  ageGroup: AgeGroup;
};

async function upsertPatient(input: BookingInput): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const { data: existing } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    await supabaseAdmin
      .from("patients")
      .update({
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        phone: input.phone.trim(),
      })
      .eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await supabaseAdmin
    .from("patients")
    .insert({
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      email,
      phone: input.phone.trim(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

function priceFor(settings: { price_presencial: number; price_virtual: number }, m: Modality) {
  return Number(m === "presencial" ? settings.price_presencial : settings.price_virtual);
}

/** Reserva pública: crea appointment payment_pending + pago + preferencia de Mercado Pago. */
export async function createPendingBooking(
  input: BookingInput,
  baseUrl: string,
): Promise<{ secureToken: string; checkoutUrl: string | null; amount: number }> {
  await assertSlotBookable(input.date, input.startTime);
  const settings = await getSettings();
  const amount = priceFor(settings, input.modality);
  if (!(amount > 0)) throw new BusinessError("Los precios aún no fueron configurados");

  const patientId = await upsertPatient(input);
  const expiresAt = new Date(Date.now() + settings.hold_minutes * 60_000).toISOString();
  const time = hhmm(input.startTime);

  const { data: appointment, error } = await supabaseAdmin
    .from("appointments")
    .insert({
      patient_id: patientId,
      date: input.date,
      start_time: time,
      end_time: endTimeOf(time),
      modality: input.modality,
      consultation_type: input.consultationType,
      age_group: input.ageGroup,
      status: "payment_pending",
      expires_at: expiresAt,
    })
    .select("id, secure_token")
    .single();

  if (error) {
    // El índice único parcial resuelve la condición de carrera: sólo uno gana.
    if (error.code === "23505") throw new BusinessError("Ese horario acaba de ser reservado");
    throw error;
  }

  const { data: payment, error: payErr } = await supabaseAdmin
    .from("payments")
    .insert({
      appointment_id: appointment.id,
      provider: "mercadopago",
      amount,
      currency: "ARS",
      status: "pending",
    })
    .select("id")
    .single();
  if (payErr) throw payErr;

  if (!mpConfigured()) {
    return { secureToken: appointment.secure_token, checkoutUrl: null, amount };
  }

  try {
    const pref = await createPreference({
      appointmentId: appointment.id,
      title: `Consulta psicológica ${input.modality}`,
      amount,
      payerEmail: input.email.trim().toLowerCase(),
      baseUrl,
      secureToken: appointment.secure_token,
      expiresAt,
    });
    await supabaseAdmin
      .from("payments")
      .update({ provider_preference_id: pref.preferenceId })
      .eq("id", payment.id);
    return { secureToken: appointment.secure_token, checkoutUrl: pref.initPoint, amount };
  } catch (mpError) {
    // Si Mercado Pago falla, liberamos el horario en vez de dejarlo bloqueado.
    await supabaseAdmin.from("appointments").update({ status: "expired" }).eq("id", appointment.id);
    await supabaseAdmin.from("payments").update({ status: "expired" }).eq("id", payment.id);
    throw new BusinessError(`No se pudo iniciar el pago: ${String(mpError)}`);
  }
}

/** Turno manual del administrador: mismas reglas, sin Mercado Pago. */
export async function createManualAppointment(input: BookingInput): Promise<string> {
  await assertSlotBookable(input.date, input.startTime);
  const patientId = await upsertPatient(input);
  const time = hhmm(input.startTime);
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .insert({
      patient_id: patientId,
      date: input.date,
      start_time: time,
      end_time: endTimeOf(time),
      modality: input.modality,
      consultation_type: input.consultationType,
      age_group: input.ageGroup,
      status: "confirmed",
      created_by_admin: true,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new BusinessError("Ese horario ya está ocupado");
    throw error;
  }
  await queueNotification(data.id, "appointment_confirmed", { manual: true });
  return data.id;
}

const MP_TO_PAYMENT_STATUS: Record<string, string> = {
  approved: "approved",
  authorized: "pending",
  in_process: "pending",
  in_mediation: "pending",
  pending: "pending",
  rejected: "rejected",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "refunded",
};

/** Procesamiento idempotente de un pago de Mercado Pago. */
export async function processMercadoPagoPayment(mp: {
  id: string;
  status: string;
  external_reference?: string;
  transaction_amount?: number;
}): Promise<{ handled: boolean; reason?: string }> {
  const appointmentId = mp.external_reference;
  if (!appointmentId) return { handled: false, reason: "sin external_reference" };

  const { data: appointment } = await supabaseAdmin
    .from("appointments")
    .select("id, status")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appointment) return { handled: false, reason: "turno inexistente" };

  const status = MP_TO_PAYMENT_STATUS[mp.status] ?? "pending";

  const { data: existing } = await supabaseAdmin
    .from("payments")
    .select("id, status")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.status === status && status === "approved") {
      return { handled: true, reason: "ya procesado" };
    }
    await supabaseAdmin
      .from("payments")
      .update({ provider_payment_id: String(mp.id), status: status as never })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("payments").insert({
      appointment_id: appointmentId,
      provider: "mercadopago",
      provider_payment_id: String(mp.id),
      amount: Number(mp.transaction_amount ?? 0),
      currency: "ARS",
      status: status as never,
    });
  }

  if (status === "approved" && appointment.status === "payment_pending") {
    await supabaseAdmin
      .from("appointments")
      .update({ status: "confirmed", expires_at: null })
      .eq("id", appointmentId)
      .eq("status", "payment_pending");
    await queueNotification(appointmentId, "payment_approved", { payment_id: String(mp.id) });
    await queueNotification(appointmentId, "appointment_confirmed", {});
  }

  if ((status === "rejected" || status === "cancelled") && appointment.status === "payment_pending") {
    await supabaseAdmin
      .from("appointments")
      .update({ status: "expired" })
      .eq("id", appointmentId)
      .eq("status", "payment_pending");
  }

  return { handled: true };
}

export type AppointmentDetail = Awaited<ReturnType<typeof getAppointmentByToken>>;

export async function getAppointmentByToken(token: string) {
  if (!token || token.length < 32) throw new BusinessError("Enlace inválido");
  await expirePendingBookings();
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, date, start_time, end_time, modality, consultation_type, age_group, status, expires_at, secure_token, patients(first_name, last_name, email, phone), payments(id, amount, currency, status, provider_payment_id, provider_preference_id), refunds(id, status, amount)",
    )
    .eq("secure_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BusinessError("Turno no encontrado");

  const hours = hoursUntil(data.date, data.start_time);
  return {
    id: data.id,
    date: data.date,
    startTime: hhmm(data.start_time),
    endTime: hhmm(data.end_time),
    modality: data.modality,
    consultationType: data.consultation_type,
    ageGroup: data.age_group,
    status: data.status,
    expiresAt: data.expires_at,
    secureToken: data.secure_token,
    patient: data.patients,
    payment: data.payments?.[0] ?? null,
    refund: data.refunds?.[0] ?? null,
    hoursUntil: hours,
    canSelfManage: hours >= CANCELLATION_WINDOW_HOURS && data.status === "confirmed",
  };
}

/** Cancelación. Con >= 12 h de anticipación dispara reembolso automático. */
export async function cancelAppointment(
  appointmentId: string,
  opts: { bySelfService: boolean },
): Promise<{ refundRequested: boolean; message: string }> {
  const { data: appointment, error } = await supabaseAdmin
    .from("appointments")
    .select("id, date, start_time, status, payments(id, status, provider_payment_id, amount)")
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) throw error;
  if (!appointment) throw new BusinessError("Turno no encontrado");
  if (appointment.status === "cancelled") return { refundRequested: false, message: "El turno ya estaba cancelado" };
  if (!["payment_pending", "confirmed"].includes(appointment.status))
    throw new BusinessError("El turno no puede cancelarse");

  const hours = hoursUntil(appointment.date, appointment.start_time);

  const { error: updErr } = await supabaseAdmin
    .from("appointments")
    .update({ status: "cancelled", expires_at: null })
    .eq("id", appointmentId)
    .in("status", ["payment_pending", "confirmed"]);
  if (updErr) throw updErr;
  await queueNotification(appointmentId, "appointment_cancelled", {});

  const payment = appointment.payments?.[0] ?? null;
  const eligible = hours >= CANCELLATION_WINDOW_HOURS && payment?.status === "approved";
  if (!eligible) {
    return {
      refundRequested: false,
      message:
        hours < CANCELLATION_WINDOW_HOURS
          ? "Turno cancelado. Faltan menos de 12 horas, el reembolso queda a decisión de la profesional."
          : "Turno cancelado.",
    };
  }

  await requestRefund(payment!.id, appointmentId, Number(payment!.amount), "cancelación con 12h o más");
  return { refundRequested: true, message: "Turno cancelado. Se solicitó el reembolso total." };
}

/** Reembolso idempotente: el índice único impide procesar dos veces el mismo pago. */
export async function requestRefund(
  paymentId: string,
  appointmentId: string,
  amount: number,
  reason: string,
): Promise<{ status: string }> {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, provider_payment_id, amount, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) throw new BusinessError("Pago no encontrado");
  if (payment.status === "refunded") return { status: "refunded" };

  const { data: refund, error } = await supabaseAdmin
    .from("refunds")
    .insert({
      payment_id: paymentId,
      appointment_id: appointmentId,
      amount,
      status: "pending",
      reason,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { status: "already_requested" };
    throw error;
  }

  await queueNotification(appointmentId, "refund_requested", { amount });

  if (!payment.provider_payment_id || !mpConfigured()) {
    await supabaseAdmin.from("refunds").update({ status: "requested" }).eq("id", refund.id);
    return { status: "requested" };
  }

  try {
    const total = Number(payment.amount);
    const partial = amount < total;
    const result = await createRefund(
      payment.provider_payment_id,
      partial ? amount : undefined,
      refund.id,
    );
    const done = result.status === "approved" || result.status === "refunded";
    await supabaseAdmin
      .from("refunds")
      .update({
        provider_refund_id: result.id,
        status: done ? (partial ? "partial" : "refunded") : "requested",
      })
      .eq("id", refund.id);
    if (done) {
      await supabaseAdmin
        .from("payments")
        .update({ status: partial ? "partially_refunded" : "refunded" })
        .eq("id", paymentId);
      await queueNotification(appointmentId, "refund_completed", { amount });
    }
    return { status: done ? "refunded" : "requested" };
  } catch (mpError) {
    await supabaseAdmin
      .from("refunds")
      .update({ status: "failed", error: null, reason: `${reason} | ${String(mpError)}` })
      .eq("id", refund.id);
    return { status: "failed" };
  }
}

/** Reprogramación: revalida disponibilidad y conserva el pago existente. */
export async function rescheduleAppointment(
  appointmentId: string,
  newDate: string,
  newStartTime: string,
  opts: { enforceWindow: boolean },
): Promise<void> {
  const { data: appointment } = await supabaseAdmin
    .from("appointments")
    .select("id, date, start_time, status")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appointment) throw new BusinessError("Turno no encontrado");
  if (!["payment_pending", "confirmed"].includes(appointment.status))
    throw new BusinessError("El turno no puede reprogramarse");
  if (opts.enforceWindow && hoursUntil(appointment.date, appointment.start_time) < CANCELLATION_WINDOW_HOURS)
    throw new BusinessError("Faltan menos de 12 horas: contactá a la profesional para reprogramar");

  const time = hhmm(newStartTime);
  await assertSlotBookable(newDate, time, { ignoreAppointmentId: appointmentId });

  const { error } = await supabaseAdmin
    .from("appointments")
    .update({ date: newDate, start_time: time, end_time: endTimeOf(time) })
    .eq("id", appointmentId);
  if (error) {
    if (error.code === "23505") throw new BusinessError("Ese horario acaba de ser ocupado");
    throw error;
  }
  await queueNotification(appointmentId, "appointment_rescheduled", { date: newDate, time });
}

/** Recordatorios ~24 h antes, sin duplicados (índice único por evento). */
export async function queueReminders(): Promise<number> {
  const now = new Date();
  const from = new Date(now.getTime() + 23 * 3_600_000);
  const to = new Date(now.getTime() + 25 * 3_600_000);
  const { data } = await supabaseAdmin
    .from("appointments")
    .select("id, date, start_time")
    .eq("status", "confirmed")
    .gte("date", todayBA(from))
    .lte("date", todayBA(to));

  let queued = 0;
  for (const a of data ?? []) {
    const instant = slotInstant(a.date, a.start_time).getTime();
    if (instant < from.getTime() || instant > to.getTime()) continue;
    await queueNotification(a.id, "reminder_24h", { date: a.date, time: hhmm(a.start_time) });
    queued += 1;
  }
  return queued;
}
