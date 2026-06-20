import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ChevronRight, Square, X } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { Button } from "@/components/ui/button";
import { getWakeQueue, markPlayed, saveMessage, sendReaction, updateAlarm } from "@/lib/messages.functions";
import { getAiWakeMessage } from "@/lib/ai-wake.functions";
import { primeAudio, startRecorder } from "@/lib/audio-context";
import { wakeAudio } from "@/lib/wake-audio";
import { toast } from "sonner";

const search = z.object({ force: z.boolean().optional(), messageId: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/wake")({
  validateSearch: (s) => search.parse(s),
  component: WakePage,
});

type WakeMessage = {
  id: string;
  sender_id: string;
  kind: "audio" | "text";
  audio_path: string | null;
  text_content: string | null;
  signedUrl: string | null;
  is_ai?: boolean;
  sender?: { id?: string; username: string; display_name: string | null; avatar_url?: string | null };
};

function WakePage() {
  const navigate = useNavigate();
  const { force, messageId } = Route.useSearch();
  const queueFn = useServerFn(getWakeQueue);
  const aiFn = useServerFn(getAiWakeMessage);
  const markFn = useServerFn(markPlayed);
  const saveFn = useServerFn(saveMessage);
  const reactFn = useServerFn(sendReaction);
  const updateAlarmFn = useServerFn(updateAlarm);

  const { data: queueData, isLoading } = useQuery({
    queryKey: ["wakeQueue", force, messageId],
    queryFn: () => queueFn({ data: { force: !!force, messageId } }),
  });

  // Fallback AI message when no real messages in queue
  const noHuman = !!queueData && queueData.messages.length === 0;
  const { data: aiMsg } = useQuery({
    queryKey: ["aiWake"],
    queryFn: () => aiFn(),
    enabled: noHuman,
  });

  const queue: WakeMessage[] =
    queueData && queueData.messages.length > 0
      ? (queueData.messages as WakeMessage[])
      : aiMsg
        ? [{
            id: "ai",
            sender_id: "ai",
            kind: "text" as const,
            audio_path: null,
            text_content: aiMsg.text,
            signedUrl: null,
            is_ai: true,
            sender: { username: aiMsg.sender.username, display_name: aiMsg.sender.display_name },
          }]
        : [];

  const isBirthday = !!queueData?.isBirthday;

  const [phase, setPhase] = useState<"ringing" | "playing" | "reacting" | "done">("ringing");
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(new Date());
  const cancelledRef = useRef(false);
  const stopLoopRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      stopLoopRef.current = true;
      wakeAudio.stopAll();
    };
  }, []);

  useEffect(() => {
    if (phase !== "ringing") return;
    wakeAudio.playRingLoop();
    return () => wakeAudio.stopRing();
  }, [phase]);

  // Loop playback until the user stops the alarm.
  const playLoop = useCallback(async () => {
    if (cancelledRef.current) return;
    stopLoopRef.current = false;
    const list = queue;
    if (list.length === 0) {
      // No messages and no AI fallback ready: zen 30s then move to reacting/done.
      wakeAudio.playZen(30000);
      window.setTimeout(() => {
        if (!cancelledRef.current) {
          wakeAudio.stopZen();
          setPhase("done");
        }
      }, 30000);
      return;
    }

    // Sequence: single message (non-birthday) loops; birthday cycles all.
    // AI fallback text loops too.
    let i = 0;
    while (!cancelledRef.current && !stopLoopRef.current) {
      const msg = list[i % list.length];
      setIdx(i % list.length);

      if (msg.kind === "audio" && msg.signedUrl) {
        try {
          // For single message we use native loop; for birthday cycle we don't.
          const useNativeLoop = list.length === 1 && !isBirthday;
          await wakeAudio.playClip(msg.signedUrl, { loop: useNativeLoop });
          if (msg.id !== "ai") {
            try { await markFn({ data: { messageId: msg.id } }); } catch { /* noop */ }
          }
          if (useNativeLoop) {
            // playClip resolved immediately because of loop; keep this loop blocked.
            await new Promise<void>((resolve) => {
              const check = setInterval(() => {
                if (cancelledRef.current || stopLoopRef.current) {
                  clearInterval(check);
                  resolve();
                }
              }, 250);
            });
          }
        } catch {
          toast.error("No se pudo reproducir el audio");
        }
      } else if (msg.kind === "text" && msg.text_content) {
        await wakeAudio.speak(msg.text_content);
        if (msg.id !== "ai") {
          try { await markFn({ data: { messageId: msg.id } }); } catch { /* noop */ }
        }
      }

      if (stopLoopRef.current || cancelledRef.current) break;
      i++;
      // small breath between repetitions
      await new Promise((r) => setTimeout(r, 800));
    }
  }, [queue, isBirthday, markFn]);

  async function dismiss() {
    wakeAudio.stopRing();
    await primeAudio();
    setPhase("playing");
    void playLoop();
  }

  function stopAlarmAndReact() {
    stopLoopRef.current = true;
    wakeAudio.stopClip();
    wakeAudio.cancelSpeech();
    if (queue.length === 0 || queue[0]?.id === "ai") {
      setPhase("done");
    } else {
      setPhase("reacting");
    }
  }

  async function stopAndExit(disableAlarm = true) {
    cancelledRef.current = true;
    stopLoopRef.current = true;
    wakeAudio.stopAll();
    if (disableAlarm && !force && !messageId) {
      try {
        await updateAlarmFn({
          data: {
            alarmTime: `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`,
            isActive: false,
          },
        });
      } catch { /* ignore */ }
    }
    navigate({ to: "/home" });
  }

  const currentMessage = queue[idx] ?? null;

  return (
    <MobileShell hideTabBar>
      <div className="relative min-h-full dawn-bg text-[oklch(0.18_0.01_60)]">
        <button onClick={() => stopAndExit(true)} className="absolute top-5 right-5 z-10 h-9 w-9 rounded-full bg-black/10 backdrop-blur flex items-center justify-center">
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <div className="px-7 pt-16 pb-10 flex flex-col min-h-[100dvh]">
          <div className="text-[10px] tracking-[0.4em] uppercase opacity-70">
            {isBirthday ? "🎂 Feliz cumpleaños" : "Buenos días"}
          </div>
          <div className="font-display text-[96px] leading-none tabular mt-3">
            {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
          </div>
          <div className="text-xs opacity-60 mt-2 tabular">
            {now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
          </div>

          <div className="flex-1 flex flex-col justify-end">
            {phase === "ringing" && (
              <div className="space-y-6">
                <div className="text-center font-display text-2xl leading-snug max-w-xs mx-auto">
                  {isLoading
                    ? "…"
                    : queue.length > 0
                      ? isBirthday
                        ? `Hoy es tu día. ${queue.length} ${queue.length === 1 ? "mensaje" : "mensajes"} de felicitación.`
                        : queueData && queueData.queuedCount > 1
                          ? `Tienes un mensaje. ${queueData.queuedCount - 1} más en la cola para otros días.`
                          : "Tienes un mensaje esperando."
                      : "Empieza el día con calma."}
                </div>
                <SwipeToWake onComplete={dismiss} />
              </div>
            )}

            {phase === "playing" && currentMessage && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-[10px] tracking-[0.4em] uppercase opacity-70">de</div>
                  <div className="font-display text-3xl mt-1">
                    {currentMessage.sender?.display_name || currentMessage.sender?.username || "tu círculo"}
                  </div>
                  {currentMessage.is_ai && (
                    <div className="text-[10px] opacity-60 mt-1">Mensaje generado con IA</div>
                  )}
                </div>
                {currentMessage.kind === "text" && (
                  <Typewriter text={currentMessage.text_content ?? ""} />
                )}
                {currentMessage.kind === "audio" && (
                  <div className="flex items-center justify-center">
                    <div className="h-3 w-3 rounded-full bg-foreground/70 animate-pulse" />
                  </div>
                )}
                {isBirthday && queue.length > 1 && (
                  <div className="text-center text-xs opacity-60">{idx + 1} / {queue.length}</div>
                )}
                <Button onClick={stopAlarmAndReact} className="w-full h-14 rounded-full bg-foreground text-background gap-2">
                  <Square className="h-4 w-4" strokeWidth={1.5} /> Detener alarma
                </Button>
              </div>
            )}

            {phase === "reacting" && (
              <ReactionPanel
                lastMessage={queue[queue.length - 1]}
                onReact={async (emoji) => {
                  const last = queue[queue.length - 1];
                  if (last && last.id !== "ai") await reactFn({ data: { messageId: last.id, emoji } });
                  toast.success("Reacción enviada");
                  setPhase("done");
                }}
                onSave={async () => {
                  const last = queue[queue.length - 1];
                  if (last && last.id !== "ai") {
                    const r = await saveFn({ data: { messageId: last.id, save: true } });
                    if (!r.ok) toast.message("Tienes 3 amaneceres guardados. Plan Sunrise llega pronto ✨");
                    else toast.success("Amanecer guardado");
                  }
                }}
                onRecord={async (blob, mime) => {
                  const last = queue[queue.length - 1];
                  if (!last || last.id === "ai") { setPhase("done"); return; }
                  const ext = mime.includes("mp4") ? "mp4" : "webm";
                  const path = `${last.sender_id}/reaction-${Date.now()}.${ext}`;
                  const { supabase } = await import("@/integrations/supabase/client");
                  await supabase.storage.from("reactions").upload(path, blob, { contentType: mime });
                  await reactFn({ data: { messageId: last.id, audioPath: path } });
                  toast.success("Audio enviado");
                  setPhase("done");
                }}
                onSkip={() => setPhase("done")}
              />
            )}

            {phase === "done" && (
              <div className="space-y-5">
                <div className="text-center font-display text-2xl">Que tengas un buen día.</div>
                <Button onClick={() => stopAndExit(true)} className="w-full h-12 rounded-full bg-foreground text-background">
                  Continuar <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}

function SwipeToWake({ onComplete }: { onComplete: () => void }) {
  const x = useMotionValue(0);
  const bg = useTransform(x, [0, 220], ["oklch(0.18 0.01 60 / 0.08)", "oklch(0.18 0.01 60 / 0.25)"]);
  return (
    <div className="relative h-16 rounded-full bg-black/10 backdrop-blur overflow-hidden">
      <motion.div style={{ background: bg }} className="absolute inset-0" />
      <div className="absolute inset-0 flex items-center justify-center text-sm tracking-wider uppercase opacity-70">
        Desliza para despertar
      </div>
      <motion.button
        drag="x"
        dragConstraints={{ left: 0, right: 220 }}
        dragElastic={0.05}
        style={{ x }}
        onDragEnd={(_, info) => {
          if (info.point.x > 200 || x.get() > 180) onComplete();
        }}
        className="absolute top-1 left-1 h-14 w-14 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg active:scale-95"
      >
        <ChevronRight className="h-5 w-5" />
      </motion.button>
    </div>
  );
}

function Typewriter({ text }: { text: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const t = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, 40);
    return () => clearInterval(t);
  }, [text]);
  return <div className="font-display text-2xl leading-snug text-center px-4 max-w-sm mx-auto">"{shown}"</div>;
}

const EMOJIS = ["☀️", "🤍", "🙏", "✨", "🫶", "🌸"];

function ReactionPanel({
  lastMessage, onReact, onSave, onRecord, onSkip,
}: {
  lastMessage?: WakeMessage;
  onReact: (emoji: string) => Promise<void>;
  onSave: () => Promise<void>;
  onRecord: (blob: Blob, mime: string) => Promise<void>;
  onSkip: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((e) => (e >= 3 ? (stop(), 0) : e + 1)), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  async function start() {
    try {
      const { recorder, stream, mime } = await startRecorder();
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mime || "audio/webm" });
        await onRecord(blob, mime || "audio/webm");
      };
      recorder.start();
      recRef.current = recorder;
      streamRef.current = stream;
      setRecording(true);
      setElapsed(0);
    } catch {
      toast.error("Necesitamos permiso de micrófono");
    }
  }
  function stop() {
    if (recRef.current?.state === "recording") recRef.current.stop();
    setRecording(false);
  }

  return (
    <div className="space-y-4 bg-black/10 backdrop-blur rounded-3xl p-5">
      <div className="text-[10px] tracking-[0.4em] uppercase opacity-70">Devuelve un saludo a {lastMessage?.sender?.username ?? "tu círculo"}</div>
      <div className="flex justify-between gap-2">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => onReact(e)} className="h-12 w-12 rounded-full bg-background/60 text-2xl flex items-center justify-center active:scale-90 transition-transform">
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 rounded-full border-foreground/30 bg-transparent" onPointerDown={start} onPointerUp={stop}>
          {recording ? `Grabando ${elapsed}/3s` : "Mantén para grabar 3s"}
        </Button>
        <Button variant="outline" className="rounded-full border-foreground/30 bg-transparent" onClick={onSave}>
          ★
        </Button>
        <Button variant="ghost" className="rounded-full" onClick={onSkip}>Saltar</Button>
      </div>
    </div>
  );
}
