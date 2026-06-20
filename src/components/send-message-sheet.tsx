import { useEffect, useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Mic, Send, Loader2, Play, Pause, RotateCcw, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sendMessage } from "@/lib/messages.functions";
import { startRecorder } from "@/lib/audio-context";
import { supabase } from "@/integrations/supabase/client";

type Friend = { id: string; username: string; display_name: string | null; avatar_url: string | null };

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const qc = useQueryClient();
  const sendFn = useServerFn(sendMessage);

  const sendText = useMutation({
    mutationFn: (payload: { receiverId: string; text: string }) =>
      sendFn({ data: { receiverId: payload.receiverId, kind: "text" as const, text: payload.text } }),
    onSuccess: () => {
      toast.success("Mensaje enviado — llegará al amanecer.");
      setText("");
      qc.invalidateQueries({ queryKey: ["inbox"] });
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

  function resetAll() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setPlaying(false);
    setElapsed(0);
    setRecorder(null);
  }

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
      el.currentTime = 0;
      el.play().catch(() => {});
    }
  }

  async function confirmSend() {
    if (!friend || !preview) return;
    setUploading(true);
    try {
      const ext = preview.mime.includes("mp4") ? "mp4" : "webm";
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const path = `${friend.id}/${uid}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("wake-audios").upload(path, preview.blob, { contentType: preview.mime, upsert: false });
      if (upErr) throw upErr;
      await sendFn({ data: { receiverId: friend.id, kind: "audio" as const, audioPath: path } });
      toast.success("Audio enviado — llegará al amanecer.");
      qc.invalidateQueries({ queryKey: ["inbox"] });
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
                <div className="text-xs text-muted-foreground">Mantén presionado para grabar (máx 30s)</div>
                <button
                  onPointerDown={holdStart}
                  onPointerUp={holdEnd}
                  onPointerLeave={() => recording && holdEnd()}
                  className={`h-28 w-28 rounded-full flex items-center justify-center transition-all select-none touch-none ${recording ? "bg-[color:var(--ember)] scale-110 shadow-[0_0_40px_oklch(0.62_0.14_45/0.4)]" : "bg-primary"}`}
                >
                  <Mic className="h-10 w-10 text-primary-foreground" strokeWidth={1.5} />
                </button>
                <div className="font-display text-2xl tabular">{recording ? `${elapsed}s` : "—"}</div>
                {recording && elapsed >= 30 && (() => { holdEnd(); return null; })()}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5 py-2">
                <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Revisa tu mensaje</div>
                <button
                  onClick={togglePlay}
                  disabled={uploading}
                  className="h-28 w-28 rounded-full flex items-center justify-center bg-primary transition-all hover:scale-105"
                >
                  {playing ? <Pause className="h-10 w-10 text-primary-foreground" strokeWidth={1.5} /> : <Play className="h-10 w-10 text-primary-foreground ml-1" strokeWidth={1.5} />}
                </button>
                <audio
                  ref={audioRef}
                  src={preview.url}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  className="hidden"
                />
                <div className="font-display text-2xl tabular">{preview.duration}s</div>
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
                    onClick={confirmSend}
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
