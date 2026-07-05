import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
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
            className={`w-full max-w-xs rounded-3xl bg-card border border-border p-8 flex flex-col items-center gap-4 ${
              RARITY_GLOW[current.rarity] ?? RARITY_GLOW.common
            }`}
          >
            <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
              Logro desbloqueado
            </div>
            <motion.div
              initial={{ scale: 0.4, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="text-7xl"
            >
              {current.icon}
            </motion.div>
            <div className="font-display text-2xl text-center leading-tight">{current.title}</div>
            <div className="text-sm text-center text-muted-foreground">{current.description}</div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="uppercase tracking-widest">{RARITY_LABEL[current.rarity] ?? current.rarity}</span>
              <span>·</span>
              <span className="tabular">+{current.solesReward} ☀</span>
            </div>
            <Button onClick={dismiss} className="w-full h-12 rounded-full mt-2">
              Genial
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
