import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ Search users ============
export const searchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ q: z.string().trim().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .ilike("username", `%${data.q.toLowerCase()}%`)
      .neq("id", userId)
      .limit(10);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ============ Send / accept / reject friend request ============
export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ friendId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.friendId === userId) throw new Error("No puedes añadirte a ti mismo");

    // If friend already requested you, accept
    const { data: existing } = await supabase
      .from("friendships")
      .select("id, user_id, friend_id, status")
      .or(`and(user_id.eq.${userId},friend_id.eq.${data.friendId}),and(user_id.eq.${data.friendId},friend_id.eq.${userId})`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") return { status: "accepted" as const };
      if (existing.user_id === data.friendId) {
        const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", existing.id);
        if (error) throw new Error(error.message);
        return { status: "accepted" as const };
      }
      return { status: "pending" as const };
    }

    const { error } = await supabase.from("friendships").insert({ user_id: userId, friend_id: data.friendId, status: "pending" });
    if (error) throw new Error(error.message);
    return { status: "pending" as const };
  });

export const respondFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ friendshipId: z.string().uuid(), accept: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.accept) {
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", data.friendshipId)
        .eq("friend_id", userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", data.friendshipId)
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ============ Get circle (accepted friends + their alarm hint) ============
export const getCircle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("friendships")
      .select("id, user_id, friend_id, status")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq("status", "accepted");
    if (error) throw new Error(error.message);

    const friendIds = (rows ?? []).map((r) => (r.user_id === userId ? r.friend_id : r.user_id));
    if (friendIds.length === 0) return [];

    const [{ data: profiles }, { data: alarms }] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name, avatar_url, streak_count").in("id", friendIds),
      supabase.from("alarms").select("user_id, alarm_time, is_active").in("user_id", friendIds),
    ]);

    return (profiles ?? []).map((p) => {
      const alarm = (alarms ?? []).find((a) => a.user_id === p.id);
      return { ...p, alarm_time: alarm?.alarm_time ?? null, alarm_active: alarm?.is_active ?? false };
    });
  });

export const getPendingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("friendships")
      .select("id, user_id, friend_id, created_at")
      .eq("friend_id", userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
    return (rows ?? []).map((r) => {
      const p = (profiles ?? []).find((x) => x.id === r.user_id);
      return { friendshipId: r.id, user: p };
    });
  });

// ============ Wake Code ============
const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const getMyWakeCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.from("profiles").select("wake_code").eq("id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return { wake_code: (data as { wake_code: string } | null)?.wake_code ?? null };
  });

export const lookupWakeCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ code: z.string().min(1).max(32) }).parse(i))
  .handler(async ({ data, context }) => {
    const code = normalizeCode(data.code);
    if (code.length !== 8) throw new Error("El código debe tener 8 caracteres");
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase.rpc("lookup_by_wake_code", { _code: code });
    if (error) throw new Error(error.message);
    const profile = Array.isArray(rows) ? rows[0] : rows;
    if (!profile) return null;
    if (profile.id === userId) throw new Error("Ese es tu propio código");
    return profile as { id: string; username: string; display_name: string | null; avatar_url: string | null; wake_code: string };
  });

export const regenerateWakeCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("regenerate_my_wake_code");
    if (error) throw new Error(error.message);
    return { wake_code: data as string };
  });

// ============ Username (handle) ============
const normalizeUsername = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9_]/g, "");

export const lookupUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ username: z.string().min(1).max(32) }).parse(i))
  .handler(async ({ data, context }) => {
    const username = normalizeUsername(data.username);
    if (username.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres");
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase.rpc("lookup_by_username", { _username: username });
    if (error) throw new Error(error.message);
    const profile = Array.isArray(rows) ? rows[0] : rows;
    if (!profile) return null;
    if (profile.id === userId) throw new Error("Ese es tu propio usuario");
    return profile as { id: string; username: string; display_name: string | null; avatar_url: string | null };
  });

export const updateUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ username: z.string().min(3).max(20) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: result, error } = await supabase.rpc("update_my_username", { _username: data.username });
    if (error) throw new Error(error.message);
    return { username: result as string };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });


