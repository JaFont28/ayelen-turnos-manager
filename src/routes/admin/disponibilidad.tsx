import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { adminListAvailability, adminSetAvailability } from "@/lib/admin.functions";

const WEEKDAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
];
const TIMES = ["16:00", "17:00", "18:00", "19:00"];

export const Route = createFileRoute("/admin/disponibilidad")({
  head: () => ({
    meta: [
      { title: "Disponibilidad | Turnos" },
      { name: "description", content: "Activar o desactivar horarios semanales de atención." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Disponibilidad semanal" },
      { property: "og:description", content: "Horarios de atención de lunes a viernes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Disponibilidad,
});

function Disponibilidad() {
  const listFn = useServerFn(adminListAvailability);
  const setFn = useServerFn(adminSetAvailability);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["admin", "availability"], queryFn: () => listFn({}) });
  const rows = list.data ?? [];

  function isActive(weekday: number, time: string) {
    return rows.some(
      (r) => r.weekday === weekday && r.start_time.slice(0, 5) === time && r.is_active,
    );
  }

  async function toggle(weekday: number, startTime: string, next: boolean) {
    setError(null);
    try {
      await setFn({ data: { weekday, startTime, isActive: next } });
      list.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Disponibilidad semanal</h1>
      <p className="text-xs">
        Los turnos duran 50 minutos y sólo se atienden de lunes a viernes. Desactivar un horario no
        cancela turnos ya reservados.
      </p>
      {error && <p className="rounded border border-red-500 p-2 text-red-700">{error}</p>}
      <table className="border text-center">
        <thead>
          <tr>
            <th className="border p-2" />
            {TIMES.map((t) => (
              <th key={t} className="border p-2">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((d) => (
            <tr key={d.value}>
              <th className="border p-2 text-left">{d.label}</th>
              {TIMES.map((t) => (
                <td key={t} className="border p-2">
                  <input
                    type="checkbox"
                    checked={isActive(d.value, t)}
                    onChange={(e) => toggle(d.value, t, e.target.checked)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
