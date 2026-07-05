import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


// Umbrales de nivel (mantener en sync con level_from_soles en la BD)
export const LEVELS = [
  { name: "Alba", threshold: 0 },
  { name: "Aurora", threshold: 250 },
  { name: "Amanecer", threshold: 750 },
  { name: "Solsticio", threshold: 2000 },
  { name: "Mediodía", threshold: 5000 },
  { name: "Cenit", threshold: 12000 },
  { name: "Eterno", threshold: 25000 },
] as const;

export function nextThreshold(level: number): number | null {
  return level + 1 < LEVELS.length ? LEVELS[level + 1].threshold : null;
}

export function levelName(level: number): string {
  return LEVELS[Math.max(0, Math.min(level, LEVELS.length - 1))].name;
}

// ============ getMyProgress ============
export const getMyProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Asegura la fila (idempotente vía policy propia)
    await supabase.from("user_progress").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    const { data } = await supabase
      .from("user_progress")
      .select("soles, level, send_streak, wake_streak, send_streak_last_date, wake_streak_last_date, send_freeze_available, wake_freeze_available")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      soles: data?.soles ?? 0,
      level: data?.level ?? 0,
      sendStreak: data?.send_streak ?? 0,
      wakeStreak: data?.wake_streak ?? 0,
      sendStreakLastDate: data?.send_streak_last_date ?? null,
      wakeStreakLastDate: data?.wake_streak_last_date ?? null,
      sendFreezeAvailable: data?.send_freeze_available ?? true,
      wakeFreezeAvailable: data?.wake_freeze_available ?? true,
    };
  });

// ============ registerWakeOpen ============
// Se llama desde /wake al montar. Devuelve el estado nuevo (para popup de nivel).
export const registerWakeOpen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.rpc("apply_wake_event");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    const levelUp = (row?.level_up as boolean) ?? false;
    const newLevel = (row?.new_level as number) ?? 0;
    if (levelUp) {
      try {
        const { notifyCircleMilestone } = await import("./milestone-notify.server");
        await notifyCircleMilestone({ userId, kind: "level_up", level: newLevel });
      } catch { /* noop */ }
    }
    return {
      newTotal: (row?.new_total as number) ?? 0,
      newLevel,
      levelUp,
      wakeStreak: (row?.wake_streak as number) ?? 0,
    };
  });

// ============ Achievements ============
export type UnlockedAchievement = {
  code: string;
  title: string;
  description: string;
  icon: string;
  rarity: string;
  solesReward: number;
};

export const checkAchievements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UnlockedAchievement[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.rpc("check_achievements");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ code: string; title: string; description: string; icon: string; rarity: string; soles_reward: number }>;
    const unlocks = rows.map((r) => ({
      code: r.code,
      title: r.title,
      description: r.description,
      icon: r.icon,
      rarity: r.rarity,
      solesReward: r.soles_reward,
    }));
    // Notify the circle for rare milestones only (epic/legendary) — don't spam on commons.
    const notable = unlocks.filter((u) => u.rarity === "epic" || u.rarity === "legendary");
    if (notable.length > 0) {
      try {
        const { notifyCircleMilestone } = await import("./milestone-notify.server");
        await Promise.all(notable.map((u) =>
          notifyCircleMilestone({ userId, kind: "achievement", achievementTitle: u.title, rarity: u.rarity })
        ));
      } catch { /* noop */ }
    }
    return unlocks;
  });

export const getAchievements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [catalog, unlocked] = await Promise.all([
      supabase.from("achievements").select("code, family, title, description, icon, rarity, soles_reward, sort_order").order("sort_order"),
      supabase.from("user_achievements").select("achievement_code, unlocked_at, seen").eq("user_id", userId),
    ]);
    if (catalog.error) throw new Error(catalog.error.message);
    if (unlocked.error) throw new Error(unlocked.error.message);
    const unlockedMap = new Map(unlocked.data.map((u) => [u.achievement_code, u]));
    return (catalog.data ?? []).map((c) => {
      const u = unlockedMap.get(c.code);
      return {
        code: c.code,
        family: c.family,
        title: c.title,
        description: c.description,
        icon: c.icon,
        rarity: c.rarity,
        solesReward: c.soles_reward,
        unlocked: !!u,
        unlockedAt: u?.unlocked_at ?? null,
        seen: u?.seen ?? true,
      };
    });
  });

