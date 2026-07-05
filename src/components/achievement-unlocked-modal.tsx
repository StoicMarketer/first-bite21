import { useEffect, useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { Share2 } from "lucide-react";
import { getUnseenAchievements, markAchievementSeen, type UnlockedAchievement } from "@/lib/gamification.functions";
import { Button } from "@/components/ui/button";

const RARITY_GLOW: Record<string, string> = {
  common: "shadow-[0_0_60px_rgba(255,255,255,0.15)]",
  rare: "shadow-[0_0_80px_rgba(56,189,248,0.35)]",
  epic: "shadow-[0_0_90px_rgba(167,139,250,0.4)]",
  legendary: "shadow-[0_0_120px_rgba(251,191,36,0.55)]",
};

const RARITY_LABEL: Record<string, string> = {
  common: "Común",
  rare: "Rara",
  epic: "Épica",
  legendary: "Legendaria",
};

const RARITY_PARTICLE: Record<string, string> = {
  common: "bg-white/60",
  rare: "bg-sky-300",
  epic: "bg-violet-300",
  legendary: "bg-amber-300",
};

function Particles({ rarity }: { rarity: string }) {
  const count = rarity === "legendary" ? 24 : rarity === "epic" ? 18 : 12;
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const distance = 90 + Math.random() * 60;
        return {
          i,
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          size: 4 + Math.random() * 4,
          delay: Math.random() * 0.15,
          duration: 0.9 + Math.random() * 0.6,
        };
      }),
    [count]
  );
  const cls = RARITY_PARTICLE[rarity] ?? RARITY_PARTICLE.common;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible">
      {particles.map((p) => (
        <motion.span
          key={p.i}
          initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
          animate={{ x: p.x, y: p.y, scale: [0, 1, 0.6], opacity: [0, 1, 0] }}
          transition={{ delay: p.delay, duration: p.duration, ease: "easeOut" }}
          style={{ width: p.size, height: p.size }}
          className={`absolute rounded-full ${cls}`}
        />
      ))}
    </div>
  );
}

async function shareAchievement(a: UnlockedAchievement) {
  const text = `${a.icon} Acabo de desbloquear "${a.title}" en SurpriseWake ☀`;
  const url = typeof window !== "undefined" ? window.location.origin : "";
  try {
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
      await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
        title: "SurpriseWake",
        text,
        url,
      });
      return;
    }
    await navigator.clipboard?.writeText(`${text}\n${url}`);
  } catch { /* user cancelled */ }
}

export function AchievementUnlockedModal() {
  const qc = useQueryClient();
  const unseenFn = useServerFn(getUnseenAchievements);
  const seenFn = useServerFn(markAchievementSeen);
  const [current, setCurrent] = useState<UnlockedAchievement | null>(null);

  const { data: unseen } = useQuery({
    queryKey: ["unseen-achievements"],
    queryFn: () => unseenFn(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (current) return;
    if (unseen && unseen.length > 0) {
      setCurrent(unseen[0]);
    }
  }, [unseen, current]);

  const dismiss = useCallback(async () => {
    if (!current) return;
    const code = current.code;
    setCurrent(null);
    try {
      await seenFn({ data: { code } });
    } catch { /* ignore */ }
    qc.invalidateQueries({ queryKey: ["unseen-achievements"] });
    qc.invalidateQueries({ queryKey: ["achievements"] });
    qc.invalidateQueries({ queryKey: ["progress"] });
  }, [current, seenFn, qc]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-6"
          onClick={dismiss}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-xs rounded-3xl bg-card border border-border p-8 flex flex-col items-center gap-4 ${
              RARITY_GLOW[current.rarity] ?? RARITY_GLOW.common
            }`}
          >
            <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
              Logro desbloqueado
            </div>
            <div className="relative flex items-center justify-center">
              <Particles rarity={current.rarity} />
              <motion.div
                initial={{ scale: 0.3, rotate: -18 }}
                animate={{ scale: [0.3, 1.15, 1], rotate: [-18, 6, 0] }}
                transition={{ delay: 0.05, duration: 0.6, ease: "easeOut" }}
                className="text-7xl relative z-10"
              >
                {current.icon}
              </motion.div>
            </div>
            <div className="font-display text-2xl text-center leading-tight">{current.title}</div>
            <div className="text-sm text-center text-muted-foreground">{current.description}</div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="uppercase tracking-widest">{RARITY_LABEL[current.rarity] ?? current.rarity}</span>
              <span>·</span>
              <span className="tabular">+{current.solesReward} ☀</span>
            </div>
            <div className="flex w-full gap-2 mt-2">
              <Button
                variant="outline"
                onClick={() => current && shareAchievement(current)}
                className="flex-1 h-12 rounded-full gap-2"
              >
                <Share2 className="h-4 w-4" strokeWidth={1.8} />
                Compartir
              </Button>
              <Button onClick={dismiss} className="flex-1 h-12 rounded-full">
                Genial
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
