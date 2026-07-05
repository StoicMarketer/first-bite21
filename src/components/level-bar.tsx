import { Flame, Moon } from "lucide-react";
import { LEVELS, levelName, nextThreshold } from "@/lib/gamification.functions";

type Props = {
  soles: number;
  level: number;
  sendStreak: number;
  wakeStreak: number;
};

export function LevelBar({ soles, level, sendStreak, wakeStreak }: Props) {
  const next = nextThreshold(level);
  const currentBase = LEVELS[Math.min(level, LEVELS.length - 1)].threshold;
  const pct = next ? Math.min(100, Math.round(((soles - currentBase) / (next - currentBase)) * 100)) : 100;
  const name = levelName(level);

  return (
    <div className="mt-6 w-full max-w-[320px] mx-auto">
      <div className="flex items-baseline justify-between text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
        <span>Nivel · {name}</span>
        <span className="text-foreground/70 normal-case tracking-normal font-display text-xs">
          {soles.toLocaleString("es-ES")} <span className="text-[color:var(--ember)]">☀</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-accent overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[color:var(--ember)] to-amber-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground text-right">
        {next ? `${next - soles} para ${LEVELS[level + 1]?.name}` : "Nivel máximo"}
      </div>

      <div className="mt-4 flex items-center justify-center gap-6 text-xs">
        <StreakChip icon={<Flame className="h-3.5 w-3.5" strokeWidth={1.8} />} value={sendStreak} label="envío" />
        <div className="h-4 w-px bg-border" />
        <StreakChip icon={<Moon className="h-3.5 w-3.5" strokeWidth={1.8} />} value={wakeStreak} label="despertar" />
      </div>
    </div>
  );
}

function StreakChip({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  const active = value > 0;
  return (
    <div className={`flex items-center gap-1.5 ${active ? "text-foreground" : "text-muted-foreground"}`}>
      <span className={active ? "text-[color:var(--ember)]" : ""}>{icon}</span>
      <span className="font-display text-sm leading-none">{value}</span>
      <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">{label}</span>
    </div>
  );
}
