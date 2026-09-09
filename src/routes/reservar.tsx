import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { getAvailability, getPublicSettings, createBooking } from "@/lib/public.functions";
import {
  AGE_GROUPS,
  AGE_GROUP_LABEL,
  CONSULTATION_LABEL,
  CONSULTATION_TYPES,
  DURATION_MINUTES,
  MODALITIES,
  MODALITY_LABEL,
  type AgeGroup,
  type ConsultationType,
  type Modality,
} from "@/lib/domain";
import { addDays, formatDateLabel, todayBA } from "@/lib/time";

export const Route = createFileRoute("/reservar")({
  head: () => ({
    meta: [
      { title: "Reservar turno | Lic. Ayelen Pajuelo Piccoli" },
      {
        name: "description",
        content: "Elegí modalidad, fecha y horario disponible y confirmá tu turno con pago online.",
      },
      { property: "og:title", content: "Reservar turno" },
      { property: "og:description", content: "Reservá tu turno de psicología clínica online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reservar,
});

function Reservar() {
  const fetchAvailability = useServerFn(getAvailability);
  const fetchSettings = useServerFn(getPublicSettings);
  const book = useServerFn(createBooking);

  const range = useMemo(() => {
    const from = todayBA();
    return { from, to: addDays(from, 60) };
  }, []);

  const availability = useQuery({
    queryKey: ["availability", range],
    queryFn: () => fetchAvailability({ data: range }),
  });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => fetchSettings({}) });

  const [modality, setModality] = useState<Modality>("presencial");
  const [consultationType, setConsultationType] = useState<ConsultationType>("primera_entrevista");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("adulto");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ secureToken: string; checkoutUrl: string | null } | null>(
    null,
  );

  const days = availability.data ?? [];
  const slots = days.find((d) => d.date === date)?.slots ?? [];
  const price =
    modality === "presencial" ? settings.data?.pricePresencial : settings.data?.priceVirtual;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await book({
        data: {
          firstName,
          lastName,
          email,
          phone,
          date,
          startTime,
          modality,
          consultationType,
          ageGroup,
          acceptedPolicy: true as const,
        },
      });
      setResult({ secureToken: res.secureToken, checkoutUrl: res.checkoutUrl });
      if (res.checkoutUrl) window.location.href = res.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la reserva");
      availability.refetch();
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-semibold">Reserva creada</h1>
        <p className="mt-2 text-sm">
          Tu horario quedó reservado temporalmente. Enlace privado de tu turno:
        </p>
        <Link
          to="/turno/$token"
          params={{ token: result.secureToken }}
          className="mt-2 block break-all underline"
        >
          /turno/{result.secureToken}
        </Link>
        {result.checkoutUrl ? (
          <a className="mt-4 block underline" href={result.checkoutUrl}>
            Ir a pagar en Mercado Pago
          </a>
        ) : (
          <p className="mt-4 rounded border border-yellow-500 p-3 text-sm">
            El pago online todavía no está habilitado (faltan las credenciales de Mercado Pago). La
            reserva quedará como “pago pendiente” hasta que expire.
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-xl font-semibold">Reservar turno</h1>
      <form className="mt-4 space-y-4 text-sm" onSubmit={submit}>
        <Field label="Modalidad">
          <select
            className="w-full border p-2"
            value={modality}
            onChange={(e) => setModality(e.target.value as Modality)}
          >
            {MODALITIES.map((m) => (
              <option key={m} value={m}>
                {MODALITY_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tipo de consulta">
          <select
            className="w-full border p-2"
            value={consultationType}
            onChange={(e) => setConsultationType(e.target.value as ConsultationType)}
          >
            {CONSULTATION_TYPES.map((c) => (
              <option key={c} value={c}>
                {CONSULTATION_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Grupo etario">
          <select
            className="w-full border p-2"
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
          >
            {AGE_GROUPS.map((a) => (
              <option key={a} value={a}>
                {AGE_GROUP_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fecha">
          <select
            className="w-full border p-2"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setStartTime("");
            }}
            required
          >
            <option value="">
              {availability.isLoading ? "Cargando…" : "Elegí una fecha disponible"}
            </option>
            {days.map((d) => (
              <option key={d.date} value={d.date}>
                {formatDateLabel(d.date)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Horario">
          <select
            className="w-full border p-2"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            disabled={!date}
          >
            <option value="">Elegí un horario</option>
            {slots.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre">
            <input className="w-full border p-2" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </Field>
          <Field label="Apellido">
            <input className="w-full border p-2" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </Field>
        </div>
        <Field label="Email">
          <input type="email" className="w-full border p-2" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Teléfono / WhatsApp">
          <input className="w-full border p-2" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </Field>

        <section className="rounded border p-3">
          <h2 className="font-medium">Resumen</h2>
          <ul className="mt-2 space-y-1">
            <li>Modalidad: {MODALITY_LABEL[modality]}</li>
            <li>Tipo de consulta: {CONSULTATION_LABEL[consultationType]}</li>
            <li>Grupo etario: {AGE_GROUP_LABEL[ageGroup]}</li>
            <li>Fecha: {date ? formatDateLabel(date) : "—"}</li>
            <li>Horario: {startTime || "—"}</li>
            <li>Duración: {DURATION_MINUTES} minutos</li>
            <li>Precio: {price != null ? `$ ${price}` : "—"}</li>
          </ul>
        </section>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            required
          />
          <span>
            Acepto la política de cancelación: cancelaciones con 12 horas o más de anticipación
            tienen reembolso; con menos de 12 horas, la decisión queda a cargo de la profesional.
          </span>
        </label>

        {error && <p className="rounded border border-red-500 p-2 text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !accepted || !date || !startTime}
          className="rounded border px-4 py-2 font-medium disabled:opacity-50"
        >
          {submitting ? "Creando reserva…" : "Continuar al pago"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}
