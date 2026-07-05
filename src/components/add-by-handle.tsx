import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupUsername, sendFriendRequest } from "@/lib/friends.functions";

type Preview = { id: string; username: string; display_name: string | null; avatar_url: string | null };

function sanitize(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

export function AddByHandle() {
  const qc = useQueryClient();
  const lookupFn = useServerFn(lookupUsername);
  const sendFn = useServerFn(sendFriendRequest);
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  const lookup = useMutation({
    mutationFn: (username: string) => lookupFn({ data: { username } }),
    onSuccess: (r) => {
      if (!r) { toast.error("No encontramos a nadie con ese usuario"); setPreview(null); return; }
      setPreview(r as Preview);
    },
    onError: (e: Error) => { toast.error(e.message); setPreview(null); },
  });

  const send = useMutation({
    mutationFn: (id: string) => sendFn({ data: { friendId: id } }),
    onSuccess: (r) => {
      toast.success(r.status === "accepted" ? "¡Ya estáis conectados!" : "Solicitud enviada");
      setPreview(null); setValue("");
      qc.invalidateQueries({ queryKey: ["circle"] });
      qc.invalidateQueries({ queryKey: ["pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (value.length >= 3) lookup.mutate(value); }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-display">@</span>
          <Input
            value={value}
            onChange={(e) => { setValue(sanitize(e.target.value)); setPreview(null); }}
            placeholder="usuario"
            inputMode="text"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            className="pl-9 h-12 rounded-full bg-card border-border lowercase"
            maxLength={20}
          />
        </div>
        <Button type="submit" disabled={value.length < 3 || lookup.isPending} className="h-12 px-5 rounded-full">
          Buscar
        </Button>
      </form>

      {preview && (
        <div className="mt-3 flex items-center gap-3 p-3 rounded-2xl bg-card border border-border">
          <div className="h-10 w-10 rounded-full bg-accent overflow-hidden flex items-center justify-center">
            {preview.avatar_url
              ? <img src={preview.avatar_url} alt="" className="h-full w-full object-cover" />
              : <span className="font-display">{(preview.display_name || preview.username).charAt(0).toUpperCase()}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{preview.display_name || preview.username}</div>
            <div className="text-xs text-muted-foreground truncate">@{preview.username}</div>
          </div>
          <Button size="sm" className="rounded-full gap-1" onClick={() => send.mutate(preview.id)} disabled={send.isPending}>
            <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} /> Añadir
          </Button>
        </div>
      )}
    </div>
  );
}
