import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const bookingSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(6).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  modality: z.enum(["presencial", "virtual"]),
  consultationType: z.enum(["primera_entrevista", "seguimiento"]),
  ageGroup: z.enum(["adulto", "adolescente", "infancia"]),
  acceptedPolicy: z.literal(true),
});

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  token: z.string().max(200).optional(),
});

function baseUrl(): string {
  const request = getRequest();
  return new URL(request.url).origin;
}

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : "Error inesperado";
  throw new Error(message);
}

export const getPublicSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { getSettings } = await import("./booking.server");
  const s = await getSettings();
  return {
    professionalName: s.professional_name,
    license: s.license,
    whatsapp: s.whatsapp,
    email: s.email,
    instagram: s.instagram,
    address: s.address,
    pricePresencial: Number(s.price_presencial),
    priceVirtual: Number(s.price_virtual),
    holdMinutes: s.hold_minutes,
  };
});

export const getAvailability = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => rangeSchema.parse(input))
  .handler(async ({ data }) => {
    const { computeAvailability } = await import("./booking.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ignore: string | undefined;
    if (data.token) {
      const { data: appt } = await supabaseAdmin
        .from("appointments")
        .select("id")
        .eq("secure_token", data.token)
        .maybeSingle();
      ignore = appt?.id;
    }
    return await computeAvailability(data.from, data.to, ignore ? { ignoreAppointmentId: ignore } : {});
  });

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => bookingSchema.parse(input))
  .handler(async ({ data }) => {
    const { createPendingBooking } = await import("./booking.server");
    try {
      const { acceptedPolicy: _ignored, ...input } = data;
      return await createPendingBooking(input, baseUrl());
    } catch (error) {
      fail(error);
    }
  });

export const getTurno = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(32).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { getAppointmentByToken } = await import("./booking.server");
    try {
      return await getAppointmentByToken(data.token);
    } catch (error) {
      fail(error);
    }
  });

export const cancelTurno = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(32).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { getAppointmentByToken, cancelAppointment } = await import("./booking.server");
    try {
      const appointment = await getAppointmentByToken(data.token);
      return await cancelAppointment(appointment.id, { bySelfService: true });
    } catch (error) {
      fail(error);
    }
  });

export const rescheduleTurno = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(32).max(200),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getAppointmentByToken, rescheduleAppointment } = await import("./booking.server");
    try {
      const appointment = await getAppointmentByToken(data.token);
      await rescheduleAppointment(appointment.id, data.date, data.startTime, { enforceWindow: true });
      return { ok: true as const };
    } catch (error) {
      fail(error);
    }
  });
