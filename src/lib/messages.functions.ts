import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ Send a message ============
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      receiverId: z.string().uuid(),
      kind: z.enum(["audio", "text"]),
      text: z.string().trim().max(280).optional(),
      audioPath: z.string().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.kind === "text" && !data.text) throw new Error("Falta el texto");
    if (data.kind === "audio" && !data.audioPath) throw new Error("Falta el audio");

    // Compute the receiver's next alarm date (scheduled_for)
    const { data: alarm } = await supabase
      .from("alarms")
      .select("alarm_time, is_active")
      .eq("user_id", data.receiverId)
      .maybeSingle();

    const today = new Date();
    const scheduled = new Date(today);
    if (alarm?.alarm_time) {
      const [h, m] = alarm.alarm_time.split(":").map(Number);
      const cand = new Date(today);
      cand.setHours(h, m, 0, 0);
      if (cand.getTime() <= today.getTime()) cand.setDate(cand.getDate() + 1);
      scheduled.setTime(cand.getTime());
    } else {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    const scheduledFor = scheduled.toISOString().slice(0, 10);

    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({
        sender_id: userId,
        receiver_id: data.receiverId,
        kind: data.kind,
        text_content: data.kind === "text" ? data.text : null,
        audio_path: data.kind === "audio" ? data.audioPath : null,
        scheduled_for: scheduledFor,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Bump sender streak
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: prof } = await supabase.from("profiles").select("streak_count, last_send_date").eq("id", userId).single();
    if (prof) {
      let streak = prof.streak_count;
      if (prof.last_send_date !== todayStr) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        streak = prof.last_send_date === yesterday ? streak + 1 : 1;
        await supabase.from("profiles").update({ streak_count: streak, last_send_date: todayStr }).eq("id", userId);
      }
    }
    return { id: inserted.id, scheduledFor };
  });

// ============ Wake queue: messages due now for the current user ============
export const getWakeQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ force: z.boolean().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const filter = supabase
      .from("messages")
      .select("id, sender_id, kind, audio_path, text_content, created_at")
      .eq("receiver_id", userId)
      .eq("is_played", false)
      .order("created_at", { ascending: true });
    const query = data.force ? filter : filter.lte("scheduled_for", today);
    const { data: msgs, error } = await query;
    if (error) throw new Error(error.message);

    const senderIds = Array.from(new Set((msgs ?? []).map((m) => m.sender_id)));
    const profiles = senderIds.length
      ? (await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", senderIds)).data ?? []
      : [];

    const enriched = await Promise.all(
      (msgs ?? []).map(async (m) => {
        let signedUrl: string | null = null;
        if (m.kind === "audio" && m.audio_path) {
          const { data: signed } = await supabase.storage.from("wake-audios").createSignedUrl(m.audio_path, 300);
          signedUrl = signed?.signedUrl ?? null;
        }
        const sender = profiles.find((p) => p.id === m.sender_id);
        return { ...m, signedUrl, sender };
      })
    );
    return enriched;
  });

export const markPlayed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ messageId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("messages")
      .update({ is_played: true, played_at: new Date().toISOString() })
      .eq("id", data.messageId)
      .eq("receiver_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Save / unsave (freemium cap 3) ============
export const saveMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ messageId: z.string().uuid(), save: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.save) {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("saved_by_receiver", true);
      if ((count ?? 0) >= 3) {
        return { ok: false, reason: "limit" as const };
      }
    }
    const { error } = await supabase
      .from("messages")
      .update({ saved_by_receiver: data.save })
      .eq("id", data.messageId)
      .eq("receiver_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ============ Reactions ============
export const sendReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      messageId: z.string().uuid(),
      emoji: z.string().max(8).optional(),
      audioPath: z.string().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msg } = await supabase.from("messages").select("sender_id").eq("id", data.messageId).maybeSingle();
    if (!msg) throw new Error("Mensaje no encontrado");
    const { error } = await supabase.from("reactions").insert({
      message_id: data.messageId,
      sender_id: userId,
      receiver_id: msg.sender_id,
      emoji: data.emoji ?? null,
      audio_path: data.audioPath ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Inbox: sent log + saved ============
export const getInboxData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: sent }, { data: saved }] = await Promise.all([
      supabase
        .from("messages")
        .select("id, receiver_id, kind, scheduled_for, is_played, created_at")
        .eq("sender_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("messages")
        .select("id, sender_id, kind, text_content, audio_path, created_at")
        .eq("receiver_id", userId)
        .eq("saved_by_receiver", true)
        .order("created_at", { ascending: false }),
    ]);

    const allIds = Array.from(new Set([
      ...(sent ?? []).map((m) => m.receiver_id),
      ...(saved ?? []).map((m) => m.sender_id),
    ]));
    const profiles = allIds.length
      ? (await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", allIds)).data ?? []
      : [];

    const savedWithUrls = await Promise.all(
      (saved ?? []).map(async (m) => {
        let signedUrl: string | null = null;
        if (m.kind === "audio" && m.audio_path) {
          const { data: s } = await supabase.storage.from("wake-audios").createSignedUrl(m.audio_path, 600);
          signedUrl = s?.signedUrl ?? null;
        }
        return { ...m, signedUrl, sender: profiles.find((p) => p.id === m.sender_id) };
      })
    );

    return {
      sent: (sent ?? []).map((m) => ({ ...m, receiver: profiles.find((p) => p.id === m.receiver_id) })),
      saved: savedWithUrls,
    };
  });

// ============ Profile & alarm ============
export const getMyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: alarm }, { count: pendingCount }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("alarms").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("friendships").select("id", { count: "exact", head: true }).eq("friend_id", userId).eq("status", "pending"),
    ]);
    return { profile, alarm, pendingCount: pendingCount ?? 0 };
  });

export const updateAlarm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      alarmTime: z.string().regex(/^\d{2}:\d{2}$/),
      isActive: z.boolean(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("alarms")
      .upsert({ user_id: userId, alarm_time: data.alarmTime + ":00", is_active: data.isActive }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
