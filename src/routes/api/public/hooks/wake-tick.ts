// Public cron endpoint: fires every minute. Looks up users whose alarm matches "now" in their tz,
// builds a wake payload, and sends Web Push. No bearer auth (under /api/public/*) — we still
// require the Supabase anon key in the `apikey` header to deter random callers.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/wake-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") || request.headers.get("x-apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendWakePush } = await import("@/lib/web-push.server");

        // Fanout pending channel messages first so receivers find them in their queue.
        try { await supabaseAdmin.rpc("fanout_channel_messages"); } catch { /* noop */ }

        const { data: alarms, error } = await supabaseAdmin
          .from("alarms")
          .select("id, user_id, alarm_time, is_active, last_fired_on, profiles!inner(timezone)")
          .eq("is_active", true);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        const now = new Date();
        const results: Array<{ user: string; sent: number; reason?: string }> = [];

        for (const a of alarms ?? []) {
          const tz = (a as unknown as { profiles?: { timezone?: string } }).profiles?.timezone || "UTC";
          // Hour/minute in user's tz, plus today's date.
          let hh = "00", mm = "00", today = "";
          try {
            const parts = new Intl.DateTimeFormat("en-GB", {
              timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit",
            }).formatToParts(now);
            hh = parts.find((p) => p.type === "hour")?.value ?? "00";
            mm = parts.find((p) => p.type === "minute")?.value ?? "00";
            today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now); // YYYY-MM-DD
          } catch {
            continue;
          }

          const target = (a.alarm_time || "00:00").slice(0, 5);
          if (`${hh}:${mm}` !== target) continue;
          if (a.last_fired_on === today) continue;

          // Pick the next unplayed message (lock to today like getWakeQueue does).
          const { data: pending } = await supabaseAdmin
            .from("messages")
            .select("id, sender_id, kind, text_content, played_on_date")
            .eq("receiver_id", a.user_id)
            .eq("is_played", false)
            .order("created_at", { ascending: true });

          const list = pending ?? [];
          let msgId: string | null = null;
          let bodyText = "Tu círculo te espera con un buen día.";

          const locked = list.find((m) => m.played_on_date === today);
          const chosen = locked || list.find((m) => m.played_on_date === null);
          if (chosen) {
            msgId = chosen.id;
            if (chosen.played_on_date !== today) {
              await supabaseAdmin.from("messages").update({ played_on_date: today }).eq("id", chosen.id);
            }
            if (chosen.kind === "text" && chosen.text_content) {
              bodyText = chosen.text_content.slice(0, 120);
            } else if (chosen.kind === "audio") {
              const { data: sender } = await supabaseAdmin
                .from("profiles").select("display_name, username").eq("id", chosen.sender_id).maybeSingle();
              bodyText = `Audio de ${sender?.display_name || sender?.username || "tu círculo"}`;
            }
          }

          const url = msgId ? `/wake?source=push&messageId=${msgId}` : `/wake?source=push`;

          let sent = 0;
          try {
            sent = await sendWakePush({
              userId: a.user_id,
              title: "Es la hora de despertar",
              body: bodyText,
              url,
              messageId: msgId,
            });
          } catch (err) {
            console.error("[wake-tick] sendWakePush failed", err);
          }

          await supabaseAdmin
            .from("alarms")
            .update({ last_fired_on: today, last_fired_at: new Date().toISOString() })
            .eq("user_id", a.user_id);

          results.push({ user: a.user_id, sent });
        }

        return Response.json({ ok: true, fired: results.length, results });
      },
    },
  },
});
