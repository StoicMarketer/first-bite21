import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star, StarOff, Play, AlarmClock } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { MobileShell } from "@/components/mobile-shell";
import { Button } from "@/components/ui/button";
import { getInboxData, saveMessage, getQueuedMessages } from "@/lib/messages.functions";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const navigate = useNavigate();
  const inboxFn = useServerFn(getInboxData);
  const saveFn = useServerFn(saveMessage);
  const queuedFn = useServerFn(getQueuedMessages);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["inbox"], queryFn: () => inboxFn() });
  const { data: queued } = useQuery({ queryKey: ["queued"], queryFn: () => queuedFn() });
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const save = useMutation({
    mutationFn: (p: { messageId: string; save: boolean }) => saveFn({ data: p }),
    onSuccess: (r) => {
      if (!r.ok) toast.message("Solo puedes guardar 3 amaneceres. Plan Sunrise llega pronto ✨");
      else qc.invalidateQueries({ queryKey: ["inbox"] });
    },
  });

  function play(id: string, url: string) {
    if (audioRef.current) audioRef.current.pause();
    const a = new Audio(url);
    audioRef.current = a;
    a.onended = () => setPlaying(null);
    a.play();
    setPlaying(id);
  }

  return (
    <MobileShell>
      <div className="px-6 pt-12">
        <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Bandeja</div>
        <h1 className="font-display text-4xl mt-2">Tus amaneceres.</h1>

        <div className="mt-8">
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">En cola</div>
          <p className="text-xs text-muted-foreground mt-1">Sonará uno por día. El resto te espera aquí.</p>
          <div className="mt-3 space-y-2">
            {queued && queued.length > 0 ? queued.map((m) => (
              <div key={m.id} className="p-4 rounded-2xl bg-card border border-border flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground truncate">
                    {m.channel ? `${m.channel.cover_emoji ?? "✨"} ${m.channel.name}` : `de @${m.sender?.username ?? "alguien"}`}
                  </div>
                  <div className="text-sm mt-0.5 truncate">{m.kind === "text" ? m.text_content : "🎙️ Audio"}</div>
                </div>
                <Button size="sm" variant="outline" className="rounded-full gap-1 flex-shrink-0" onClick={() => navigate({ to: "/wake", search: { force: true, messageId: m.id } })}>
                  <AlarmClock className="h-3.5 w-3.5" strokeWidth={1.5} /> Escuchar
                </Button>
              </div>
            )) : <p className="text-sm text-muted-foreground py-4">Nada en cola. Vuelve mañana.</p>}
          </div>
        </div>

        <div className="mt-8">
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Guardados</div>
          <div className="mt-3 space-y-2">
            {data?.saved?.length ? data.saved.map((m) => (
              <div key={m.id} className="p-4 rounded-2xl bg-card border border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">de @{m.sender?.username ?? "alguien"}</div>
                    <div className="text-sm mt-1">{m.kind === "text" ? m.text_content : "Mensaje de voz"}</div>
                  </div>
                  <div className="flex gap-1">
                    {m.kind === "audio" && m.signedUrl && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => play(m.id, m.signedUrl!)}>
                        <Play className={`h-4 w-4 ${playing === m.id ? "text-[color:var(--ember)]" : ""}`} strokeWidth={1.5} />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => save.mutate({ messageId: m.id, save: false })}>
                      <StarOff className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground py-4">Aún no has guardado ningún amanecer.</p>}
          </div>
        </div>

        <div className="mt-10">
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Enviados</div>
          <div className="mt-3 space-y-2">
            {data?.sent?.length ? data.sent.map((m) => (
              <div key={m.id} className="p-4 rounded-2xl bg-card border border-border flex items-center justify-between">
                <div>
                  <div className="text-sm">para @{m.receiver?.username ?? "alguien"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {m.kind === "audio" ? "Audio" : "Texto"} · {m.is_played ? "Escuchado" : `Programado · ${m.scheduled_for}`}
                  </div>
                </div>
                <div className={`h-2 w-2 rounded-full ${m.is_played ? "bg-[color:var(--ember)]" : "bg-muted-foreground/40"}`} />
              </div>
            )) : <p className="text-sm text-muted-foreground py-4">Aún no has enviado mensajes. Ve a Alarma y toca un amigo de tu círculo.</p>}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}

// Star icon used elsewhere — kept import to avoid tree-shake warning if added later
void Star;
