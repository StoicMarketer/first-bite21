import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Check, X, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileShell } from "@/components/mobile-shell";
import { respondFriendRequest, getCircle, getPendingRequests, getMyProfile } from "@/lib/friends.functions";
import { getMyProgress } from "@/lib/gamification.functions";
import { AddByHandle } from "@/components/add-by-handle";
import { ProfileHeader } from "@/components/profile-header";
import { SettingsSheet } from "@/components/settings-sheet";
import { LevelBar } from "@/components/level-bar";
import { AchievementsGrid } from "@/components/achievements-grid";
import { WeeklyChallengesCard } from "@/components/weekly-challenges-card";
import { CircleLeaderboard } from "@/components/circle-leaderboard";



export const Route = createFileRoute("/_authenticated/circle")({
  component: CirclePage,
});

function CirclePage() {
  const qc = useQueryClient();
  const respondFn = useServerFn(respondFriendRequest);
  const circleFn = useServerFn(getCircle);
  const pendingFn = useServerFn(getPendingRequests);
  const meFn = useServerFn(getMyProfile);
  const progressFn = useServerFn(getMyProgress);
  const pendingRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: me } = useQuery({ queryKey: ["my-profile"], queryFn: () => meFn() });
  const { data: circle } = useQuery({ queryKey: ["circle"], queryFn: () => circleFn() });
  const { data: pending } = useQuery({ queryKey: ["pending"], queryFn: () => pendingFn() });
  const { data: progress } = useQuery({ queryKey: ["progress"], queryFn: () => progressFn() });

  const respond = useMutation({
    mutationFn: (p: { friendshipId: string; accept: boolean }) => respondFn({ data: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["circle"] });
      qc.invalidateQueries({ queryKey: ["pending"] });
    },
  });

  return (
    <MobileShell>
      <div className="px-6 pt-6 pb-8 relative">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Ajustes"
          className="absolute top-6 right-6 h-9 w-9 rounded-full flex items-center justify-center bg-card/80 backdrop-blur border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Settings className="h-4 w-4" strokeWidth={1.5} />
        </button>



        <ProfileHeader
          username={me?.username}
          displayName={me?.display_name}
          avatarUrl={me?.avatar_url}
          circleCount={circle?.length ?? 0}
          pendingCount={pending?.length ?? 0}
          onPendingClick={() => pendingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />

        <LevelBar
          soles={progress?.soles ?? 0}
          level={progress?.level ?? 0}
          sendStreak={progress?.sendStreak ?? 0}
          wakeStreak={progress?.wakeStreak ?? 0}
        />

        <WeeklyChallengesCard />

        <CircleLeaderboard />

        <AchievementsGrid />


        <div className="mt-10">

          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Añadir por @usuario</div>
          <div className="mt-3">
            <AddByHandle />
          </div>
        </div>

        {pending && pending.length > 0 && (
          <div ref={pendingRef} className="mt-8 space-y-2 scroll-mt-8">
            <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
              Solicitudes pendientes ({pending.length})
            </div>
            {pending.map((p) => p.user && (
              <Row key={p.friendshipId} name={p.user.display_name || p.user.username} sub={`@${p.user.username}`} avatar={p.user.avatar_url}
                trailing={<div className="flex gap-1">
                  <Button size="icon" variant="outline" className="h-9 w-9 rounded-full" onClick={() => respond.mutate({ friendshipId: p.friendshipId, accept: true })}><Check className="h-4 w-4" strokeWidth={1.5} /></Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => respond.mutate({ friendshipId: p.friendshipId, accept: false })}><X className="h-4 w-4" strokeWidth={1.5} /></Button>
                </div>} />
            ))}
          </div>
        )}

        <div className="mt-8 space-y-2">
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
            En tu círculo ({circle?.length ?? 0})
          </div>
          {circle && circle.length > 0 ? circle.map((f) => (
            <Row key={f.id} name={f.display_name || f.username} sub={`@${f.username}${f.alarm_active ? ` · alarma ${f.alarm_time?.slice(0,5) ?? ""}` : ""}`} avatar={f.avatar_url} />
          )) : (
            <div className="p-6 rounded-3xl border border-dashed border-border text-center space-y-3">
              <p className="text-sm text-muted-foreground">Aún no hay nadie en tu círculo.</p>
              <p className="text-xs text-muted-foreground">Mientras tanto, únete a un canal y empieza a recibir despertares de gente con tu vibra.</p>
              <a href="/channels" className="inline-block text-xs font-medium underline">Explorar canales temáticos →</a>
            </div>
          )}
        </div>
      </div>
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </MobileShell>
  );
}

function Row({ name, sub, avatar, trailing }: { name: string; sub?: string; avatar?: string | null; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border">
      <div className="h-10 w-10 rounded-full bg-accent overflow-hidden flex items-center justify-center">
        {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : <span className="font-display">{name.charAt(0).toUpperCase()}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{name}</div>
        {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
      </div>
      {trailing}
    </div>
  );
}
