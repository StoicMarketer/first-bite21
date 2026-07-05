import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Share2, Plus, AlarmClockCheck, Sparkles, Trash2, ChevronDown, Star } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileShell } from "@/components/mobile-shell";
import { SendMessageSheet } from "@/components/send-message-sheet";
import { PushBanner } from "@/components/push-banner";
import { getMyOverview, updateAlarm, createAlarm, deleteAlarm, getWakeQueue } from "@/lib/messages.functions";
import { getCircle, toggleFavorite } from "@/lib/friends.functions";
import { cn, humanCountdown, nextTriggerForAlarm } from "@/lib/utils";

// Spanish weekday labels. Index 0 = Sunday to match JS Date#getDay().
const DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];
const DAY_FULL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function formatDays(days: number[] | null | undefined): string {
  const d = (days && days.length > 0) ? [...days].sort((a, b) => a - b) : ALL_DAYS;
  if (d.length === 7) return "Todos los días";
  const weekdays = [1, 2, 3, 4, 5];
  const weekend = [0, 6];
  if (d.length === 5 && weekdays.every((x) => d.includes(x))) return "Lunes a viernes";
  if (d.length === 2 && weekend.every((x) => d.includes(x))) return "Fines de semana";
  // Show in week order starting Monday
  const ordered = [1, 2, 3, 4, 5, 6, 0].filter((x) => d.includes(x));
  return ordered.map((x) => DAY_LABELS[x]).join(" · ");
}

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

type Friend = { id: string; username: string; display_name: string | null; avatar_url: string | null; alarm_time: string | null; alarm_active: boolean };