export const getUnseenAchievements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UnlockedAchievement[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_achievements")
      .select("achievement_code, achievements!inner(code, title, description, icon, rarity, soles_reward)")
      .eq("user_id", userId)
      .eq("seen", false);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => {
      const a = r.achievements as unknown as { code: string; title: string; description: string; icon: string; rarity: string; soles_reward: number };
      return {
        code: a.code,
        title: a.title,
        description: a.description,
        icon: a.icon,
        rarity: a.rarity,
        solesReward: a.soles_reward,
      };
    });
  });

export const markAchievementSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ code: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("mark_achievement_seen", { _code: data.code });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Weekly challenges ============
const CHALLENGE_META: Record<string, { title: string; icon: string }> = {
  send_5_people: { title: "Envía amaneceres a 5 personas", icon: "✉️" },
  wake_5_days: { title: "Despierta con la app 5 días", icon: "🌄" },
  streak_send_7: { title: "Mantén tu racha de envío 7 días", icon: "🔥" },
  send_new_person: { title: "Envía a alguien nuevo", icon: "🌟" },
  send_10_messages: { title: "Envía 10 amaneceres", icon: "🌤️" },
};

export const getWeeklyChallenges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("resolve_weekly_challenges");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ code: string; target: number; progress: number; completed: boolean; reward: number }>;
    return rows.map((r) => ({
      code: r.code,
      title: CHALLENGE_META[r.code]?.title ?? r.code,
      icon: CHALLENGE_META[r.code]?.icon ?? "✨",
      target: r.target,
      progress: Math.min(r.progress, r.target),
      completed: r.completed,
      reward: r.reward,
    }));
  });

// ============ Circle leaderboard (últimos 7 días) ============
export const getCircleLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: friends } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .eq("status", "accepted")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
    const ids = new Set<string>([userId]);
    (friends ?? []).forEach((f) => {
      if (f.user_id !== userId) ids.add(f.user_id);
      if (f.friend_id !== userId) ids.add(f.friend_id);
    });
    const idList = Array.from(ids);
    if (idList.length === 0) return [] as Array<{ id: string; username: string; displayName: string | null; avatarUrl: string | null; soles: number; level: number; isMe: boolean }>;

    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    const day = weekStart.getUTCDay();
    const diff = (day === 0 ? -6 : 1 - day); // ISO week starts Monday
    weekStart.setUTCDate(weekStart.getUTCDate() + diff);

    const [{ data: events }, { data: profiles }, { data: progress }] = await Promise.all([
      supabase
        .from("sunbeam_events")
        .select("user_id, amount")
        .in("user_id", idList)
        .gte("created_at", weekStart.toISOString()),
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", idList),
      supabase
        .from("user_progress")
        .select("user_id, level")
        .in("user_id", idList),
    ]);
    const sums = new Map<string, number>();
    (events ?? []).forEach((e) => sums.set(e.user_id, (sums.get(e.user_id) ?? 0) + e.amount));
    const levels = new Map<string, number>();
    (progress ?? []).forEach((p) => levels.set(p.user_id, p.level ?? 0));
    return (profiles ?? [])
      .map((p) => ({
        id: p.id,
        username: p.username,
        displayName: p.display_name,
        avatarUrl: p.avatar_url,
        soles: sums.get(p.id) ?? 0,
        level: levels.get(p.id) ?? 0,
        isMe: p.id === userId,
      }))
      .sort((a, b) => b.soles - a.soles);
  });
