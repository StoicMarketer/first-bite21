import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, X, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MobileShell } from "@/components/mobile-shell";
import { searchUsers, sendFriendRequest, respondFriendRequest, getCircle, getPendingRequests } from "@/lib/friends.functions";

export const Route = createFileRoute("/_authenticated/circle")({
  component: CirclePage,
});

function CirclePage() {
  const qc = useQueryClient();
  const searchFn = useServerFn(searchUsers);
  const sendFn = useServerFn(sendFriendRequest);
  const respondFn = useServerFn(respondFriendRequest);
  const circleFn = useServerFn(getCircle);
  const pendingFn = useServerFn(getPendingRequests);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([]);

  const { data: circle } = useQuery({ queryKey: ["circle"], queryFn: () => circleFn() });
  const { data: pending } = useQuery({ queryKey: ["pending"], queryFn: () => pendingFn() });

  const search = useMutation({
    mutationFn: (query: string) => searchFn({ data: { q: query } }),
    onSuccess: (r) => setResults(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const sendReq = useMutation({
    mutationFn: (id: string) => sendFn({ data: { friendId: id } }),
    onSuccess: (r) => {
      toast.success(r.status === "accepted" ? "¡Ya estáis conectados!" : "Solicitud enviada");
      qc.invalidateQueries({ queryKey: ["circle"] });
      qc.invalidateQueries({ queryKey: ["pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const respond = useMutation({
    mutationFn: (p: { friendshipId: string; accept: boolean }) => respondFn({ data: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["circle"] });
      qc.invalidateQueries({ queryKey: ["pending"] });
    },
  });

  return (
    <MobileShell>
      <div className="px-6 pt-12">
        <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Tu círculo</div>
        <h1 className="font-display text-4xl mt-2">Las personas que te despiertan.</h1>

        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) search.mutate(q.trim()); }} className="mt-8 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por usuario…" className="pl-11 h-12 rounded-full bg-card border-border" />
          </div>
          <Button type="submit" className="h-12 px-5 rounded-full">Buscar</Button>
        </form>

        {results.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Resultados</div>
            {results.map((u) => (
              <Row key={u.id} name={u.display_name || u.username} sub={`@${u.username}`} avatar={u.avatar_url}
                trailing={<Button size="sm" variant="outline" className="rounded-full gap-1" onClick={() => sendReq.mutate(u.id)}>
                  <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} /> Añadir
                </Button>} />
            ))}
          </div>
        )}

        {pending && pending.length > 0 && (
          <div className="mt-8 space-y-2">
            <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Solicitudes pendientes</div>
            {pending.map((p) => p.user && (
              <Row key={p.friendshipId} name={p.user.display_name || p.user.username} sub={`@${p.user.username}`} avatar={p.user.avatar_url}
                trailing={<div className="flex gap-1">
                  <Button size="icon" variant="outline" className="h-9 w-9 rounded-full" onClick={() => respond.mutate({ friendshipId: p.friendshipId, accept: true })}><Check className="h-4 w-4" strokeWidth={1.5} /></Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => respond.mutate({ friendshipId: p.friendshipId, accept: false })}><X className="h-4 w-4" strokeWidth={1.5} /></Button>
                </div>} />
            ))}
          </div>
        )}

        <div className="mt-8 space-y-2">
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">En tu círculo</div>
          {circle && circle.length > 0 ? circle.map((f) => (
            <Row key={f.id} name={f.display_name || f.username} sub={`@${f.username}${f.alarm_active ? ` · alarma ${f.alarm_time?.slice(0,5) ?? ""}` : ""}`} avatar={f.avatar_url} />
          )) : <p className="text-sm text-muted-foreground py-6 text-center">Tu círculo está vacío. Busca a alguien para empezar.</p>}
        </div>
      </div>
    </MobileShell>
  );
}

function Row({ name, sub, avatar, trailing }: { name: string; sub?: string; avatar?: string | null; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border">
      <div className="h-10 w-10 rounded-full bg-accent overflow-hidden flex items-center justify-center">
        {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : <span className="font-display">{name.charAt(0).toUpperCase()}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{name}</div>
        {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
      </div>
      {trailing}
    </div>
  );
}
