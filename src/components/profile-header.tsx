import { useState } from "react";
import { Share2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QrModal } from "@/components/qr-modal";

type Props = {
  username: string | null | undefined;
  displayName: string | null | undefined;
  avatarUrl: string | null | undefined;
  circleCount: number;
  pendingCount: number;
  onPendingClick?: () => void;
};

export function ProfileHeader({ username, displayName, avatarUrl, circleCount, pendingCount, onPendingClick }: Props) {
  const [qrOpen, setQrOpen] = useState(false);
  const profileUrl = typeof window !== "undefined" && username ? `${window.location.origin}/u/${username}` : "";
  const initial = (displayName || username || "?").charAt(0).toUpperCase();

  async function share() {
    if (!username) return;
    const text = `Despiértame en SurpriseWake — soy @${username}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try { await navigator.share({ title: "SurpriseWake", text, url: profileUrl }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(`${text}\n${profileUrl}`);
    toast.success("Enlace copiado al portapapeles");
  }

  return (
    <>
      <div className="mt-6 flex flex-col items-center text-center">
        <div className="h-24 w-24 rounded-full bg-accent overflow-hidden flex items-center justify-center border border-border">
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            : <span className="font-display text-3xl">{initial}</span>}
        </div>
        <div className="mt-4 font-display text-2xl leading-tight">{displayName || username || "Tu perfil"}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">@{username ?? "…"}</div>

        <div className="mt-5 flex items-stretch gap-8">
          <div className="text-center">
            <div className="font-display text-2xl leading-none">{circleCount}</div>
            <div className="mt-1 text-[10px] tracking-[0.3em] uppercase text-muted-foreground">Círculo</div>
          </div>
          <div className="w-px bg-border" />
          <button
            type="button"
            onClick={onPendingClick}
            disabled={pendingCount === 0}
            className="text-center disabled:opacity-100 disabled:cursor-default"
          >
            <div className="font-display text-2xl leading-none">{pendingCount}</div>
            <div className="mt-1 text-[10px] tracking-[0.3em] uppercase text-muted-foreground">Pendientes</div>
          </button>
        </div>

        <div className="mt-5 flex gap-2 w-full max-w-[280px]">
          <Button onClick={share} size="sm" className="flex-1 rounded-full gap-1.5 h-10" disabled={!username}>
            <Share2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Compartir perfil
          </Button>
          <Button onClick={() => setQrOpen(true)} size="sm" variant="outline" className="rounded-full gap-1.5 h-10 px-4" disabled={!username}>
            <QrCode className="h-3.5 w-3.5" strokeWidth={1.5} /> QR
          </Button>
        </div>
      </div>

      {qrOpen && username && (
        <QrModal value={profileUrl} label={`@${username}`} onClose={() => setQrOpen(false)} />
      )}
    </>
  );
}
