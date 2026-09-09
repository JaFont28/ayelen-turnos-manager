import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { adminCreateBlock, adminDeleteBlock, adminListBlocks } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/bloqueos")({
  head: () => ({
    meta: [
      { title: "Bloqueos | Turnos" },
      { name: "description", content: "Bloquear días completos u horarios puntuales de la agenda." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Bloqueos de agenda" },
      { property: "og:description", content: "Días y horarios no disponibles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Bloqueos,
});

function Bloqueos() {
  const listFn = useServerFn(adminListBlocks);
  const createFn = useServerFn(adminCreateBlock);
  const deleteFn = useServerFn(adminDeleteBlock);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["admin", "blocks"], queryFn: () => listFn({}) });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const res = await createFn({
        data: { date, startTime: startTime || null, reason: reason || undefined },
      });
      setMessage(res?.warning ?? "Bloqueo creado.");
      setDate("");
      setStartTime("");
      setReason("");
      list.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el bloqueo");
    }
  }

  async function remove(id: string) {
    await deleteFn({ data: { id } });
    list.refetch();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Bloqueos</h1>
      {message && <p className="rounded border border-yellow-600 p-2">{message}</p>}
      {error && <p className="rounded border border-red-500 p-2 text-red-700">{error}</p>}

      <form onSubmit={create} className="flex flex-wrap items-end gap-2 rounded border p-3">
        <label>
          <span className="block text-xs">Fecha</span>
          <input type="date" className="border p-2" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          <span className="block text-xs">Horario (vacío = día completo)</span>
          <select className="border p-2" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
            <option value="">Día completo</option>
            {["16:00", "17:00", "18:00", "19:00"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs">Motivo</span>
          <input className="border p-2" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button className="rounded border px-3 py-2" type="submit">
          Bloquear
        </button>
      </form>

      <table className="w-full border text-left text-xs">
        <thead>
          <tr>
            <th className="border p-1">Fecha</th>
            <th className="border p-1">Horario</th>
            <th className="border p-1">Motivo</th>
            <th className="border p-1" />
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((b) => (
            <tr key={b.id}>
              <td className="border p-1">{b.date}</td>
              <td className="border p-1">{b.start_time ?? "Día completo"}</td>
              <td className="border p-1">{b.reason ?? "—"}</td>
              <td className="border p-1">
                <button className="underline" onClick={() => remove(b.id)}>
                  Quitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
