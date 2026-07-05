import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { MobileShell } from "@/components/mobile-shell";
import { Button } from "@/components/ui/button";

import { supabase } from "@/integrations/supabase/client";
import { lookupWakeCode, sendFriendRequest } from "@/lib/friends.functions";

export const Route = createFileRoute("/add/$code")({
  component: AddByCodePage,
});

type Preview = { id: string; username: string; display_name: string | null; avatar_url: string | null; wake_code: string };

function AddByCodePage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const lookupFn = useServerFn(lookupWakeCode);
  const sendFn = useServerFn(sendFriendRequest);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  const lookup = useMutation({
    mutationFn: () => lookupFn({ data: { code } }),
    onSuccess: (r) => {
      if (r) {
        navigate({ to: "/u/$username", params: { username: (r as Preview).username }, replace: true });
      } else toast.error("Código no encontrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  useEffect(() => {
    if (authed) lookup.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const send = useMutation({
    mutationFn: (id: string) => sendFn({ data: { friendId: id } }),
    onSuccess: (r) => {
      toast.success(r.status === "accepted" ? "¡Ya estáis conectados!" : "Solicitud enviada");
      navigate({ to: "/circle" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function goSignIn() {
    if (typeof window !== "undefined") sessionStorage.setItem("pendingWakeCode", code);
    navigate({ to: "/auth" });
  }

  return (
    <MobileShell hideTabBar>
      <div className="flex flex-col min-h-full px-7 pt-20 pb-10">
        <div className="text-center">
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Invitación</div>
          <h1 className="font-display text-4xl mt-3 leading-tight">Te quieren despertar.</h1>
          <p className="mt-4 font-display text-2xl tracking-[0.15em]">{code.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.{4}).*/, "$1 · $2")}</p>
        </div>

        {authed === false && (
          <div className="mt-10 space-y-3">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Entra o crea tu cuenta para añadir este código a tu círculo.
            </p>
            <Button onClick={goSignIn} className="w-full h-12 rounded-full">Entrar / Crear cuenta</Button>
          </div>
        )}

        {authed && preview && (
          <div className="mt-10 p-5 rounded-3xl bg-card border border-border">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-accent overflow-hidden flex items-center justify-center">
                {preview.avatar_url
                  ? <img src={preview.avatar_url} alt="" className="h-full w-full object-cover" />
                  : <span className="font-display text-xl">{(preview.display_name || preview.username).charAt(0).toUpperCase()}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base truncate">{preview.display_name || preview.username}</div>
                <div className="text-xs text-muted-foreground truncate">@{preview.username}</div>
              </div>
            </div>
            <Button onClick={() => send.mutate(preview.id)} disabled={send.isPending} className="mt-5 w-full h-12 rounded-full gap-2">
              <UserPlus className="h-4 w-4" strokeWidth={1.5} /> Añadir a mi círculo
            </Button>
          </div>
        )}

        {authed && !preview && lookup.isPending && (
          <p className="mt-10 text-sm text-muted-foreground text-center">Buscando…</p>
        )}

        <Link to="/home" className="mt-auto text-xs text-muted-foreground text-center hover:text-foreground transition-colors pt-10">
          Volver al inicio
        </Link>
      </div>
    </MobileShell>
  );
}
