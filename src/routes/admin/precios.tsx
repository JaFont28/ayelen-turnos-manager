import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { adminGetSettings, adminUpdateSettings } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/precios")({
  head: () => ({
    meta: [
      { title: "Precios | Turnos" },
      { name: "description", content: "Valores de la sesión presencial y virtual." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Precios de sesión" },
      { property: "og:description", content: "Configuración de valores por modalidad." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Precios,
});

function Precios() {
  const getFn = useServerFn(adminGetSettings);
  const updateFn = useServerFn(adminUpdateSettings);
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: () => getFn({}) });

  const [presencial, setPresencial] = useState("");
  const [virtual, setVirtual] = useState("");
  const [hold, setHold] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = settings.data as Record<string, unknown> | undefined;
    if (!s) return;
    setPresencial(String(s["price_presencial"] ?? ""));
    setVirtual(String(s["price_virtual"] ?? ""));
    setHold(String(s["hold_minutes"] ?? ""));
  }, [settings.data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateFn({
        data: {
          price_presencial: Number(presencial),
          price_virtual: Number(virtual),
          hold_minutes: Number(hold),
        },
      });
      setMessage("Precios actualizados.");
      settings.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Precios</h1>
      <p className="text-xs">
        Los cambios se aplican a las reservas nuevas; los turnos ya pagados conservan su valor.
      </p>
      {message && <p className="rounded border border-green-600 p-2">{message}</p>}
      {error && <p className="rounded border border-red-500 p-2 text-red-700">{error}</p>}
      <form onSubmit={save} className="max-w-sm space-y-3">
        <label className="block">
          <span className="block text-xs">Sesión presencial (ARS)</span>
          <input type="number" min="0" className="w-full border p-2" value={presencial} onChange={(e) => setPresencial(e.target.value)} required />
        </label>
        <label className="block">
          <span className="block text-xs">Sesión virtual (ARS)</span>
          <input type="number" min="0" className="w-full border p-2" value={virtual} onChange={(e) => setVirtual(e.target.value)} required />
        </label>
        <label className="block">
          <span className="block text-xs">Minutos de retención de la reserva sin pago</span>
          <input type="number" min="5" max="120" className="w-full border p-2" value={hold} onChange={(e) => setHold(e.target.value)} required />
        </label>
        <button className="rounded border px-3 py-2" type="submit">
          Guardar
        </button>
      </form>
    </div>
  );
}
