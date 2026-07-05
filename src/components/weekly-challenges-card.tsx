import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { Check } from "lucide-react";
import { getWeeklyChallenges } from "@/lib/gamification.functions";

export function WeeklyChallengesCard() {
  const fn = useServerFn(getWeeklyChallenges);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["weekly-challenges"], queryFn: () => fn() });

  // Si algún reto se completó recién (reward otorgado), refresca soles y logros.
  useEffect(() => {
    if (!data) return;
    if (data.some((c) => c.completed)) {
      qc.invalidateQueries({ queryKey: ["progress"] });
    }
  }, [data, qc]);

  const items = data ?? [];
  const done = items.filter((c) => c.completed).length;

  if (items.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
          Retos de la semana
        </div>
        <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground tabular">
          {done}/{items.length}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((c) => {
          const pct = Math.round((c.progress / c.target) * 100);
          return (
            <div
              key={c.code}
              className={`p-3 rounded-2xl border ${
                c.completed ? "border-emerald-400/30 bg-emerald-500/5" : "border-border bg-card"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{c.title}</div>
                  <div className="text-[10px] text-muted-foreground tabular mt-0.5">
                    {c.progress}/{c.target} · +{c.reward} ☀
                  </div>
                </div>
                {c.completed && (
                  <span className="h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    c.completed ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
