import { useEffect, useRef, useState, useCallback } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Mic, Send, Loader2, Play, Pause, RotateCcw, X, SkipBack, Check, AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sendMessage } from "@/lib/messages.functions";
import { checkAchievements } from "@/lib/gamification.functions";

import { startRecorder } from "@/lib/audio-context";
import { supabase } from "@/integrations/supabase/client";

type Friend = { id: string; username: string; display_name: string | null; avatar_url: string | null };

const MAX_RECORD_SECONDS = 30;
const REWIND_SECONDS = 5;

export function SendMessageSheet({ friend, onClose }: { friend: Friend | null; onClose: () => void }) {
  const [tab, setTab] = useState<"text" | "audio">("text");
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; url: string; mime: string; duration: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const qc = useQueryClient();
  const sendFn = useServerFn(sendMessage);
  const checkFn = useServerFn(checkAchievements);


  const sendText = useMutation({
    mutationFn: (payload: { receiverId: string; text: string }) =>
      sendFn({ data: { receiverId: payload.receiverId, kind: "text" as const, text: payload.text } }),
    onSuccess: async (res) => {
      toast.success("Mensaje enviado — llegará al amanecer.");
      if (res?.progress?.levelUp) toast.success(`¡Subiste a nivel ${res.progress.newLevel}! ☀`);
      setText("");
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      try { await checkFn(); } catch { /* silencioso */ }
      qc.invalidateQueries({ queryKey: ["unseen-achievements"] });
      qc.invalidateQueries({ queryKey: ["achievements"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const resetAll = useCallback(() => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setPlaying(false);
    setCurrentTime(0);
    setElapsed(0);
    setRecorder(null);
    setShowConfirm(false);
  }, [preview]);

  async function holdStart() {
    if (!friend || preview) return;
    try {
      const { recorder: r, stream: s, mime } = await startRecorder();
      const local: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size > 0) local.push(e.data); };
      r.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        if (local.length === 0) return;
        const blob = new Blob(local, { type: mime || "audio/webm" });
        const url = URL.createObjectURL(blob);
        setPreview({ blob, url, mime: mime || "audio/webm", duration: elapsed });
      };
      r.start();
      setRecorder(r);
      setStream(s);
      setRecording(true);
      setElapsed(0);
    } catch {
      toast.error("Necesitamos permiso de micrófono para grabar.");
    }
  }

  function holdEnd() {
    if (!recorder) return;
    if (recorder.state !== "inactive") recorder.stop();
    setRecording(false);
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
  }

  function skipBack() {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, el.currentTime - REWIND_SECONDS);
    setCurrentTime(el.currentTime);
  }

  function handleTimeUpdate() {
    const el = audioRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
  }

  function seekTo(e: React.PointerEvent<HTMLDivElement>) {
    const el = audioRef.current;
    const bar = progressRef.current;
    if (!el || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * el.duration;
    setCurrentTime(el.currentTime);
  }

  async function doSend() {
    if (!friend || !preview) return;
    setUploading(true);
    setShowConfirm(false);
    try {
      const ext = preview.mime.includes("mp4") ? "mp4" : "webm";
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const path = `${friend.id}/${uid}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("wake-audios").upload(path, preview.blob, { contentType: preview.mime, upsert: false });
      if (upErr) throw upErr;
      const res = await sendFn({ data: { receiverId: friend.id, kind: "audio" as const, audioPath: path } });
      toast.success("Audio enviado — llegará al amanecer.");
      if (res?.progress?.levelUp) toast.success(`¡Subiste a nivel ${res.progress.newLevel}! ☀`);
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      resetAll();
      onClose();
    } catch (e) {
      const m = e instanceof Error ? e.message : "Error al enviar";
      toast.error(m);
    } finally {
      setUploading(false);
    }
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  const recordProgress = Math.min(elapsed / MAX_RECORD_SECONDS, 1);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - recordProgress);

  const playDuration = preview?.duration || 0;
  const playProgress = playDuration > 0 ? Math.min(currentTime / playDuration, 1) : 0;

  return (
    <Drawer open={!!friend} onOpenChange={(o) => !o && handleClose()}>
      <DrawerContent className="bg-card border-border">
        <DrawerHeader className="text-left pb-2">
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Mensaje sorpresa para</div>
          <DrawerTitle className="font-display text-3xl">{friend?.display_name || friend?.username}</DrawerTitle>
          <p className="text-xs text-muted-foreground">Llegará oculto y solo se desbloqueará cuando suene su próxima alarma.</p>
        </DrawerHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "text" | "audio")} className="px-4 pb-8">
          <TabsList className="grid grid-cols-2 bg-muted rounded-full p-1 h-10">
            <TabsTrigger value="text" className="rounded-full">Escribir</TabsTrigger>
            <TabsTrigger value="audio" className="rounded-full">Grabar</TabsTrigger>
          </TabsList>
          <TabsContent value="text" className="mt-5 space-y-4">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Buenos días. Hoy quería decirte que…"
              rows={5}
              maxLength={280}
              className="rounded-2xl bg-background border-border resize-none"
            />
            <div className="text-right text-xs text-muted-foreground">{text.length}/280</div>
            <Button
              disabled={!text.trim() || sendText.isPending}
              onClick={() => friend && sendText.mutate({ receiverId: friend.id, text: text.trim() })}
              className="w-full h-12 rounded-full"
            >
              {sendText.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" />Enviar</>}
            </Button>
          </TabsContent>
          <TabsContent value="audio" className="mt-5">
            {!preview ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="text-xs text-muted-foreground">Mantén presionado para grabar (máx {MAX_RECORD_SECONDS}s)</div>
                <div className="relative">
                  <svg width="160" height="160" className="-rotate-90">
                    <circle cx="80" cy="80" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                    <circle
                      cx="80"
                      cy="80"
                      r={radius}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                      className="transition-all duration-1000 ease-linear"
                    />
                  </svg>
                  <button
                    onPointerDown={holdStart}
                    onPointerUp={holdEnd}
                    onPointerLeave={() => recording && holdEnd()}
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-28 w-28 rounded-full flex items-center justify-center transition-all select-none touch-none ${recording ? "bg-[color:var(--ember)] scale-110 shadow-[0_0_40px_oklch(0.62_0.14_45/0.4)]" : "bg-primary"}`}
                  >
                    <Mic className="h-10 w-10 text-primary-foreground" strokeWidth={1.5} />
                  </button>
                </div>
                <div className="font-display text-2xl tabular">{recording ? `${elapsed}s` : "—"}</div>
                {recording && elapsed >= MAX_RECORD_SECONDS && (() => { holdEnd(); return null; })()}
              </div>
            ) : !showConfirm ? (
              <div className="flex flex-col items-center gap-5 py-2">
                <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Revisa tu mensaje</div>
                <button
                  onClick={togglePlay}
                  disabled={uploading}
                  className="h-24 w-24 rounded-full flex items-center justify-center bg-primary transition-all hover:scale-105"
                >
                  {playing ? <Pause className="h-8 w-8 text-primary-foreground" strokeWidth={1.5} /> : <Play className="h-8 w-8 text-primary-foreground ml-1" strokeWidth={1.5} />}
                </button>
                <audio
                  ref={audioRef}
                  src={preview.url}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onTimeUpdate={handleTimeUpdate}
                  className="hidden"
                />
                {/* Progress bar */}
                <div className="w-full space-y-2">
                  <div
                    ref={progressRef}
                    className="w-full h-2 bg-muted rounded-full overflow-hidden cursor-pointer"
                    onPointerDown={seekTo}
                  >
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-75"
                      style={{ width: `${playProgress * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground tabular">
                    <span>{Math.floor(currentTime)}s</span>
                    <span>{preview.duration}s</span>
                  </div>
                </div>
                {/* Controls row */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={skipBack}
                    disabled={uploading}
                    className="h-12 w-12 rounded-full bg-muted flex items-center justify-center transition hover:bg-muted/80"
                  >
                    <SkipBack className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={togglePlay}
                    disabled={uploading}
                    className="h-14 w-14 rounded-full bg-primary flex items-center justify-center transition hover:scale-105"
                  >
                    {playing ? <Pause className="h-6 w-6 text-primary-foreground" /> : <Play className="h-6 w-6 text-primary-foreground ml-0.5" />}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 w-full pt-2">
                  <Button
                    variant="ghost"
                    onClick={handleClose}
                    disabled={uploading}
                    className="rounded-full h-12 text-muted-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />Cancelar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetAll}
                    disabled={uploading}
                    className="rounded-full h-12 border-border"
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />Rehacer
                  </Button>
                  <Button
                    onClick={() => setShowConfirm(true)}
                    disabled={uploading}
                    className="rounded-full h-12"
                  >
                    <Check className="h-4 w-4 mr-1" />Continuar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5 py-4">
                <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="font-display text-xl">¿Enviar mensaje?</h3>
                  <p className="text-sm text-muted-foreground">
                    Vas a enviar un audio de <strong>{preview.duration}s</strong> a{" "}
                    <strong>{friend?.display_name || friend?.username}</strong>.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Se ocultará hasta que su próxima alarma suene.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowConfirm(false)}
                    disabled={uploading}
                    className="rounded-full h-12 border-border"
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />Revisar
                  </Button>
                  <Button
                    onClick={doSend}
                    disabled={uploading}
                    className="rounded-full h-12"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" />Enviar</>}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}
