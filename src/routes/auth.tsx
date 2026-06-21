import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileShell } from "@/components/mobile-shell";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" && search.redirect.startsWith("/") ? search.redirect : undefined,
  }),
  component: () => <ClientOnly><AuthPage /></ClientOnly>,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      const pendingInvite = typeof window !== "undefined" ? sessionStorage.getItem("pendingInviteCode") : null;
      if (pendingInvite) {
        sessionStorage.removeItem("pendingInviteCode");
        navigate({ to: "/c/$code", params: { code: pendingInvite } });
        return;
      }
      const pending = typeof window !== "undefined" ? sessionStorage.getItem("pendingWakeCode") : null;
      if (pending) {
        sessionStorage.removeItem("pendingWakeCode");
        navigate({ to: "/add/$code", params: { code: pending } });
      } else {
        navigate({ to: "/home" });
      }
    });
  }, [navigate]);

  function consumePendingOrGo(fallback: "/home" | "/onboarding") {
    const pendingInvite = typeof window !== "undefined" ? sessionStorage.getItem("pendingInviteCode") : null;
    if (pendingInvite) {
      sessionStorage.removeItem("pendingInviteCode");
      navigate({ to: "/c/$code", params: { code: pendingInvite } });
      return;
    }
    const pending = typeof window !== "undefined" ? sessionStorage.getItem("pendingWakeCode") : null;
    if (pending) {
      sessionStorage.removeItem("pendingWakeCode");
      navigate({ to: "/add/$code", params: { code: pending } });
    } else if (search.redirect) {
      navigate({ href: search.redirect, replace: true });
    } else {
      navigate({ to: fallback });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding`,
            data: { username, full_name: username, birthdate: birthdate || null },
          },
        });
        if (error) throw error;
        toast.success("Bienvenido — revisa tu correo si pedimos confirmación.");
        consumePendingOrGo("/onboarding");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        consumePendingOrGo("/home");
      }
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Algo no salió bien";
      toast.error(m);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/home` });
    if (res.error) {
      toast.error("No se pudo iniciar sesión con Google");
      setBusy(false);
    }
  }

  return (
    <MobileShell hideTabBar>
      <div className="flex flex-col min-h-full px-7 pt-16 pb-10">
        <div className="text-center">
          <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">SurpriseWake</div>
          <h1 className="font-display text-4xl mt-3 leading-tight">Despierta con tu círculo.</h1>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Una alarma silenciosa que se enciende con la voz de las personas que te quieren.
          </p>
        </div>

        <form onSubmit={submit} className="mt-10 space-y-4">
          {mode === "signup" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs uppercase tracking-wider text-muted-foreground">Usuario</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} maxLength={24} className="rounded-2xl h-12 border-border bg-card" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="birthdate" className="text-xs uppercase tracking-wider text-muted-foreground">Fecha de nacimiento</Label>
                <Input id="birthdate" type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} className="rounded-2xl h-12 border-border bg-card" />
                <p className="text-[10px] text-muted-foreground">El día de tu cumpleaños podrás recibir todas las felicitaciones, no solo una.</p>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">Correo</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-2xl h-12 border-border bg-card" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">Contraseña</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="rounded-2xl h-12 border-border bg-card" />
          </div>

          <Button type="submit" disabled={busy} className="w-full h-12 rounded-full text-sm tracking-wide">
            {mode === "signup" ? "Crear cuenta" : "Entrar"}
          </Button>
        </form>

        <div className="flex items-center gap-3 my-6 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          <div className="flex-1 h-px bg-border" /> o <div className="flex-1 h-px bg-border" />
        </div>

        <Button variant="outline" onClick={google} disabled={busy} className="w-full h-12 rounded-full border-border bg-card text-sm">
          Continuar con Google
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {mode === "signin" ? "¿Primera vez? Crear cuenta" : "Ya tengo cuenta — entrar"}
        </button>
      </div>
    </MobileShell>
  );
}
