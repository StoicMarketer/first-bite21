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
// Rule: deliver only ONE message per natural day (receiver's day in their tz).
// Exception: on the receiver's birthday with `birthday_unlimited`, deliver all.
// A specific messageId can be requested to play a queued message on demand.
export const getWakeQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ force: z.boolean().optional(), messageId: z.string().uuid().optional() }).parse(i ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("birthdate, birthday_unlimited, timezone")
      .eq("id", userId)
      .maybeSingle();

    const tz = profile?.timezone || "UTC";
    const today = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
    const todayMD = today.slice(5);
    const isBirthday = !!profile?.birthdate && profile.birthdate.slice(5) === todayMD && !!profile.birthday_unlimited;

    // Fetch all unplayed messages for this user
    const { data: pending, error } = await supabase
      .from("messages")
      .select("id, sender_id, kind, audio_path, text_content, created_at, played_on_date, channel_id, is_ai")
      .eq("receiver_id", userId)
      .eq("is_played", false)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const all = pending ?? [];
    const queuedCount = all.length;

    let selected: typeof all = [];

    if (data.messageId) {
      // On-demand: play this specific message (and lock it to today)
      const m = all.find((x) => x.id === data.messageId);
      if (m) {
        if (m.played_on_date !== today) {
          await supabase.from("messages").update({ played_on_date: today }).eq("id", m.id);
        }
        selected = [m];
      }
    } else if (isBirthday) {
      selected = all;
    } else {
      // Prefer a message already locked to today (continuation after refresh)
      const locked = all.find((m) => m.played_on_date === today);
      if (locked) {
        selected = [locked];
      } else {
        const next = all.find((m) => m.played_on_date === null);
        if (next) {
          const { data: claim } = await supabase
            .from("messages")
            .update({ played_on_date: today })
            .eq("id", next.id)
            .is("played_on_date", null)
            .select("id")
            .maybeSingle();
          if (claim) selected = [{ ...next, played_on_date: today }];
        }
      }
    }

    const senderIds = Array.from(new Set(selected.map((m) => m.sender_id)));
    const profiles = senderIds.length
      ? (await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", senderIds)).data ?? []
      : [];

    const enriched = await Promise.all(
      selected.map(async (m) => {
        let signedUrl: string | null = null;
        if (m.kind === "audio" && m.audio_path) {
          const { data: signed } = await supabase.storage.from("wake-audios").createSignedUrl(m.audio_path, 600);
          signedUrl = signed?.signedUrl ?? null;
        }
        const sender = profiles.find((p) => p.id === m.sender_id);
        return { ...m, signedUrl, sender };
      })
    );

    void data;
    return { messages: enriched, queuedCount, isBirthday };
  });

// List pending messages for the inbox queued section (no claiming)
export const getQueuedMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    try { await supabase.rpc("fanout_channel_messages"); } catch { /* noop */ }
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, sender_id, kind, text_content, audio_path, created_at, channel_id")
      .eq("receiver_id", userId)
      .eq("is_played", false)
      .order("created_at", { ascending: true });
    const list = msgs ?? [];
    const senderIds = Array.from(new Set(list.map((m) => m.sender_id)));
    const channelIds = Array.from(new Set(list.map((m) => m.channel_id).filter((x): x is string => !!x)));
    const [{ data: profiles }, { data: channels }] = await Promise.all([
      senderIds.length
        ? supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", senderIds)
        : Promise.resolve({ data: [] }),
      channelIds.length
        ? supabase.from("channels").select("id, name, cover_emoji, slug").in("id", channelIds)
        : Promise.resolve({ data: [] }),
    ]);
    return list.map((m) => ({
      ...m,
      sender: (profiles ?? []).find((p) => p.id === m.sender_id) ?? null,
      channel: m.channel_id ? (channels ?? []).find((c) => c.id === m.channel_id) ?? null : null,
    }));
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

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      birthdayUnlimited: z.boolean().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: { birthdate?: string | null; birthday_unlimited?: boolean } = {};
    if (data.birthdate !== undefined) patch.birthdate = data.birthdate;
    if (data.birthdayUnlimited !== undefined) patch.birthday_unlimited = data.birthdayUnlimited;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
