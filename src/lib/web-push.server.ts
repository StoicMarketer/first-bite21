// Server-only Web Push sender. Filename ends in `.server.ts` so it never reaches the client bundle.
import webpush from "web-push";

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY
    || "BHEEf-j6pgt6IfsuW4c_9vP5YktUn6p3-CmYcBv1TyPox5Wn1jf5IqshoimCBwcquH888mEO72jjLOiIW4FN3gU";
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:hello@surprisewake.app";
  if (!priv) throw new Error("VAPID_PRIVATE_KEY missing");
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export type WakePushOptions = {
  userId: string;
  title: string;
  body: string;
  url: string;
  messageId?: string | null;
  tag?: string;
};

export async function sendWakePush(opts: WakePushOptions): Promise<number> {
  configure();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", opts.userId);
  if (error) throw new Error(error.message);
  if (!subs || subs.length === 0) return 0;

  const payload = JSON.stringify({
    title: opts.title,
    body: opts.body,
    url: opts.url,
    messageId: opts.messageId ?? null,
    tag: opts.tag ?? "wake",
  });

  let sent = 0;
  const toDelete: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60, urgency: "high" }
        );
        sent++;
      } catch (err: unknown) {
        const e = err as { statusCode?: number };
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          toDelete.push(s.id);
        } else {
          console.error("[push] send failed", err);
        }
      }
    })
  );

  if (toDelete.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", toDelete);
  }

  return sent;
}
