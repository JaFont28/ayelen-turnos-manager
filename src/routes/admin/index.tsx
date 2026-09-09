import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { adminListNotifications, adminSummary } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Panel | Turnos" },
      { name: "description", content: "Resumen de la agenda y estado del sistema." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Panel de turnos" },
      { property: "og:description", content: "Resumen de la agenda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminHome,
});

function AdminHome() {
  const summaryFn = useServerFn(adminSummary);
  const notificationsFn = useServerFn(adminListNotifications);
  const summary = useQuery({ queryKey: ["admin", "summary"], queryFn: () => summaryFn({}) });
  const notifications = useQuery({
    queryKey: ["admin", "notifications"],
    queryFn: () => notificationsFn({}),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Panel</h1>
      {summary.error && <p className="text-red-700">{String(summary.error)}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Turnos de hoy" value={summary.data?.todayAppointments} />
        <Card label="Confirmados futuros" value={summary.data?.upcomingConfirmed} />
        <Card label="Pago pendiente" value={summary.data?.paymentPending} />
        <Card label="Notificaciones pendientes" value={summary.data?.pendingNotifications} />
      </div>

      <section>
        <h2 className="font-medium">Últimas notificaciones preparadas</h2>
        <table className="mt-2 w-full border text-left">
          <thead>
            <tr>
              <th className="border p-1">Evento</th>
              <th className="border p-1">Canal</th>
              <th className="border p-1">Estado</th>
              <th className="border p-1">Creada</th>
            </tr>
          </thead>
          <tbody>
            {(notifications.data ?? []).map((n) => (
              <tr key={n.id}>
                <td className="border p-1">{n.event}</td>
                <td className="border p-1">{n.channel}</td>
                <td className="border p-1">{n.status}</td>
                <td className="border p-1">{new Date(n.created_at).toLocaleString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded border p-3">
      <div className="text-2xl font-semibold">{value ?? "—"}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
