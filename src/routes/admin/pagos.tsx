import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { adminListPayments, adminRefund } from "@/lib/admin.functions";
import { PAYMENT_STATUS_LABEL } from "@/lib/domain";

export const Route = createFileRoute("/admin/pagos")({
  head: () => ({
    meta: [
      { title: "Pagos | Turnos" },
      { name: "description", content: "Pagos recibidos, estados y solicitud de reembolsos." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Pagos y reembolsos" },
      { property: "og:description", content: "Estado de pagos de los turnos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagos,
});

function Pagos() {
  const listFn = useServerFn(adminListPayments);
  const refundFn = useServerFn(adminRefund);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["admin", "payments"], queryFn: () => listFn({}) });

  async function refund(paymentId: string, max: number) {
    const raw = window.prompt(`Monto a reembolsar (máximo ${max})`, String(max));
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setError(null);
    try {
      await refundFn({ data: { paymentId, amount } });
      setMessage("Reembolso solicitado.");
      list.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reembolsar");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Pagos</h1>
      {message && <p className="rounded border border-green-600 p-2">{message}</p>}
      {error && <p className="rounded border border-red-500 p-2 text-red-700">{error}</p>}
      <table className="w-full border text-left text-xs">
        <thead>
          <tr>
            <th className="border p-1">Fecha turno</th>
            <th className="border p-1">Paciente</th>
            <th className="border p-1">Monto</th>
            <th className="border p-1">Estado</th>
            <th className="border p-1">ID Mercado Pago</th>
            <th className="border p-1">Reembolso</th>
            <th className="border p-1" />
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((p) => {
            const appt = Array.isArray(p.appointments) ? p.appointments[0] : p.appointments;
            const patient = appt
              ? Array.isArray(appt.patients)
                ? appt.patients[0]
                : appt.patients
              : null;
            const refunds = Array.isArray(p.refunds) ? p.refunds : p.refunds ? [p.refunds] : [];
            return (
              <tr key={p.id}>
                <td className="border p-1">
                  {appt?.date} {appt?.start_time}
                </td>
                <td className="border p-1">
                  {patient?.first_name} {patient?.last_name}
                </td>
                <td className="border p-1">$ {p.amount}</td>
                <td className="border p-1">{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</td>
                <td className="border p-1">{p.provider_payment_id ?? "—"}</td>
                <td className="border p-1">
                  {refunds.map((r) => `${r.status} ($${r.amount})`).join(", ") || "—"}
                </td>
                <td className="border p-1">
                  {p.status === "approved" && refunds.length === 0 && (
                    <button className="underline" onClick={() => refund(p.id, Number(p.amount))}>
                      Reembolsar
                    </button>
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
