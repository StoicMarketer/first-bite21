import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Share2, Plus, AlarmClockCheck, Sparkles, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MobileShell } from "@/components/mobile-shell";
import { SendMessageSheet } from "@/components/send-message-sheet";
import { PushBanner } from "@/components/push-banner";
import { getMyOverview, updateAlarm, createAlarm, deleteAlarm, getWakeQueue } from "@/lib/messages.functions";
import { getCircle } from "@/lib/friends.functions";
import { cn, humanCountdown, nextTriggerAt } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

type Friend = { id: string; username: string; display_name: string | null; avatar_url: string | null; alarm_time: string | null; alarm_active: boolean };

type AlarmRow = { id: string; alarm_time: string; is_active: boolean; label: string | null };

function HomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const overviewFn = useServerFn(getMyOverview);
  const circleFn = useServerFn(getCircle);
  const updateAlarmFn = useServerFn(updateAlarm);
  const createAlarmFn = useServerFn(createAlarm);
  const deleteAlarmFn = useServerFn(deleteAlarm);
  const wakeFn = useServerFn(getWakeQueue);

  const { data: overview } = useQuery({ queryKey: ["overview"], queryFn: () => overviewFn() });
  const { data: circle } = useQuery({ queryKey: ["circle"], queryFn: () => circleFn() });

  const alarms: AlarmRow[] = useMemo(() => {
    const raw = (overview?.alarms ?? []) as Array<{ id: string; alarm_time: string; is_active: boolean; label: string | null }>;
    return [...raw]
      .map((a) => ({ ...a, alarm_time: a.alarm_time.slice(0, 5) }))
      .sort((a, b) => a.alarm_time.localeCompare(b.alarm_time));
  }, [overview]);

  const updateMut = useMutation({
    mutationFn: (p: { id: string; alarmTime: string; isActive: boolean }) => updateAlarmFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overview"] }),
  });
  const createMut = useMutation({
    mutationFn: (p: { alarmTime: string; isActive: boolean }) => createAlarmFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overview"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAlarmFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overview"] }),
  });

  // Live clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Trigger navigation to /wake as soon as any active alarm hits its time.
  useEffect(() => {
    const actives = alarms.filter((a) => a.is_active);
    if (actives.length === 0) return;
    const targets = actives.map((a) => nextTriggerAt(a.alarm_time).getTime());
    const i = setInterval(() => {
      const t = Date.now();
      if (targets.some((tt) => t >= tt)) {
        if (typeof window !== "undefined" && window.location.pathname !== "/wake") {
          navigate({ to: "/wake" });
        }
      }
    }, 1000);
    return () => clearInterval(i);
  }, [alarms, navigate]);

  // Next upcoming alarm (soonest active).
  const nextAlarm = useMemo(() => {
    const actives = alarms.filter((a) => a.is_active);
    if (actives.length === 0) return null;
    const sorted = [...actives].sort(
      (a, b) => nextTriggerAt(a.alarm_time).getTime() - nextTriggerAt(b.alarm_time).getTime()
    );
    return sorted[0];
  }, [alarms, now]);

  const nextTarget = useMemo(
    () => (nextAlarm ? nextTriggerAt(nextAlarm.alarm_time) : null),
    [nextAlarm, now]
  );

  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function addAlarm() {
    // Suggest a time 1h after the latest existing alarm, else 07:00.
    let hh = 7, mm = 0;
    if (alarms.length > 0) {
      const last = alarms[alarms.length - 1].alarm_time;
      const [lh, lm] = last.split(":").map(Number);
      hh = (lh + 1) % 24;
      mm = lm;
    }
    const t = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const created = await createMut.mutateAsync({ alarmTime: t, isActive: true });
    if (created && typeof created === "object" && "id" in created) {
      setExpandedId((created as { id: string }).id);
    }
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
  const { data: queueData } = useQuery({ queryKey: ["wakeQueue"], queryFn: () => wakeFn({ data: {} }), refetchInterval: 60_000 });
  const queueCount = queueData?.queuedCount ?? 0;

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

        <PushBanner />

        {/* Next alarm summary */}
        <div className="mt-6 p-5 rounded-3xl bg-card border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Próxima alarma</div>
              <div className="font-display text-5xl tabular mt-1">
                {nextAlarm ? nextAlarm.alarm_time : "--:--"}
              </div>
            </div>
            <button
              onClick={addAlarm}
              aria-label="Añadir alarma"
              className="h-11 w-11 rounded-full bg-foreground text-background flex items-center justify-center active:scale-95 transition-transform"
            >
              <Plus className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>
          {nextAlarm && nextTarget && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <AlarmClockCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
              {queueCount > 0
                ? `${queueCount} ${queueCount === 1 ? "mensaje espera" : "mensajes esperan"} • Sonará ${humanCountdown(nextTarget)}`
                : `Sonará ${humanCountdown(nextTarget)} con un sonido zen si nadie te escribe.`}
            </div>
          )}
        </div>

        {/* Alarm list */}
        <div className="mt-4 space-y-3">
          {alarms.length === 0 && (
            <button
              onClick={addAlarm}
              className="w-full p-5 rounded-3xl border border-dashed border-border text-sm text-muted-foreground text-left"
            >
              Aún no hay alarmas. Toca + para crear la primera.
            </button>
          )}
          {alarms.map((a) => {
            const [h, m] = a.alarm_time.split(":").map(Number);
            const expanded = expandedId === a.id;
            return (
              <div key={a.id} className="rounded-3xl bg-card border border-border overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4">
                  <button
                    onClick={() => setExpandedId(expanded ? null : a.id)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <span
                      className={cn(
                        "font-display text-4xl tabular",
                        !a.is_active && "text-muted-foreground/60"
                      )}
                    >
                      {a.alarm_time}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        expanded && "rotate-180"
                      )}
                      strokeWidth={1.5}
                    />
                  </button>
                  <Switch
                    checked={a.is_active}
                    onCheckedChange={(v) =>
                      updateMut.mutate({ id: a.id, alarmTime: a.alarm_time, isActive: v })
                    }
                  />
                </div>
                {expanded && (
                  <div className="border-t border-border px-5 py-4 space-y-4">
                    <div className="flex items-center justify-center gap-2">
                      <TimeColumn
                        value={h}
                        max={23}
                        onChange={(nh) =>
                          updateMut.mutate({
                            id: a.id,
                            alarmTime: `${String(nh).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
                            isActive: a.is_active,
                          })
                        }
                      />
                      <span className="font-display text-3xl">:</span>
                      <TimeColumn
                        value={m}
                        max={59}
                        onChange={(nm) =>
                          updateMut.mutate({
                            id: a.id,
                            alarmTime: `${String(h).padStart(2, "0")}:${String(nm).padStart(2, "0")}`,
                            isActive: a.is_active,
                          })
                        }
                      />
                    </div>
                    <button
                      onClick={() => {
                        deleteMut.mutate(a.id);
                        setExpandedId(null);
                      }}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Eliminar alarma
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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
