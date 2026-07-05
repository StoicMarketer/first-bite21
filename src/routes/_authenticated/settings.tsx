import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, Zap, Bell, Volume2, Heart, Cake, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { MobileShell } from "@/components/mobile-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { getMyOverview, updateProfile } from "@/lib/messages.functions";
import { updateUsername } from "@/lib/friends.functions";
import { primeAudio } from "@/lib/audio-context";
import { useTheme } from "@/lib/theme";
import { useEffect, useState } from "react";


export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const overviewFn = useServerFn(getMyOverview);
  const updateProfileFn = useServerFn(updateProfile);
  const qc = useQueryClient();
  const [theme, setTheme] = useTheme();
  const { data } = useQuery({ queryKey: ["overview"], queryFn: () => overviewFn() });

  const updateMut = useMutation({
    mutationFn: (p: { birthdate?: string | null; birthdayUnlimited?: boolean }) => updateProfileFn({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["overview"] }); toast.success("Guardado"); },
  });

  const signOut = useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut();
    },
    onSuccess: () => navigate({ to: "/auth" }),
  });

  async function requestNotifications() {
    if (typeof Notification === "undefined") return toast.error("No disponible en este dispositivo");
    const r = await Notification.requestPermission();
    if (r === "granted") toast.success("Notificaciones activadas");
    else toast.message("Puedes activarlas más tarde desde el navegador.");
  }

  async function unlockAudio() {
    const ok = await primeAudio();
    if (ok) toast.success("Audio desbloqueado para tu próximo despertar");
    else toast.error("No se pudo desbloquear el audio");
  }

  return (
    <MobileShell>
      <div className="px-6 pt-12">
        <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Ajustes</div>
        <h1 className="font-display text-4xl mt-2">{data?.profile?.display_name || data?.profile?.username || "Tu perfil"}</h1>
        <p className="text-xs text-muted-foreground mt-1">@{data?.profile?.username}</p>

        {(data?.profile?.streak_count ?? 0) > 0 && (
          <div className="mt-6 p-4 rounded-2xl bg-card border border-border flex items-center gap-3">
            <Heart className="h-5 w-5 text-[color:var(--ember)]" strokeWidth={1.5} />
            <div>
              <div className="text-sm">Racha de {data!.profile!.streak_count} días</div>
              <div className="text-xs text-muted-foreground">Sigue mandando un mensaje cada mañana.</div>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-2">
          <Section title="Cumpleaños">
            <div className="px-4 py-3.5 space-y-3">
              <div className="flex items-center gap-3">
                <Cake className="h-4 w-4" strokeWidth={1.5} />
                <div className="flex-1 text-sm">Fecha de nacimiento</div>
              </div>
              <Input
                type="date"
                defaultValue={data?.profile?.birthdate ?? ""}
                onBlur={(e) => {
                  const v = e.target.value || null;
                  if (v !== (data?.profile?.birthdate ?? null)) updateMut.mutate({ birthdate: v });
                }}
                className="rounded-xl bg-background"
              />
              <div className="flex items-start justify-between gap-3 pt-1">
                <div className="flex-1">
                  <div className="text-sm">Alarmas ilimitadas en mi cumpleaños</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Recibe todas las felicitaciones ese día, no solo una.</div>
                </div>
                <Switch
                  checked={data?.profile?.birthday_unlimited ?? true}
                  onCheckedChange={(v) => updateMut.mutate({ birthdayUnlimited: v })}
                />
              </div>
            </div>
          </Section>

          <Section title="Apariencia">
            <div className="px-4 py-3.5 flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="h-4 w-4 text-[color:var(--ember)]" strokeWidth={1.5} />
              ) : (
                <Sun className="h-4 w-4 text-[color:var(--ember)]" strokeWidth={1.5} />
              )}
              <div className="flex-1">
                <div className="text-sm">Modo oscuro</div>
                <div className="text-xs text-muted-foreground mt-0.5">Una estética nocturna, cálida y silenciosa.</div>
              </div>
              <Switch
                checked={theme === "dark"}
                onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
              />
            </div>
          </Section>

          <Section title="Permisos">
            <SettingRow icon={Bell} label="Notificaciones" onClick={requestNotifications} />
            <SettingRow icon={Volume2} label="Desbloquear audio" onClick={unlockAudio} />
          </Section>

          <Section title="Modo desarrollador">
            <SettingRow icon={Zap} label="Disparar alarma ahora"
              hint="Lanza la pantalla de despertar con mensajes pendientes o, si no hay, en modo zen."
              onClick={() => navigate({ to: "/wake", search: { force: true } })} />
          </Section>

          <Section title="Cuenta">
            <SettingRow icon={LogOut} label="Cerrar sesión" onClick={() => signOut.mutate()} destructive />
          </Section>
        </div>

        <p className="text-[10px] text-center text-muted-foreground mt-10 mb-4 tracking-widest uppercase">SurpriseWake · MVP</p>
      </div>
    </MobileShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pt-4">
      <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground px-1">{title}</div>
      <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">{children}</div>
    </div>
  );
}

function SettingRow({ icon: Icon, label, hint, onClick, destructive }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; hint?: string; onClick?: () => void; destructive?: boolean }) {
  return (
    <button onClick={onClick} className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-accent/40 transition-colors">
      <Icon className={`h-4 w-4 ${destructive ? "text-destructive" : ""}`} strokeWidth={1.5} />
      <div className="flex-1">
        <div className={`text-sm ${destructive ? "text-destructive" : ""}`}>{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </button>
  );
}
// Avoid unused-warning shim
void Button;
