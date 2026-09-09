import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (location.pathname.startsWith("/admin/login")) return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/login" });
    return { user: data.user };
  },
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Inicio" },
  { to: "/admin/calendario", label: "Calendario" },
  { to: "/admin/turnos", label: "Turnos" },
  { to: "/admin/disponibilidad", label: "Disponibilidad" },
  { to: "/admin/bloqueos", label: "Bloqueos" },
  { to: "/admin/pagos", label: "Pagos" },
  { to: "/admin/precios", label: "Precios" },
  { to: "/admin/configuracion", label: "Configuración" },
] as const;

function AdminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isLogin = typeof window !== "undefined" && window.location.pathname.startsWith("/admin/login");

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  if (isLogin) return <Outlet />;

  return (
    <div className="mx-auto max-w-5xl p-4 text-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <nav className="flex flex-wrap gap-3">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className="underline-offset-4 hover:underline" activeProps={{ className: "font-semibold underline" }}>
              {item.label}
            </Link>
          ))}
        </nav>
        <button onClick={signOut} className="rounded border px-3 py-1">
          Cerrar sesión
        </button>
      </header>
      <main className="pt-4">
        <Outlet />
      </main>
    </div>
  );
}
