import { LEVELS } from "@/lib/gamification.functions";

export function LevelBadge({ level, size = "sm" }: { level: number; size?: "sm" | "md" }) {
  if (level < 1) return null;
  const name = LEVELS[Math.min(level, LEVELS.length - 1)].name;
  const px = size === "md" ? "text-[10px] px-1.5 py-0.5" : "text-[9px] px-1 py-[1px]";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 uppercase tracking-widest font-medium tabular ${px}`}
    >
      ☀ {name}
    </span>
  );
}
