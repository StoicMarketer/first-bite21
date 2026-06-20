import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const MAX_CHANNELS_PER_USER = 3;

export const createChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      name: z.string().trim().min(3).max(40),
      description: z.string().trim().max(140).optional().default(""),
      coverEmoji: z.string().trim().max(8).optional().default("✨"),
      visibility: z.enum(["public", "unlisted"]).optional().default("unlisted"),
      tonePrompt: z.string().trim().max(500).optional(),
      voice: z.string().trim().max(40).optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("created_by", userId)
      .eq("is_official", false);
    if ((count ?? 0) >= MAX_CHANNELS_PER_USER) {
      throw new Error(`Has alcanzado el máximo de ${MAX_CHANNELS_PER_USER} canales`);
    }
    const { data: inserted, error } = await supabase
      .from("channels")
      .insert({
        name: data.name,
        description: data.description || null,
        cover_emoji: data.coverEmoji || "✨",
        visibility: data.visibility,
        tone_prompt: data.tonePrompt ?? "",
        voice: data.voice ?? "alloy",
        is_official: false,
        created_by: userId,
      })
      .select("id, slug, invite_code")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("channel_subscriptions").insert({
      channel_id: inserted.id,
      user_id: userId,
      allow_send: true,
      allow_receive: true,
      share_wake_code: true,
    });
    return { id: inserted.id, slug: inserted.slug, inviteCode: inserted.invite_code as string };
  });

export const updateChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      channelId: z.string().uuid(),
      name: z.string().trim().min(3).max(40).optional(),
      description: z.string().trim().max(140).nullable().optional(),
      coverEmoji: z.string().trim().max(8).optional(),
      visibility: z.enum(["public", "unlisted"]).optional(),
      tonePrompt: z.string().trim().max(500).optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.coverEmoji !== undefined) patch.cover_emoji = data.coverEmoji;
    if (data.visibility !== undefined) patch.visibility = data.visibility;
    if (data.tonePrompt !== undefined) patch.tone_prompt = data.tonePrompt;
    const { error } = await supabase.from("channels").update(patch).eq("id", data.channelId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("channels").delete().eq("id", data.channelId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const myChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: channels } = await supabase
      .from("channels")
      .select("id, slug, name, description, cover_emoji, invite_code, visibility, created_at")
      .eq("created_by", userId)
      .order("created_at", { ascending: false });
    if (!channels?.length) return [];
    const ids = channels.map((c) => c.id);
    const { data: subs } = await supabase
      .from("channel_subscriptions")
      .select("channel_id")
      .in("channel_id", ids);
    const counts = new Map<string, number>();
    (subs ?? []).forEach((s) => counts.set(s.channel_id, (counts.get(s.channel_id) ?? 0) + 1));
    return channels.map((c) => ({ ...c, memberCount: counts.get(c.id) ?? 0 }));
  });

export const rotateInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ channelId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: newCode, error: rpcErr } = await supabase.rpc("generate_channel_invite_code");
    if (rpcErr) throw new Error(rpcErr.message);
    const { error } = await supabase.from("channels").update({ invite_code: newCode as unknown as string }).eq("id", data.channelId);
    if (error) throw new Error(error.message);
    return { inviteCode: newCode as unknown as string };
  });

export const lookupInvite = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ code: z.string().trim().min(4).max(16) }).parse(i))
  .handler(async ({ data }) => {
    const sb = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: rows, error } = await sb.rpc("lookup_channel_by_invite", { _code: data.code });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("Canal no encontrado");
    return row as { id: string; slug: string; name: string; description: string | null; cover_emoji: string | null; visibility: string; is_official: boolean; member_count: number };
  });

export const joinByInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ code: z.string().trim().min(4).max(16) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cid, error } = await supabase.rpc("join_channel_by_invite", { _code: data.code });
    if (error) throw new Error(error.message);
    const { data: ch } = await supabase.from("channels").select("slug").eq("id", cid as unknown as string).single();
    return { channelId: cid as unknown as string, slug: ch?.slug ?? null };
  });

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
    const patch: { allow_send?: boolean; allow_receive?: boolean; share_wake_code?: boolean } = {};
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
