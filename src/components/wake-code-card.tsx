import { useEffect, useRef, useState } from "react";
import { Copy, Share2, QrCode, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { getMyWakeCode, regenerateWakeCode } from "@/lib/friends.functions";

export function formatWakeCode(code: string | null | undefined) {
  if (!code) return "········";
  const c = code.toUpperCase();
  return `${c.slice(0, 4)} · ${c.slice(4, 8)}`;
}

export function WakeCodeCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyWakeCode);
  const regenFn = useServerFn(regenerateWakeCode);
  const [qrOpen, setQrOpen] = useState(false);

  const { data } = useQuery({ queryKey: ["my-wake-code"], queryFn: () => getFn() });
  const code = data?.wake_code ?? null;
  const inviteUrl = typeof window !== "undefined" && code ? `${window.location.origin}/add/${code}` : "";

  const regen = useMutation({
    mutationFn: () => regenFn(),
    onSuccess: (r) => {
      qc.setQueryData(["my-wake-code"], { wake_code: r.wake_code });
      toast.success("Nuevo código generado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    toast.success("Código copiado");
  }

  async function share() {
    if (!code) return;
    const text = `Despiértame en SurpriseWake — mi código es ${formatWakeCode(code)}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "SurpriseWake", text, url: inviteUrl });
        return;
      } catch { /* user cancelled */ }
    }
    await navigator.clipboard.writeText(`${text}\n${inviteUrl}`);
    toast.success("Invitación copiada al portapapeles");
  }

  return (
    <>
      <div className="mt-6 p-5 rounded-3xl bg-card border border-border">
        <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Tu código</div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="font-display text-3xl tracking-[0.15em] leading-none">{formatWakeCode(code)}</div>
          <button onClick={copy} aria-label="Copiar código" className="h-9 w-9 rounded-full bg-accent flex items-center justify-center hover:bg-accent/70 transition-colors">
            <Copy className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">Compártelo para que te añadan a su círculo. Es único y solo tuyo.</p>
        <div className="mt-4 flex gap-2">
          <Button onClick={share} size="sm" className="flex-1 rounded-full gap-1.5 h-10"><Share2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Compartir</Button>
          <Button onClick={() => setQrOpen(true)} size="sm" variant="outline" className="rounded-full gap-1.5 h-10 px-4"><QrCode className="h-3.5 w-3.5" strokeWidth={1.5} /> QR</Button>
          <Button onClick={() => regen.mutate()} disabled={regen.isPending} size="icon" variant="ghost" className="h-10 w-10 rounded-full" aria-label="Regenerar código">
            <RefreshCw className={`h-4 w-4 ${regen.isPending ? "animate-spin" : ""}`} strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {qrOpen && code && (
        <QrModal value={inviteUrl} code={code} onClose={() => setQrOpen(false)} />
      )}
    </>
  );
}

function QrModal({ value, code, onClose }: { value: string; code: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, { width: 260, margin: 1, color: { dark: "#1a1714", light: "#f4efe6" } });
  }, [value]);

  return (
    <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="relative bg-card border border-border rounded-3xl p-6 max-w-[320px] w-full" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 h-9 w-9 rounded-full bg-accent flex items-center justify-center" aria-label="Cerrar">
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground text-center">Escanéame</div>
        <div className="mt-4 flex justify-center">
          <canvas ref={canvasRef} className="rounded-2xl" />
        </div>
        <div className="mt-4 font-display text-2xl tracking-[0.15em] text-center">{formatWakeCode(code)}</div>
      </div>
    </div>
  );
}
