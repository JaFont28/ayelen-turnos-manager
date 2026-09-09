import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { queueReminders } = await import("@/lib/booking.server");
        const { dispatchPendingNotifications } = await import("@/lib/notifications.server");
        const queued = await queueReminders();
        const dispatch = await dispatchPendingNotifications();
        return Response.json({ ok: true, queued, dispatch });
      },
    },
  },
});
