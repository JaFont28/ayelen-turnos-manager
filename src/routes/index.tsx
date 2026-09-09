import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Turnos | Lic. Ayelen Pajuelo Piccoli" },
      {
        name: "description",
        content:
          "Reservá tu turno de psicología clínica con la Lic. Ayelen Pajuelo Piccoli. Modalidad presencial en Resistencia, Chaco, o virtual.",
      },
      { property: "og:title", content: "Turnos | Lic. Ayelen Pajuelo Piccoli" },
      {
        property: "og:description",
        content: "Reservá tu turno de psicología clínica, presencial o virtual.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Lic. Ayelen Pajuelo Piccoli</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Psicología Clínica — Terapia Cognitiva Integrativa — Matrícula 1029
      </p>
      <p className="mt-4 text-sm">
        Atención de lunes a viernes de 16:00 a 20:00 (America/Argentina/Buenos_Aires). Sesiones de 50
        minutos, presenciales en Necochea 655, Resistencia (Chaco) o virtuales.
      </p>
      <div className="mt-6 flex gap-3">
        <Link to="/reservar" className="rounded border px-4 py-2 text-sm font-medium">
          Reservar turno
        </Link>
        <Link to="/admin/login" className="rounded border px-4 py-2 text-sm">
          Acceso profesional
        </Link>
      </div>
    </main>
  );
}
