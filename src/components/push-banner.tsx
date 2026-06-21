import { useEffect, useState } from "react";
import { BellRing, Smartphone, Share, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useServerFn } from "@tanstack/react-start";
import { sendTestPush } from "@/lib/push.functions";
import { toast } from "sonner";

export function PushBanner() {
  const { status, enable, isIOS } = usePushNotifications();
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const testFn = useServerFn(sendTestPush);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  if (status === "ready" || status === "loading" || status === "unsupported") return null;

  async function handleEnable() {
    setBusy(true);
    const ok = await enable();
    setBusy(false);
    if (ok) {
      toast.success("Notificaciones activadas");
      try {
        await testFn();
      } catch { /* noop */ }
    } else if (status === "denied") {
      toast.error("Activa las notificaciones desde los ajustes del navegador");
    }
  }

  if (status === "needs-install") {
    return (
      <div className="mt-6 p-4 rounded-2xl bg-[color:var(--ember)]/10 border border-[color:var(--ember)]/30">
        <div className="flex items-start gap-3">
          <Smartphone className="h-5 w-5 mt-0.5 text-[color:var(--ember)] shrink-0" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <div className="font-display text-base leading-tight">Instala la app para que la alarma funcione</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              En iPhone, las notificaciones de despertar solo funcionan con el móvil bloqueado si añades SurpriseWake a tu pantalla de inicio.
            </p>
            {isIOS && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1">Toca <Share className="h-3.5 w-3.5 inline" strokeWidth={1.5} /></span>
                <span>→</span>
                <span className="inline-flex items-center gap-1">"Añadir a inicio" <Plus className="h-3.5 w-3.5 inline" strokeWidth={1.5} /></span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 p-4 rounded-2xl bg-card border border-border">
      <div className="flex items-start gap-3">
        <BellRing className="h-5 w-5 mt-0.5 text-[color:var(--ember)] shrink-0" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <div className="font-display text-base leading-tight">Activa las notificaciones</div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Sin permiso, tu alarma no podrá sonar con el móvil bloqueado.
          </p>
          <Button
            onClick={handleEnable}
            disabled={busy || status === "denied"}
            className="mt-3 rounded-full h-9 px-4 text-xs gap-2"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : status === "denied" ? null : <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
            {status === "denied" ? "Permiso bloqueado — revísalo en ajustes" : "Activar notificaciones"}
          </Button>
        </div>
      </div>
    </div>
  );
}
