import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileShell } from "@/components/mobile-shell";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: () => (
    <ClientOnly>
      <ResetPasswordPage />
    </ClientOnly>
  ),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase places the recovery token in the URL hash and creates a recovery session.
    // Listen for the PASSWORD_RECOVERY event to know we're ready to update.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also check if a session already exists (hash already parsed).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Contraseña actualizada");
      await supabase.auth.signOut();
      navigate({ to: "/auth" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileShell hideTabBar>
      <div className="flex flex-col min-h-full px-7 pt-16 pb-10">
        <div className="text-center">
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">SurpriseWake</div>
          <h1 className="font-display text-3xl mt-3 leading-tight">Nueva contraseña</h1>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Elige una contraseña nueva para tu cuenta.
          </p>
        </div>

        {!ready ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Verificando enlace de recuperación…
          </p>
        ) : (
          <form onSubmit={submit} className="mt-10 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs uppercase tracking-wider text-muted-foreground">
                Nueva contraseña
              </Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="rounded-2xl h-12 border-border bg-card"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs uppercase tracking-wider text-muted-foreground">
                Confirmar contraseña
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                className="rounded-2xl h-12 border-border bg-card"
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full h-12 rounded-full text-sm tracking-wide">
              Guardar contraseña
            </Button>
          </form>
        )}
      </div>
    </MobileShell>
  );
}
