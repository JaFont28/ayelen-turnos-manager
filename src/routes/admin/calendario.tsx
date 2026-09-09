import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";

import { adminAvailabilityCalendar, adminListAppointments } from "@/lib/admin.functions";
import { addDays, formatDateLabel, todayBA } from "@/lib/time";

export const Route = createFileRoute("/admin/calendario")({
  head: () => ({
    meta: [
      { title: "Calendario | Turnos" },
      { name: "description", content: "Vista de agenda con turnos y horarios libres." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Calendario de turnos" },
      { property: "og:description", content: "Agenda de las próximas semanas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Calendario,
});

function Calendario() {
  const availabilityFn = useServerFn(adminAvailabilityCalendar);
  const appointmentsFn = useServerFn(adminListAppointments);
  const range = useMemo(() => ({ from: todayBA(), to: addDays(todayBA(), 28) }), []);

  const availability = useQuery({
    queryKey: ["admin", "calendar", range],
    queryFn: () => availabilityFn({ data: range }),
  });
  const appointments = useQuery({
    queryKey: ["admin", "appointments", range],
    queryFn: () => appointmentsFn({ data: range }),
  });

  const byDate = new Map<string, { time: string; label: string }[]>();
  for (const a of appointments.data ?? []) {
    const list = byDate.get(a.date) ?? [];
    const patient = Array.isArray(a.patients) ? a.patients[0] : a.patients;
    list.push({
      time: a.start_time,
      label: `${patient?.first_name ?? ""} ${patient?.last_name ?? ""} — ${a.status}`,
    });
    byDate.set(a.date, list);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Calendario (próximas 4 semanas)</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {(availability.data ?? []).map((day) => (
          <div key={day.date} className="rounded border p-3">
            <h2 className="font-medium">{formatDateLabel(day.date)}</h2>
            <p className="mt-1 text-xs">Libres: {day.slots.join(", ") || "sin horarios libres"}</p>
            <ul className="mt-1 text-xs">
              {(byDate.get(day.date) ?? []).map((a, i) => (
                <li key={i}>
                  {a.time} · {a.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
