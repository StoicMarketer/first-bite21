import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Radio, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { MobileShell } from "@/components/mobile-shell";
import { Button } from "@/components/ui/button";
import { listChannels, subscribeChannel, unsubscribeChannel } from "@/lib/channels.functions";

export const Route = createFileRoute("/_authenticated/channels/")({
  component: ChannelsPage,
});

function ChannelsPage() {
  const listFn = useServerFn(listChannels);
  const subFn = useServerFn(subscribeChannel);
  const unsubFn = useServerFn(unsubscribeChannel);
  const qc = useQueryClient();

  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: () => listFn() });

  const sub = useMutation({
    mutationFn: (channelId: string) => subFn({ data: { channelId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels"] }); toast.success("Te has unido al canal"); },
  });
  const unsub = useMutation({
    mutationFn: (channelId: string) => unsubFn({ data: { channelId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels"] }); toast.message("Te has salido del canal"); },
  });

  return (
    <MobileShell>
      <div className="px-6 pt-12 pb-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Canales</div>
            <h1 className="font-display text-4xl mt-2">Despierta con tu tribu.</h1>
          </div>
          <Link to="/channels/mine" className="text-xs text-muted-foreground underline pt-3">Mis canales</Link>
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          Únete a un canal o crea el tuyo y trae a tu gente.
        </p>

        <Link to="/channels/new" className="mt-5 block p-4 rounded-3xl bg-primary text-primary-foreground">
          <div className="flex items-center gap-3">
            <Plus className="h-5 w-5" strokeWidth={1.5} />
            <div>
              <div className="font-display text-base leading-tight">Crear mi canal</div>
              <div className="text-xs opacity-80 mt-0.5">Invita a tu gente con un enlace</div>
            </div>
          </div>
        </Link>

        <div className="mt-8 space-y-3">
          {channels?.map((c) => {
            const joined = !!c.subscription;
            return (
              <div key={c.id} className="p-4 rounded-3xl bg-card border border-border">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-accent flex items-center justify-center text-2xl">
                    {c.cover_emoji ?? "✨"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      to="/channels/$slug"
                      params={{ slug: c.slug }}
                      className="font-display text-lg leading-tight hover:underline"
                    >
                      {c.name}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                  </div>
                  {joined ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full gap-1"
                      onClick={() => unsub.mutate(c.id)}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> Unido
                    </Button>
                  ) : (
                    <Button size="sm" className="rounded-full gap-1" onClick={() => sub.mutate(c.id)}>
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Unirse
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {channels && channels.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center flex flex-col items-center gap-2">
              <Radio className="h-5 w-5" strokeWidth={1.5} />
              No hay canales todavía.
            </p>
          )}
        </div>
      </div>
    </MobileShell>
  );
}