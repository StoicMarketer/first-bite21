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
