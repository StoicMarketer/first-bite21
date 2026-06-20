import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Mic, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileShell } from "@/components/mobile-shell";
import { primeAudio } from "@/lib/audio-context";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
});

const STEPS = [
  {
    icon: Sparkles,
    eyebrow: "El ritual",
    title: "Tu alarma deja de ser un ruido.",
    body: "Cada mañana te despierta la voz, las palabras o el silencio de las personas que eliges. Sin sonidos fríos. Sin sobresaltos.",
  },
  {
    icon: Bell,
    eyebrow: "Notificaciones",
    title: "Te avisamos cuando llegue tu mañana.",
    body: "Activamos un permiso suave para que la alarma se dispare a la hora que tú elijas, incluso si la app está en segundo plano.",
    action: { label: "Permitir notificaciones", run: async () => {
      if (typeof Notification === "undefined") return true;
      const res = await Notification.requestPermission();
      return res === "granted";
    }},
  },
  {
    icon: Mic,
    eyebrow: "Audio",
    title: "Desbloquea el sonido del amanecer.",
    body: "Los navegadores móviles bloquean el audio automático. Toca el botón para que mañana podamos reproducir el mensaje de tu amigo.",
    action: { label: "Desbloquear audio", run: async () => primeAudio() },
  },
] as const;

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  async function next() {
    setBusy(true);
    try {
      const action = "action" in current ? current.action : undefined;
      if (action) {
        const ok = await action.run();
        if (!ok) toast.message("Puedes activarlo más tarde en Ajustes.");
      }
      if (isLast) navigate({ to: "/home" });
      else setStep(step + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileShell hideTabBar>
      <div className="flex flex-col min-h-full px-7 pt-16 pb-10">
        <div className="flex gap-1.5 mb-12">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-0.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-foreground" : "bg-border"}`} />
          ))}
        </div>

        <div className="flex-1 flex flex-col">
          <div className="h-14 w-14 rounded-full bg-accent flex items-center justify-center">
            <Icon className="h-6 w-6 text-foreground" strokeWidth={1.4} />
          </div>
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground mt-10">
            {current.eyebrow}
          </div>
          <h1 className="font-display text-4xl mt-3 leading-tight">{current.title}</h1>
          <p className="text-sm text-muted-foreground mt-4 leading-relaxed max-w-xs">
            {current.body}
          </p>
        </div>

        <Button onClick={next} disabled={busy} className="h-12 rounded-full text-sm tracking-wide gap-2">
          {"action" in current ? current.action.label : isLast ? "Empezar" : "Continuar"}
          <ArrowRight className="h-4 w-4" />
        </Button>
        {"action" in current && (
          <button onClick={() => (isLast ? navigate({ to: "/home" }) : setStep(step + 1))} className="mt-3 text-xs text-muted-foreground self-center">
            Saltar por ahora
          </button>
        )}
      </div>
    </MobileShell>
  );
}
