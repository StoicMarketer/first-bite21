import { useEffect, useRef, useState } from "react";
import { Flame, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

  // Detect level increases and trigger a shimmer + glow pulse.
  const prevLevel = useRef<number | null>(null);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (prevLevel.current !== null && level > prevLevel.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1600);
      return () => clearTimeout(t);
    }
    prevLevel.current = level;
  }, [level]);

  return (
    <div className="mt-6 w-full max-w-[320px] mx-auto">
      <div className="flex items-baseline justify-between text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
        <motion.span
          animate={pulse ? { color: ["hsl(var(--muted-foreground))", "var(--ember)", "hsl(var(--muted-foreground))"] } : {}}
          transition={{ duration: 1.4 }}
        >
          Nivel · {name}
        </motion.span>
        <span className="text-foreground/70 normal-case tracking-normal font-display text-xs">
          <motion.span
            key={soles}
            initial={{ scale: 1.2, color: "var(--ember)" }}
            animate={{ scale: 1, color: "inherit" }}
            transition={{ duration: 0.6 }}
            className="inline-block"
          >
            {soles.toLocaleString("es-ES")}
          </motion.span>{" "}
          <span className="text-[color:var(--ember)]">☀</span>
        </span>
      </div>
      <div
        className={`relative mt-2 h-1.5 w-full rounded-full bg-accent overflow-hidden transition-shadow duration-500 ${
          pulse ? "shadow-[0_0_18px_rgba(251,191,36,0.55)]" : ""
        }`}
      >
        <motion.div
          className="h-full bg-gradient-to-r from-[color:var(--ember)] to-amber-400"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <AnimatePresence>
          {pulse && (
            <motion.div
              key="shimmer"
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: "150%", opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
            />
          )}
        </AnimatePresence>
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