type AlarmRow = { id: string; alarm_time: string; is_active: boolean; label: string | null; days_of_week: number[] | null };

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
    const raw = (overview?.alarms ?? []) as Array<{ id: string; alarm_time: string; is_active: boolean; label: string | null; days_of_week: number[] | null }>;
    return [...raw]
      .map((a) => ({ ...a, alarm_time: a.alarm_time.slice(0, 5), days_of_week: a.days_of_week ?? ALL_DAYS }))
      .sort((a, b) => a.alarm_time.localeCompare(b.alarm_time));
  }, [overview]);

  const updateMut = useMutation({
    mutationFn: (p: { id: string; alarmTime: string; isActive: boolean; label?: string | null; daysOfWeek?: number[] }) => updateAlarmFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overview"] }),
  });
  const createMut = useMutation({
    mutationFn: (p: { alarmTime: string; isActive: boolean; label?: string; daysOfWeek?: number[] }) => createAlarmFn({ data: p }),
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

  // Trigger navigation to /wake as soon as any active alarm hits its time (respecting days_of_week).
  useEffect(() => {
    const actives = alarms.filter((a) => a.is_active);
    if (actives.length === 0) return;
    const i = setInterval(() => {
      const d = new Date();
      const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const today = d.getDay();
      const hit = actives.some((a) => {
        const days = (a.days_of_week && a.days_of_week.length > 0) ? a.days_of_week : ALL_DAYS;
        return a.alarm_time === hhmm && days.includes(today);
      });
      if (hit && typeof window !== "undefined" && window.location.pathname !== "/wake") {
        navigate({ to: "/wake" });
      }
    }, 1000);
    return () => clearInterval(i);
  }, [alarms, navigate]);

  // Next upcoming alarm (soonest active).
  const nextAlarm = useMemo(() => {
    const actives = alarms.filter((a) => a.is_active);
    if (actives.length === 0) return null;
    const sorted = [...actives].sort(
      (a, b) => nextTriggerForAlarm(a.alarm_time, a.days_of_week).getTime() - nextTriggerForAlarm(b.alarm_time, b.days_of_week).getTime()
    );
    return sorted[0];
  }, [alarms, now]);

  const nextTarget = useMemo(
    () => (nextAlarm ? nextTriggerForAlarm(nextAlarm.alarm_time, nextAlarm.days_of_week) : null),
    [nextAlarm, now]
  );

  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(7);
  const [draftMinute, setDraftMinute] = useState(0);
  const [draftDays, setDraftDays] = useState<number[]>(ALL_DAYS);
  const [draftLabel, setDraftLabel] = useState("");


  function openCreate() {
    let hh = 7, mm = 0;
    if (alarms.length > 0) {
      const last = alarms[alarms.length - 1].alarm_time;
      const [lh, lm] = last.split(":").map(Number);
      hh = (lh + 1) % 24;
      mm = lm;
    }
    setDraftHour(hh);
    setDraftMinute(mm);
    setDraftDays(ALL_DAYS);
    setDraftLabel("");
    setCreateOpen(true);
  }


  async function saveNewAlarm() {
    const t = `${String(draftHour).padStart(2, "0")}:${String(draftMinute).padStart(2, "0")}`;
    const days = draftDays.length > 0 ? draftDays : ALL_DAYS;
    const label = draftLabel.trim();
    await createMut.mutateAsync({
      alarmTime: t,
      isActive: true,
      daysOfWeek: days,
      ...(label ? { label } : {}),
    });
    setCreateOpen(false);
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
              onClick={openCreate}
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
              onClick={openCreate}
              className="w-full p-5 rounded-3xl border border-dashed border-border text-sm text-muted-foreground text-left"
            >
              Aún no hay alarmas. Toca + para crear la primera.
            </button>
          )}
          {alarms.map((a) => {
            const [h, m] = a.alarm_time.split(":").map(Number);
            const expanded = expandedId === a.id;
            const dayText = formatDays(a.days_of_week);
            const subText = a.label ? `${dayText} · ${a.label}` : dayText;
            return (
              <div key={a.id} className="rounded-3xl bg-card border border-border overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4">
                  <button
                    onClick={() => setExpandedId(expanded ? null : a.id)}
                    className="flex items-center gap-3 flex-1 text-left min-w-0"
                  >
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "font-display text-4xl tabular leading-none",
                          !a.is_active && "text-muted-foreground/60"
                        )}
                      >
                        {a.alarm_time}
                      </div>
                      <div className={cn(
                        "text-[11px] mt-1.5 truncate",
                        a.is_active ? "text-muted-foreground" : "text-muted-foreground/50"
                      )}>
                        {subText}
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform shrink-0",
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
                  <div className="border-t border-border px-5 py-4 space-y-5">
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
                    <div>
                      <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2 text-center">Repetir</div>
                      <DayPicker
                        value={a.days_of_week ?? ALL_DAYS}
                        onChange={(days) => updateMut.mutate({
                          id: a.id,
                          alarmTime: a.alarm_time,
                          isActive: a.is_active,
                          daysOfWeek: days,
                        })}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Nota</div>
                      <LabelInput
                        initial={a.label ?? ""}
                        onSave={(label) => updateMut.mutate({
                          id: a.id,
                          alarmTime: a.alarm_time,
                          isActive: a.is_active,
                          label: label || null,
                        })}
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

      {createOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in-0"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="relative bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground text-center">
              Nueva alarma
            </div>
            <div className="mt-6 flex items-center justify-center gap-3">
              <TimeColumn value={draftHour} max={23} onChange={setDraftHour} />
              <span className="font-display text-4xl">:</span>
              <TimeColumn value={draftMinute} max={59} onChange={setDraftMinute} />
            </div>
            <div className="mt-6">
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2 text-center">Repetir</div>
              <DayPicker value={draftDays} onChange={setDraftDays} />
            </div>
            <div className="mt-5">
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Nota</div>
              <Input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value.slice(0, 40))}
                placeholder="Ej: Trabajo, gimnasio…"
                className="rounded-full h-10"
              />
            </div>
            <div className="mt-6 flex gap-3">
              <Button variant="ghost" className="flex-1 rounded-full" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1 rounded-full" onClick={saveNewAlarm} disabled={createMut.isPending}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
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

function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  // Render in week order starting Monday: L M X J V S D
  const order = [1, 2, 3, 4, 5, 6, 0];
  function toggle(d: number) {
    const has = value.includes(d);
    const next = has ? value.filter((x) => x !== d) : [...value, d];
    onChange(next.sort((a, b) => a - b));
  }
  return (
    <div className="flex items-center justify-between gap-1.5">
      {order.map((d) => {
        const active = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-label={DAY_FULL[d]}
            aria-pressed={active}
            onClick={() => toggle(d)}
            className={cn(
              "h-9 w-9 rounded-full text-xs font-medium transition-colors border",
              active
                ? "bg-foreground text-background border-foreground"
                : "bg-transparent text-muted-foreground border-border hover:text-foreground"
            )}
          >
            {DAY_LABELS[d]}
          </button>
        );
      })}
    </div>
  );
}

function LabelInput({ initial, onSave }: { initial: string; onSave: (label: string) => void }) {
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(initial); }, [initial]);
  return (
    <Input
      value={val}
      onChange={(e) => setVal(e.target.value.slice(0, 40))}
      onBlur={() => { if (val.trim() !== initial.trim()) onSave(val.trim()); }}
      placeholder="Ej: Trabajo, gimnasio…"
      className="rounded-full h-10"
    />
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
