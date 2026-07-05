import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCircleLeaderboard } from "@/lib/gamification.functions";
import { LevelBadge } from "@/components/level-badge";

export function CircleLeaderboard() {
  const fn = useServerFn(getCircleLeaderboard);
  const { data } = useQuery({ queryKey: ["circle-leaderboard"], queryFn: () => fn() });
  const rows = data ?? [];
  if (rows.length <= 1) return null;

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="mt-8">
      <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
        Tu círculo esta semana
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-6 px-6 pb-1">
        {rows.map((r, i) => (
          <div
            key={r.id}
            className={`shrink-0 w-[112px] p-3 rounded-2xl border flex flex-col items-center text-center ${
              r.isMe ? "border-amber-400/50 bg-amber-500/5" : "border-border bg-card"
            }`}
          >
            <div className="relative">
              <div className="h-12 w-12 rounded-full bg-accent overflow-hidden flex items-center justify-center">
                {r.avatarUrl ? (
                  <img src={r.avatarUrl} alt={r.username} className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-lg">
                    {(r.displayName || r.username).charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              {i < 3 && (
                <span className="absolute -top-1 -right-1 text-sm">{medals[i]}</span>
              )}
            </div>
            <div className="mt-2 text-xs truncate w-full">
              {r.isMe ? "Tú" : (r.displayName || r.username)}
            </div>
            <div className="mt-1"><LevelBadge level={r.level} /></div>
            <div className="mt-1 text-[11px] tabular text-muted-foreground">{r.soles} ☀</div>
          </div>
        ))}
      </div>
    </div>
  );
}
