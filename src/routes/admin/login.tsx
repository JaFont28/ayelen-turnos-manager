import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Acceso profesional | Turnos" },
      { name: "description", content: "Acceso privado al panel de gestión de turnos." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Acceso profesional" },
      { property: "og:description", content: "Acceso privado al panel de gestión de turnos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError("Credenciales inválidas");
      return;
    }
    navigate({ to: "/admin", replace: true });
  }

  return (
    <main className="mx-auto max-w-sm p-6 text-sm">
      <h1 className="text-xl font-semibold">Acceso profesional</h1>
      <form className="mt-4 space-y-3" onSubmit={submit}>
        <input
          type="email"
          className="w-full border p-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full border p-2"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-red-700">{error}</p>}
        <button className="w-full rounded border px-3 py-2" disabled={loading} type="submit">
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
