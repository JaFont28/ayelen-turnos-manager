import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/expire-pending")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { expirePendingBookings } = await import("@/lib/booking.server");
        const expired = await expirePendingBookings();
        return Response.json({ ok: true, expired });
      },
    },
  },
});
