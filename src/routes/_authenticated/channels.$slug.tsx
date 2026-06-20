import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Send, Mic, Square, Users, Share2, Copy, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { MobileShell } from "@/components/mobile-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { getChannel, sendChannelMessage, subscribeChannel, unsubscribeChannel, updateSubscription, getMembersWithCode, rotateInviteCode, deleteChannel } from "@/lib/channels.functions";
import { startRecorder } from "@/lib/audio-context";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/channels/$slug")({
  component: ChannelDetail,
});

function ChannelDetail() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const getFn = useServerFn(getChannel);
  const sendFn = useServerFn(sendChannelMessage);
  const subFn = useServerFn(subscribeChannel);
  const unsubFn = useServerFn(unsubscribeChannel);
  const updateSubFn = useServerFn(updateSubscription);
  const membersFn = useServerFn(getMembersWithCode);
  const rotateFn = useServerFn(rotateInviteCode);
  const deleteFn = useServerFn(deleteChannel);

  const { data, refetch } = useQuery({ queryKey: ["channel", slug], queryFn: () => getFn({ data: { slug } }) });
  const { data: members } = useQuery({
    queryKey: ["channelMembers", data?.channel.id],
    queryFn: () => membersFn({ data: { channelId: data!.channel.id } }),
    enabled: !!data?.channel.id && !!data?.subscription,
  });

  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [uploading, setUploading] = useState(false);

  const sendText = useMutation({
    mutationFn: (t: string) => sendFn({ data: { channelId: data!.channel.id, kind: "text", text: t } }),
    onSuccess: () => { setText(""); toast.success("Despertar enviado al canal"); qc.invalidateQueries({ queryKey: ["channel", slug] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function startRec() {
    try {
      const { recorder, stream, mime } = await startRecorder();
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setUploading(true);
        try {
          const blob = new Blob(chunks, { type: mime || "audio/webm" });
          const ext = (mime || "").includes("mp4") ? "mp4" : "webm";
          const path = `channel/${data!.channel.id}/${Date.now()}.${ext}`;
          const up = await supabase.storage.from("wake-audios").upload(path, blob, { contentType: mime || "audio/webm" });
          if (up.error) throw up.error;
          await sendFn({ data: { channelId: data!.channel.id, kind: "audio", audioPath: path } });
          toast.success("Audio enviado al canal");
          qc.invalidateQueries({ queryKey: ["channel", slug] });
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Error al subir");
        } finally {
          setUploading(false);
        }
      };
      recorder.start();
      recRef.current = recorder;
      streamRef.current = stream;
      setRecording(true);
    } catch {
      toast.error("Necesitamos permiso de micrófono");
    }
  }
  function stopRec() {
    if (recRef.current?.state === "recording") recRef.current.stop();
    setRecording(false);
  }

  if (!data) {
    return <MobileShell><div className="px-6 pt-12 text-sm text-muted-foreground">Cargando…</div></MobileShell>;
  }

  const { channel, subscription, memberCount, recent } = data;
  const joined = !!subscription;

  return (
    <MobileShell>
      <div className="px-6 pt-12 pb-8">
        <button onClick={() => navigate({ to: "/channels" })} className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Canales
        </button>

        <div className="mt-6 flex items-start gap-4">
          <div className="h-16 w-16 rounded-3xl bg-accent flex items-center justify-center text-3xl">
            {channel.cover_emoji ?? "✨"}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl leading-tight">{channel.name}</h1>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Users className="h-3 w-3" strokeWidth={1.5} /> {memberCount} miembros
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{channel.description}</p>

        {!joined ? (
          <Button className="mt-6 w-full h-12 rounded-full" onClick={async () => { await subFn({ data: { channelId: channel.id } }); refetch(); toast.success("Te has unido al canal"); }}>
            Unirme al canal
          </Button>
        ) : (
          <>
            <InviteShareBlock
              channelName={channel.name}
              inviteCode={channel.invite_code as string | null}
              isOwner={!!user && channel.created_by === user.id}
              onRotate={async () => { const r = await rotateFn({ data: { channelId: channel.id } }); refetch(); toast.success("Nuevo enlace generado"); return r.inviteCode; }}
            />
            {user && channel.created_by === user.id && !channel.is_official && (
              <div className="mt-6 p-4 rounded-2xl bg-card border border-border space-y-3">
                <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Administración</div>
                <p className="text-xs text-muted-foreground">Eres el creador de este canal.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive gap-1"
                  onClick={async () => {
                    if (!confirm("¿Eliminar canal? Esta acción no se puede deshacer.")) return;
                    await deleteFn({ data: { channelId: channel.id } });
                    toast.message("Canal eliminado");
                    navigate({ to: "/channels" });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Eliminar canal
                </Button>
              </div>
            )}
            <div className="mt-6 p-4 rounded-2xl bg-card border border-border space-y-3">
              <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Tu participación</div>
              <SwitchRow
                label="Recibir despertares de este canal"
                checked={subscription!.allow_receive}
                onChange={async (v) => { await updateSubFn({ data: { channelId: channel.id, allowReceive: v } }); refetch(); }}
              />
              <SwitchRow
                label="Compartir mi código aquí"
                hint="Otros miembros podrán enviarte despertares directos."
                checked={subscription!.share_wake_code}
                onChange={async (v) => { await updateSubFn({ data: { channelId: channel.id, shareWakeCode: v } }); refetch(); }}
              />
              <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => { await unsubFn({ data: { channelId: channel.id } }); refetch(); toast.message("Te has salido"); }}>
                Salir del canal
              </Button>
            </div>

            <div className="mt-8 text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Enviar al canal</div>
            <div className="mt-3 p-4 rounded-3xl bg-card border border-border space-y-3">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={280}
                placeholder="Un buenos días para todo el canal…"
                className="min-h-[80px] rounded-2xl bg-background"
              />
              <div className="flex gap-2">
                <Button onClick={() => text.trim() && sendText.mutate(text.trim())} disabled={!text.trim() || sendText.isPending} className="flex-1 rounded-full gap-1">
                  <Send className="h-4 w-4" strokeWidth={1.5} /> Enviar texto
                </Button>
                {recording ? (
                  <Button variant="destructive" onClick={stopRec} className="rounded-full gap-1">
                    <Square className="h-4 w-4" strokeWidth={1.5} /> Detener
                  </Button>
                ) : (
                  <Button variant="outline" onClick={startRec} disabled={uploading} className="rounded-full gap-1">
                    <Mic className="h-4 w-4" strokeWidth={1.5} /> {uploading ? "Subiendo…" : "Audio"}
                  </Button>
                )}
              </div>
            </div>

            {members && members.length > 0 && (
              <div className="mt-8">
                <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground flex items-center gap-2">
                  <Share2 className="h-3 w-3" strokeWidth={1.5} /> Miembros contactables
                </div>
                <div className="mt-3 space-y-2">
                  {members.map((m) => (
                    <div key={m.id} className="p-3 rounded-2xl bg-card border border-border flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center font-display">
                        {(m.display_name || m.username).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{m.display_name || m.username}</div>
                        <div className="text-xs text-muted-foreground">Código: {m.wake_code}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recent.length > 0 && (
              <div className="mt-8">
                <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Últimos despertares</div>
                <div className="mt-3 space-y-2">
                  {recent.map((m) => (
                    <div key={m.id} className="p-3 rounded-2xl bg-card border border-border">
                      <div className="text-xs text-muted-foreground">de @{m.sender?.username ?? "alguien"}</div>
                      <div className="text-sm mt-1">{m.kind === "text" ? m.text_content : "🎙️ Audio"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MobileShell>
  );
}

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function InviteShareBlock({ channelName, inviteCode, isOwner, onRotate }: { channelName: string; inviteCode: string | null; isOwner: boolean; onRotate: () => Promise<string>; }) {
  const [code, setCode] = useState(inviteCode ?? "");
  const url = typeof window !== "undefined" && code ? `${window.location.origin}/c/${code}` : "";

  if (!code) return null;
  return (
    <div className="mt-6 p-4 rounded-2xl bg-card border border-border space-y-3">
      <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground flex items-center gap-2">
        <Share2 className="h-3 w-3" strokeWidth={1.5} /> Invitar a este canal
      </div>
      <div className="text-xs text-muted-foreground">Comparte este enlace con tu gente:</div>
      <div className="flex items-center gap-2 p-2 rounded-xl bg-background border border-border">
        <code className="text-xs flex-1 truncate font-mono">{url}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(url); toast.success("Enlace copiado"); }}
          className="p-1.5 rounded-lg hover:bg-accent"
          aria-label="Copiar"
        >
          <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 rounded-full"
          onClick={async () => {
            const shareData = { title: channelName, text: `Únete a ${channelName} en SurpriseWake`, url };
            if (typeof navigator !== "undefined" && "share" in navigator) {
              try { await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share(shareData); } catch { /* cancelled */ }
            } else {
              navigator.clipboard.writeText(url); toast.success("Enlace copiado");
            }
          }}
        >
          Compartir
        </Button>
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full gap-1"
            onClick={async () => { const c = await onRotate(); setCode(c); }}
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} /> Rotar
          </Button>
        )}
      </div>
    </div>
  );
}
