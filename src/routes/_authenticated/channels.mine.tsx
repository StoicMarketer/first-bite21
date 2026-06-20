import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Plus, Users } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { Button } from "@/components/ui/button";
import { myChannels } from "@/lib/channels.functions";

export const Route = createFileRoute("/_authenticated/channels/mine")({
  component: MyChannels,
});

function MyChannels() {
  const navigate = useNavigate();
  const myFn = useServerFn(myChannels);
  const { data } = useQuery({ queryKey: ["myChannels"], queryFn: () => myFn() });

  return (
    <MobileShell>
      <div className="px-6 pt-12 pb-8">
        <button onClick={() => navigate({ to: "/channels" })} className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> Canales
        </button>

        <div className="mt-6 flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Mis canales</div>
            <h1 className="font-display text-3xl mt-2">Tu tribu, tu voz.</h1>
          </div>
          <Button size="sm" className="rounded-full gap-1" onClick={() => navigate({ to: "/channels/new" })}>
            <Plus className="h-4 w-4" strokeWidth={1.5} /> Nuevo
          </Button>
        </div>

        <div className="mt-6 space-y-3">
          {data?.map((c) => (
            <Link key={c.id} to="/channels/$slug" params={{ slug: c.slug }} className="block p-4 rounded-3xl bg-card border border-border">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-2xl bg-accent flex items-center justify-center text-2xl">{c.cover_emoji ?? "✨"}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-lg leading-tight">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" strokeWidth={1.5} /> {c.memberCount}</span>
                    <span>· {c.visibility === "public" ? "Público" : "Por enlace"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 font-mono">/c/{c.invite_code}</div>
                </div>
              </div>
            </Link>
          ))}
          {data && data.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">Aún no has creado ningún canal.</p>
              <Button className="mt-4 rounded-full gap-1" onClick={() => navigate({ to: "/channels/new" })}>
                <Plus className="h-4 w-4" strokeWidth={1.5} /> Crear el primero
              </Button>
            </div>
          )}
        </div>
      </div>
    </MobileShell>
  );
}
