import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Share2, Plus, AlarmClockCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MobileShell } from "@/components/mobile-shell";
import { SendMessageSheet } from "@/components/send-message-sheet";
import { getMyOverview, updateAlarm, getWakeQueue } from "@/lib/messages.functions";
import { getCircle } from "@/lib/friends.functions";
import { cn, humanCountdown, nextTriggerAt } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

type Friend = { id: string; username: string; display_name: string | null; avatar_url: string | null; alarm_time: string | null; alarm_active: boolean };

function HomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const overviewFn = useServerFn(getMyOverview);
  const circleFn = useServerFn(getCircle);
  const updateAlarmFn = useServerFn(updateAlarm);
  const wakeFn = useServerFn(getWakeQueue);

  const { data: overview } = useQuery({ queryKey: ["overview"], queryFn: () => overviewFn() });
  const { data: circle } = useQuery({ queryKey: ["circle"], queryFn: () => circleFn() });

  const alarmTime = overview?.alarm?.alarm_time?.slice(0, 5) ?? "07:00";
  const isActive = overview?.alarm?.is_active ?? false;
  const [editH, editM] = alarmTime.split(":").map(Number);

  const mut = useMutation({
    mutationFn: (p: { alarmTime: string; isActive: boolean }) => updateAlarmFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overview"] }),
  });

  // Live clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Alarm trigger loop
  useEffect(() => {
    if (!isActive) return;
    const target = nextTriggerAt(alarmTime);
    const i = setInterval(() => {
      if (Date.now() >= target.getTime()) {
        if (typeof window !== "undefined" && window.location.pathname !== "/wake") {
          navigate({ to: "/wake" });
        }
      }
    }, 1000);
    return () => clearInterval(i);
  }, [alarmTime, isActive, navigate]);

  const target = useMemo(() => nextTriggerAt(alarmTime), [alarmTime, now]);

  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);

  function setTime(h: number, m: number) {
    const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    mut.mutate({ alarmTime: t, isActive });
  }

  async function invite() {
    const url = window.location.origin;
    const text = "Despierta conmigo en SurpriseWake — la alarma que se enciende con la voz de las personas que quieres.";
    if (navigator.share) {
      try { await navigator.share({ title: "SurpriseWake", text, url }); } catch { /* user cancel */ }
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success("Invitación copiada al portapapeles");
    }
  }

  // preload wake queue (so we know if there are messages today)
  const { data: queue } = useQuery({ queryKey: ["wakeQueue"], queryFn: () => wakeFn({ data: {} }), refetchInterval: 60_000 });
  const queueCount = queue?.length ?? 0;

  const username = overview?.profile?.display_name || overview?.profile?.username || "tú";

  return (
    <MobileShell>
      <div className="px-6 pt-12">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Buenos días, {username}</div>
            <div className="font-display text-[88px] leading-none tabular mt-3">
              {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
            </div>
            <div className="text-xs text-muted-foreground mt-2 tabular">
              {now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>
          {(overview?.profile?.streak_count ?? 0) > 0 && (
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-accent">
              <Sparkles className="h-3 w-3" strokeWidth={1.5} />
              <span className="text-xs tabular">{overview!.profile!.streak_count}</span>
            </div>
          )}
        </div>

        {/* Alarm card */}
        <div className="mt-10 p-5 rounded-3xl bg-card border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Próxima alarma</div>
              <div className="font-display text-5xl tabular mt-1">{alarmTime}</div>
            </div>
            <Switch checked={isActive} onCheckedChange={(v) => mut.mutate({ alarmTime, isActive: v })} />
          </div>
          {isActive && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <AlarmClockCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
              {queueCount > 0
                ? `${queueCount} ${queueCount === 1 ? "mensaje espera" : "mensajes esperan"} • Sonará ${humanCountdown(target)}`
                : `Sonará ${humanCountdown(target)} con un sonido zen si nadie te escribe.`}
            </div>
          )}
          {/* Time picker */}
          <div className="mt-5 flex items-center justify-center gap-2">
            <TimeColumn value={editH} max={23} onChange={(h) => setTime(h, editM)} />
            <span className="font-display text-3xl">:</span>
            <TimeColumn value={editM} max={59} step={5} onChange={(m) => setTime(editH, m)} />
          </div>
        </div>

        {/* Circle */}
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Tu círculo</div>
              <h2 className="font-display text-2xl mt-1">Envíales un amanecer</h2>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={invite}>
              <Share2 className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>

          {circle && circle.length > 0 ? (
            <div className="mt-5 flex gap-3 overflow-x-auto no-scrollbar -mx-6 px-6 pb-2">
              {circle.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFriend(f as Friend)}
                  className="flex-shrink-0 flex flex-col items-center gap-2 w-20"
                >
                  <Avatar src={f.avatar_url} name={f.display_name || f.username} active={f.alarm_active} />
                  <span className="text-xs truncate w-full text-center">{f.display_name || f.username}</span>
                </button>
              ))}
              <button
                onClick={() => navigate({ to: "/circle" })}
                className="flex-shrink-0 flex flex-col items-center gap-2 w-20"
              >
                <div className="h-16 w-16 rounded-full border border-dashed border-border flex items-center justify-center">
                  <Plus className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <span className="text-xs text-muted-foreground">Añadir</span>
              </button>
            </div>
          ) : (
            <div className="mt-5 p-6 rounded-3xl border border-dashed border-border text-center">
              <p className="text-sm text-muted-foreground">Aún no hay nadie en tu círculo.</p>
              <Button variant="outline" className="mt-4 rounded-full" onClick={() => navigate({ to: "/circle" })}>
                Buscar amigos
              </Button>
            </div>
          )}
        </div>
      </div>

      <SendMessageSheet friend={selectedFriend} onClose={() => setSelectedFriend(null)} />
    </MobileShell>
  );
}

function Avatar({ src, name, active }: { src: string | null; name: string; active?: boolean }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="relative">
      <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center overflow-hidden border border-border">
        {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : <span className="font-display text-2xl">{initial}</span>}
      </div>
      {active && (
        <div className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-[color:var(--ember)] border-2 border-background" />
      )}
    </div>
  );
}

function TimeColumn({ value, max, step = 1, onChange }: { value: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col items-center">
      <button onClick={() => onChange(((value + step) > max ? 0 : value + step))} className="text-muted-foreground text-xs h-6">▲</button>
      <div className={cn("font-display text-4xl tabular w-16 text-center py-1")}>
        {String(value).padStart(2, "0")}
      </div>
      <button onClick={() => onChange(value - step < 0 ? max - ((max + 1) % step) : value - step)} className="text-muted-foreground text-xs h-6">▼</button>
    </div>
  );
}
