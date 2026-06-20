import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MobileShell } from "@/components/mobile-shell";
import { Button } from "@/components/ui/button";
import { lookupInvite, joinByInvite } from "@/lib/channels.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/c/$code")({
  component: InviteLanding,
  ssr: false,
});

function InviteLanding() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const lookupFn = useServerFn(lookupInvite);
  const joinFn = useServerFn(joinByInvite);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["invite", code],
    queryFn: () => lookupFn({ data: { code } }),
    retry: false,
  });

  const join = useMutation({
    mutationFn: () => joinFn({ data: { code } }),
    onSuccess: (r) => {
      toast.success("¡Estás dentro!");
      if (r.slug) navigate({ to: "/channels/$slug", params: { slug: r.slug } });
      else navigate({ to: "/channels" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleJoin() {
    if (authed === false) {
      navigate({ to: "/auth", search: { redirect: `/c/${code}` } as never });
      return;
    }
    join.mutate();
  }

  return (
    <MobileShell hideTabBar>
      <div className="px-6 pt-16 pb-8 min-h-full flex flex-col">
        {isLoading && <div className="text-sm text-muted-foreground">Buscando canal…</div>}
        {error && (
          <div className="text-center">
            <h1 className="font-display text-3xl">Invitación no válida</h1>
            <p className="text-sm text-muted-foreground mt-3">Pídele a quien te invitó un enlace nuevo.</p>
            <Button className="mt-6 rounded-full" onClick={() => navigate({ to: "/" })}>Volver</Button>
          </div>
        )}
        {data && (
          <>
            <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Invitación al canal</div>
            <div className="mt-6 flex items-center gap-4">
              <div className="h-20 w-20 rounded-3xl bg-accent flex items-center justify-center text-4xl">{data.cover_emoji ?? "✨"}</div>
              <div className="flex-1 min-w-0">
                <h1 className="font-display text-3xl leading-tight">{data.name}</h1>
                <div className="text-xs text-muted-foreground mt-1">{data.member_count} miembros</div>
              </div>
            </div>
            {data.description && <p className="text-sm text-muted-foreground mt-5 leading-relaxed">{data.description}</p>}

            <div className="mt-8 p-4 rounded-3xl bg-card border border-border">
              <p className="text-sm">
                Al unirte, recibirás los despertares que se envíen a este canal — uno por día.
              </p>
            </div>

            <div className="mt-auto pt-8 space-y-3">
              <Button onClick={handleJoin} disabled={join.isPending} className="w-full h-12 rounded-full">
                {authed === false ? "Crear cuenta y unirme" : join.isPending ? "Uniéndote…" : "Unirme al canal"}
              </Button>
              <button onClick={() => navigate({ to: "/" })} className="w-full text-xs text-muted-foreground">
                Ahora no
              </button>
            </div>
          </>
        )}
      </div>
    </MobileShell>
  );
}
