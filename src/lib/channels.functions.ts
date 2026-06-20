import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: channels }, { data: subs }] = await Promise.all([
      supabase.from("channels").select("*").order("name", { ascending: true }),
      supabase.from("channel_subscriptions").select("channel_id, allow_send, allow_receive, share_wake_code").eq("user_id", userId),
    ]);
    const subMap = new Map((subs ?? []).map((s) => [s.channel_id, s]));
    return (channels ?? []).map((c) => ({
      ...c,
      subscription: subMap.get(c.id) ?? null,
    }));
  });

export const getChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: channel, error } = await supabase.from("channels").select("*").eq("slug", data.slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!channel) throw new Error("Canal no encontrado");

    const { data: sub } = await supabase
      .from("channel_subscriptions")
      .select("allow_send, allow_receive, share_wake_code, joined_at")
      .eq("channel_id", channel.id)
      .eq("user_id", userId)
      .maybeSingle();

    const { count: memberCount } = await supabase
      .from("channel_subscriptions")
      .select("user_id", { count: "exact", head: true })
      .eq("channel_id", channel.id);

    let recent: Array<{ id: string; sender_id: string; kind: string; text_content: string | null; audio_path: string | null; created_at: string }> = [];
    if (sub) {
      const r = await supabase
        .from("channel_messages")
        .select("id, sender_id, kind, text_content, audio_path, created_at")
        .eq("channel_id", channel.id)
        .order("created_at", { ascending: false })
        .limit(20);
      recent = r.data ?? [];
    }

    const senderIds = Array.from(new Set(recent.map((m) => m.sender_id)));
    const profiles = senderIds.length
      ? (await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", senderIds)).data ?? []
      : [];

    return {
      channel,
      subscription: sub,
      memberCount: memberCount ?? 0,
      recent: recent.map((m) => ({ ...m, sender: profiles.find((p) => p.id === m.sender_id) ?? null })),
    };
  });

export const subscribeChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ channelId: z.string().uuid(), shareCode: z.boolean().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("channel_subscriptions").upsert(
      { channel_id: data.channelId, user_id: userId, share_wake_code: data.shareCode ?? false },
      { onConflict: "channel_id,user_id" }
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unsubscribeChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("channel_subscriptions").delete().eq("channel_id", data.channelId).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      channelId: z.string().uuid(),
      allowSend: z.boolean().optional(),
      allowReceive: z.boolean().optional(),
      shareWakeCode: z.boolean().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, boolean> = {};
    if (data.allowSend !== undefined) patch.allow_send = data.allowSend;
    if (data.allowReceive !== undefined) patch.allow_receive = data.allowReceive;
    if (data.shareWakeCode !== undefined) patch.share_wake_code = data.shareWakeCode;
    const { error } = await supabase
      .from("channel_subscriptions")
      .update(patch)
      .eq("channel_id", data.channelId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendChannelMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      channelId: z.string().uuid(),
      kind: z.enum(["audio", "text"]),
      text: z.string().trim().max(280).optional(),
      audioPath: z.string().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.kind === "text" && !data.text) throw new Error("Falta el texto");
    if (data.kind === "audio" && !data.audioPath) throw new Error("Falta el audio");
    const { error } = await supabase.from("channel_messages").insert({
      channel_id: data.channelId,
      sender_id: userId,
      kind: data.kind,
      text_content: data.kind === "text" ? data.text! : null,
      audio_path: data.kind === "audio" ? data.audioPath! : null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMembersWithCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: subs } = await supabase
      .from("channel_subscriptions")
      .select("user_id, joined_at")
      .eq("channel_id", data.channelId)
      .eq("share_wake_code", true)
      .order("joined_at", { ascending: false })
      .limit(30);
    const ids = (subs ?? []).map((s) => s.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, wake_code")
      .in("id", ids);
    return profiles ?? [];
  });
