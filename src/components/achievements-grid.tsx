import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { getAchievements, triggerAchievementPreview } from "@/lib/gamification.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const RARITY_STYLES: Record<string, string> = {
  common: "border-border bg-card",
  rare: "border-sky-400/40 bg-sky-500/5",
  epic: "border-violet-400/40 bg-violet-500/5",
  legendary: "border-amber-400/50 bg-amber-500/10",
};

const RARITY_LABEL: Record<string, string> = {
  common: "Común",
  rare: "Rara",
  epic: "Épica",
  legendary: "Legendaria",
};

type Item = {
  code: string;
  family: string;
  title: string;
  description: string;
  icon: string;
  rarity: string;
  solesReward: number;
  unlocked: boolean;
  unlockedAt: string | null;
};

export function AchievementsGrid() {
  const fn = useServerFn(getAchievements);
  const previewFn = useServerFn(triggerAchievementPreview);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["achievements"], queryFn: () => fn() });
  const [selected, setSelected] = useState<Item | null>(null);
  const [triggering, setTriggering] = useState(false);

  async function handlePreview() {
    if (!selected) return;
    setTriggering(true);
    try {
      await previewFn({ data: { code: selected.code } });
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["unseen-achievements"] });
      qc.invalidateQueries({ queryKey: ["achievements"] });
    } finally {
      setTriggering(false);
    }
  }

  const items = data ?? [];
  const unlockedCount = items.filter((i) => i.unlocked).length;

  return (
    <div className="mt-10">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
          Logros
        </div>
        <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground tabular">
          {unlockedCount}/{items.length}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {items.map((a) => {
          const style = RARITY_STYLES[a.rarity] ?? RARITY_STYLES.common;
          return (
            <button
              key={a.code}
              type="button"
              onClick={() => setSelected(a)}
              className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 ${
                a.unlocked ? style : "border-dashed border-border bg-muted/30"
              }`}
            >
              <span className={`text-2xl ${a.unlocked ? "" : "grayscale opacity-40"}`}>
                {a.unlocked ? a.icon : "?"}
              </span>
              <span
                className={`text-[9px] leading-tight text-center px-1 truncate w-full ${
                  a.unlocked ? "text-foreground/80" : "text-muted-foreground/60"
                }`}
              >
                {a.unlocked ? a.title : "—"}
              </span>
            </button>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-xs">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex justify-center text-5xl mb-2">
                  {selected.unlocked ? selected.icon : "🔒"}
                </div>
                <DialogTitle className="text-center font-display text-xl">
                  {selected.unlocked ? selected.title : "Aún bloqueado"}
                </DialogTitle>
                <DialogDescription className="text-center">
                  {selected.description}
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                <span className="uppercase tracking-widest">
                  {RARITY_LABEL[selected.rarity] ?? selected.rarity}
                </span>
                <span className="tabular">+{selected.solesReward} ☀</span>
              </div>
              <Button
                onClick={handlePreview}
                disabled={triggering}
                className="w-full mt-3 rounded-full gap-2"
                variant="outline"
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.8} />
                {selected.unlocked ? "Volver a ver la animación" : "Desbloquear y ver animación"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
