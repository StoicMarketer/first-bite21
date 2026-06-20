import { useEffect, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Mic, Send, Loader2 } from "lucide-react";
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
  const [chunks, setChunks] = useState<Blob[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
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

  async function holdStart() {
    if (!friend) return;
    try {
      const { recorder: r, stream: s, mime } = await startRecorder();
      const local: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size > 0) local.push(e.data); };
      r.onstop = async () => {
        setChunks(local);
        s.getTracks().forEach((t) => t.stop());
        await uploadAndSend(local, mime || "audio/webm");
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

  async function uploadAndSend(blobs: Blob[], mime: string) {
    if (!friend) return;
    if (blobs.length === 0) return;
    setUploading(true);
    try {
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(blobs, { type: mime });
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const path = `${friend.id}/${uid}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("wake-audios").upload(path, blob, { contentType: mime, upsert: false });
      if (upErr) throw upErr;
      await sendFn({ data: { receiverId: friend.id, kind: "audio" as const, audioPath: path } });
      toast.success("Audio enviado — llegará al amanecer.");
      qc.invalidateQueries({ queryKey: ["inbox"] });
      onClose();
    } catch (e) {
      const m = e instanceof Error ? e.message : "Error al enviar";
      toast.error(m);
    } finally {
      setUploading(false);
      setChunks([]);
    }
  }

  return (
    <Drawer open={!!friend} onOpenChange={(o) => !o && onClose()}>
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
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="text-xs text-muted-foreground">Mantén presionado para grabar (máx 30s)</div>
              <button
                onPointerDown={holdStart}
                onPointerUp={holdEnd}
                onPointerLeave={() => recording && holdEnd()}
                disabled={uploading}
                className={`h-28 w-28 rounded-full flex items-center justify-center transition-all select-none touch-none ${recording ? "bg-[color:var(--ember)] scale-110 shadow-[0_0_40px_oklch(0.62_0.14_45/0.4)]" : "bg-primary"}`}
              >
                {uploading ? <Loader2 className="h-8 w-8 text-primary-foreground animate-spin" /> : <Mic className="h-10 w-10 text-primary-foreground" strokeWidth={1.5} />}
              </button>
              <div className="font-display text-2xl tabular">{recording ? `${elapsed}s` : uploading ? "Enviando…" : "—"}</div>
              {recording && elapsed >= 30 && (() => { holdEnd(); return null; })()}
            </div>
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}
