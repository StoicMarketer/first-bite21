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
    const { supabase } = context;
    const { data, error } = await supabase.rpc("apply_wake_event");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      newTotal: (row?.new_total as number) ?? 0,
      newLevel: (row?.new_level as number) ?? 0,
      levelUp: (row?.level_up as boolean) ?? false,
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
    const { supabase } = context;
    const { data, error } = await supabase.rpc("check_achievements");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ code: string; title: string; description: string; icon: string; rarity: string; soles_reward: number }>;
    return rows.map((r) => ({
      code: r.code,
      title: r.title,
      description: r.description,
      icon: r.icon,
      rarity: r.rarity,
      solesReward: r.soles_reward,
    }));
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
