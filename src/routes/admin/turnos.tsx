import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import {
  adminCancelAppointment,
  adminCreateAppointment,
  adminListAppointments,
  adminRescheduleAppointment,
} from "@/lib/admin.functions";
import { APPOINTMENT_STATUS_LABEL } from "@/lib/domain";

export const Route = createFileRoute("/admin/turnos")({
  head: () => ({
    meta: [
      { title: "Turnos | Gestión" },
      { name: "description", content: "Listado, alta manual, cancelación y reprogramación de turnos." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Gestión de turnos" },
      { property: "og:description", content: "Listado y administración de turnos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Turnos,
});

function Turnos() {
  const listFn = useServerFn(adminListAppointments);
  const createFn = useServerFn(adminCreateAppointment);
  const cancelFn = useServerFn(adminCancelAppointment);
  const rescheduleFn = useServerFn(adminRescheduleAppointment);

  const [status, setStatus] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    date: "",
    startTime: "16:00",
  });

  const list = useQuery({
    queryKey: ["admin", "appointments", status],
    queryFn: () => listFn({ data: status ? { status } : {} }),
  });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createFn({
        data: {
          ...form,
          modality: "presencial" as const,
          consultationType: "primera_entrevista" as const,
          ageGroup: "adulto" as const,
        },
      });
      setMessage("Turno manual creado y confirmado.");
      setForm({ ...form, firstName: "", lastName: "", email: "", phone: "", date: "" });
      list.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el turno");
    }
  }

  async function cancel(id: string) {
    setError(null);
    try {
      const res = await cancelFn({ data: { id } });
      setMessage(res?.message ?? "Turno cancelado.");
      list.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar");
    }
  }

  async function move(id: string) {
    const date = window.prompt("Nueva fecha (AAAA-MM-DD)");
    const startTime = date ? window.prompt("Nuevo horario (HH:MM)") : null;
    if (!date || !startTime) return;
    setError(null);
    try {
      await rescheduleFn({ data: { id, date, startTime } });
      setMessage("Turno reprogramado.");
      list.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reprogramar");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Turnos</h1>
      {message && <p className="rounded border border-green-600 p-2">{message}</p>}
      {error && <p className="rounded border border-red-500 p-2 text-red-700">{error}</p>}

      <form onSubmit={create} className="grid gap-2 rounded border p-3 md:grid-cols-3">
        <h2 className="md:col-span-3 font-medium">Nuevo turno manual (confirmado, sin pago online)</h2>
        <input className="border p-2" placeholder="Nombre" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        <input className="border p-2" placeholder="Apellido" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        <input className="border p-2" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input className="border p-2" placeholder="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
        <input className="border p-2" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <select className="border p-2" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}>
          {["16:00", "17:00", "18:00", "19:00"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button className="rounded border px-3 py-2 md:col-span-3" type="submit">
          Crear turno
        </button>
      </form>

      <div>
        <label className="mr-2">Filtrar por estado</label>
        <select className="border p-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option>
          {Object.keys(APPOINTMENT_STATUS_LABEL).map((s) => (
            <option key={s} value={s}>
              {APPOINTMENT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <table className="w-full border text-left text-xs">
        <thead>
          <tr>
            <th className="border p-1">Fecha</th>
            <th className="border p-1">Hora</th>
            <th className="border p-1">Paciente</th>
            <th className="border p-1">Contacto</th>
            <th className="border p-1">Modalidad</th>
            <th className="border p-1">Estado</th>
            <th className="border p-1">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((a) => {
            const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
            return (
              <tr key={a.id}>
                <td className="border p-1">{a.date}</td>
                <td className="border p-1">{a.start_time}</td>
                <td className="border p-1">
                  {p?.first_name} {p?.last_name}
                </td>
                <td className="border p-1">
                  {p?.email}
                  <br />
                  {p?.phone}
                </td>
                <td className="border p-1">{a.modality}</td>
                <td className="border p-1">{APPOINTMENT_STATUS_LABEL[a.status] ?? a.status}</td>
                <td className="border p-1">
                  {(a.status === "confirmed" || a.status === "payment_pending") && (
                    <>
                      <button className="underline" onClick={() => cancel(a.id)}>
                        Cancelar
                      </button>{" "}
                      <button className="underline" onClick={() => move(a.id)}>
                        Reprogramar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
