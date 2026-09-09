import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { cancelTurno, getAvailability, getPublicSettings, getTurno, rescheduleTurno } from "@/lib/public.functions";
import {
  AGE_GROUP_LABEL,
  APPOINTMENT_STATUS_LABEL,
  CONSULTATION_LABEL,
  DURATION_MINUTES,
  MODALITY_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/domain";
import { addDays, formatDateLabel, todayBA } from "@/lib/time";

export const Route = createFileRoute("/turno/$token")({
  head: () => ({
    meta: [
      { title: "Mi turno | Lic. Ayelen Pajuelo Piccoli" },
      { name: "description", content: "Consultá, cancelá o reprogramá tu turno desde tu enlace privado." },
      { property: "og:title", content: "Mi turno" },
      { property: "og:description", content: "Gestión privada de tu turno." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TurnoPage,
});

function TurnoPage() {
  const { token } = Route.useParams();
  const fetchTurno = useServerFn(getTurno);
  const fetchAvailability = useServerFn(getAvailability);
  const fetchSettings = useServerFn(getPublicSettings);
  const cancel = useServerFn(cancelTurno);
  const reschedule = useServerFn(rescheduleTurno);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const turno = useQuery({
    queryKey: ["turno", token],
    queryFn: () => fetchTurno({ data: { token } }),
    retry: false,
  });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => fetchSettings({}) });
  const range = useMemo(() => ({ from: todayBA(), to: addDays(todayBA(), 60), token }), [token]);
  const availability = useQuery({
    queryKey: ["availability", range],
    queryFn: () => fetchAvailability({ data: range }),
    enabled: turno.data?.canSelfManage === true,
  });

  if (turno.isLoading) return <main className="p-6 text-sm">Cargando…</main>;
  if (turno.error)
    return <main className="p-6 text-sm text-red-700">No encontramos este turno.</main>;

  const t = turno.data!;
  const days = availability.data ?? [];
  const slots = days.find((d) => d.date === date)?.slots ?? [];

  async function doCancel() {
    setError(null);
    try {
      const res = await cancel({ data: { token } });
      setMessage(res.message);
      turno.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar");
    }
  }

  async function doReschedule(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await reschedule({ data: { token, date, startTime: time } });
      setMessage("Turno reprogramado.");
      setDate("");
      setTime("");
      turno.refetch();
      availability.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reprogramar");
    }
  }

  return (
    <main className="mx-auto max-w-xl p-6 text-sm">
      <h1 className="text-xl font-semibold">Mi turno</h1>
      <ul className="mt-4 space-y-1 rounded border p-3">
        <li>Estado: {APPOINTMENT_STATUS_LABEL[t.status] ?? t.status}</li>
        <li>Fecha: {formatDateLabel(t.date)}</li>
        <li>
          Horario: {t.startTime} a {t.endTime} ({DURATION_MINUTES} minutos)
        </li>
        <li>Modalidad: {MODALITY_LABEL[t.modality as "presencial" | "virtual"]}</li>
        <li>Tipo de consulta: {CONSULTATION_LABEL[t.consultationType as "primera_entrevista" | "seguimiento"]}</li>
        <li>Grupo etario: {AGE_GROUP_LABEL[t.ageGroup as "adulto" | "adolescente" | "infancia"]}</li>
        <li>
          Paciente: {t.patient?.first_name} {t.patient?.last_name}
        </li>
        {t.payment && (
          <li>
            Pago: $ {t.payment.amount} — {PAYMENT_STATUS_LABEL[t.payment.status] ?? t.payment.status}
          </li>
        )}
        {t.refund && <li>Reembolso: {t.refund.status}</li>}
      </ul>

      {message && <p className="mt-4 rounded border border-green-600 p-2">{message}</p>}
      {error && <p className="mt-4 rounded border border-red-500 p-2 text-red-700">{error}</p>}

      {t.status === "confirmed" && (
        <section className="mt-6 space-y-4">
          {t.canSelfManage ? (
            <>
              <div>
                <h2 className="font-medium">Cancelar turno</h2>
                <p className="mt-1">
                  Faltan más de 12 horas: al cancelar se solicita el reembolso total automáticamente.
                </p>
                <button onClick={doCancel} className="mt-2 rounded border px-3 py-2">
                  Cancelar turno
                </button>
              </div>

              <form onSubmit={doReschedule}>
                <h2 className="font-medium">Reprogramar</h2>
                <select
                  className="mt-2 w-full border p-2"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setTime("");
                  }}
                  required
                >
                  <option value="">Nueva fecha</option>
                  {days.map((d) => (
                    <option key={d.date} value={d.date}>
                      {formatDateLabel(d.date)}
                    </option>
                  ))}
                </select>
                <select
                  className="mt-2 w-full border p-2"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  disabled={!date}
                >
                  <option value="">Nuevo horario</option>
                  {slots.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="mt-2 rounded border px-3 py-2" type="submit">
                  Confirmar cambio
                </button>
              </form>
            </>
          ) : (
            <p className="rounded border p-3">
              Faltan menos de 12 horas para tu turno: la cancelación o reprogramación debe
              coordinarse con la profesional.{" "}
              {settings.data?.whatsapp && (
                <a
                  className="underline"
                  href={`https://wa.me/${settings.data.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Escribir por WhatsApp
                </a>
              )}
            </p>
          )}
        </section>
      )}

      {t.status === "payment_pending" && (
        <p className="mt-6 rounded border p-3">
          El pago todavía no fue acreditado. La reserva vence el{" "}
          {t.expiresAt ? new Date(t.expiresAt).toLocaleString("es-AR") : "—"}.
        </p>
      )}
    </main>
  );
}
