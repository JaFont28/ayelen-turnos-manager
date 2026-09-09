import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { adminGetSettings, adminUpdateSettings } from "@/lib/admin.functions";

const FIELDS = [
  { key: "professional_name", label: "Nombre de la profesional" },
  { key: "license", label: "Matrícula" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email de contacto" },
  { key: "instagram", label: "Instagram" },
  { key: "address", label: "Dirección del consultorio" },
] as const;

export const Route = createFileRoute("/admin/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración | Turnos" },
      { name: "description", content: "Datos de contacto y del consultorio." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Configuración" },
      { property: "og:description", content: "Datos públicos de la profesional." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Configuracion,
});

function Configuracion() {
  const getFn = useServerFn(adminGetSettings);
  const updateFn = useServerFn(adminUpdateSettings);
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: () => getFn({}) });

  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = settings.data as Record<string, unknown> | undefined;
    if (!s) return;
    const next: Record<string, string> = {};
    for (const f of FIELDS) next[f.key] = String(s[f.key] ?? "");
    setValues(next);
  }, [settings.data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateFn({
        data: {
          professional_name: values["professional_name"] ?? "",
          license: values["license"] ?? "",
          whatsapp: values["whatsapp"] ?? "",
          email: values["email"] ?? "",
          instagram: values["instagram"] ?? "",
          address: values["address"] ?? "",
        },
      });
      setMessage("Configuración guardada.");
      settings.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Configuración</h1>
      {message && <p className="rounded border border-green-600 p-2">{message}</p>}
      {error && <p className="rounded border border-red-500 p-2 text-red-700">{error}</p>}
      <form onSubmit={save} className="max-w-md space-y-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-xs">{f.label}</span>
            <input
              className="w-full border p-2"
              value={values[f.key] ?? ""}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          </label>
        ))}
        <button className="rounded border px-3 py-2" type="submit">
          Guardar
        </button>
      </form>
    </div>
  );
}
