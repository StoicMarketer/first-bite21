import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MobileShell } from "@/components/mobile-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createChannel } from "@/lib/channels.functions";

export const Route = createFileRoute("/_authenticated/channels/new")({
  component: NewChannel,
});

const EMOJIS = ["✨", "🔥", "☀️", "🌙", "🧘", "🏃", "💪", "🎧", "🚀", "💜", "🌊", "🌱"];

function NewChannel() {
  const navigate = useNavigate();
  const createFn = useServerFn(createChannel);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("✨");
  const [visibility, setVisibility] = useState<"public" | "unlisted">("unlisted");

  const create = useMutation({
    mutationFn: () => createFn({ data: { name, description, coverEmoji: emoji, visibility } }),
    onSuccess: (r) => {
      toast.success("Tu canal está listo");
      navigate({ to: "/channels/$slug", params: { slug: r.slug }, search: { invite: r.inviteCode } as never });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <MobileShell>
      <div className="px-6 pt-12 pb-8">
        <button onClick={() => navigate({ to: "/channels" })} className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Canales
        </button>

        <div className="mt-6">
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Crear canal</div>
          <h1 className="font-display text-4xl mt-2">Despierta a tu gente.</h1>
          <p className="text-sm text-muted-foreground mt-3">
            Crea tu canal, comparte el enlace y empieza a enviar despertares a tu tribu.
          </p>
        </div>

        <div className="mt-8 space-y-5">
          <div>
            <label className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Nombre</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Mañanas brutales" className="mt-2 h-12 rounded-2xl" />
          </div>

          <div>
            <label className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Descripción</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} placeholder="De qué va tu canal" className="mt-2 rounded-2xl min-h-[80px]" />
          </div>

          <div>
            <label className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Icono</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => setEmoji(e)} className={`h-11 w-11 rounded-2xl text-2xl flex items-center justify-center border ${emoji === e ? "border-primary bg-accent" : "border-border bg-card"}`}>{e}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Visibilidad</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setVisibility("unlisted")} className={`p-3 rounded-2xl border text-left ${visibility === "unlisted" ? "border-primary bg-accent" : "border-border bg-card"}`}>
                <div className="text-sm font-medium">Privado por enlace</div>
                <div className="text-xs text-muted-foreground mt-1">Solo entran con tu enlace.</div>
              </button>
              <button type="button" onClick={() => setVisibility("public")} className={`p-3 rounded-2xl border text-left ${visibility === "public" ? "border-primary bg-accent" : "border-border bg-card"}`}>
                <div className="text-sm font-medium">Público</div>
                <div className="text-xs text-muted-foreground mt-1">Visible en el directorio.</div>
              </button>
            </div>
          </div>

          <Button disabled={name.trim().length < 3 || create.isPending} onClick={() => create.mutate()} className="w-full h-12 rounded-full gap-2">
            <Sparkles className="h-4 w-4" strokeWidth={1.5} /> {create.isPending ? "Creando…" : "Crear canal"}
          </Button>
        </div>
      </div>
    </MobileShell>
  );
}
