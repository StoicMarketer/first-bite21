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
