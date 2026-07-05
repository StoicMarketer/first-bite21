import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AlarmClock, Users, Inbox, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { AchievementUnlockedModal } from "@/components/achievement-unlocked-modal";

export function MobileShell({ children, hideTabBar }: { children: ReactNode; hideTabBar?: boolean }) {
  return (
    <div className="device-frame">
      <div className="device-shell relative bg-background flex flex-col">
        <main className={cn("flex-1 overflow-y-auto no-scrollbar", !hideTabBar && "pb-24")}>
          {children}
        </main>
        {!hideTabBar && <TabBar />}
        <AchievementUnlockedModal />
      </div>
    </div>
  );
}


const TABS = [
  { to: "/home", label: "Alarma", icon: AlarmClock },
  { to: "/circle", label: "Círculo", icon: Users },
  { to: "/channels", label: "Canales", icon: Radio },
  { to: "/inbox", label: "Recibidos", icon: Inbox },
] as const;

function TabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="absolute bottom-0 left-0 right-0 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none">
      <div className="pointer-events-auto bg-card/85 backdrop-blur-xl border border-border rounded-full px-1 py-1.5 grid grid-cols-4 gap-0.5 shadow-[0_8px_24px_-12px_oklch(0_0_0_/_0.2)]">
        {TABS.map((t) => {
          const active = pathname === t.to || (t.to === "/home" && pathname === "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-1 py-1 rounded-full transition-all min-w-0",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0 transition-transform", active && "scale-110")} strokeWidth={1.5} />
              <span className="text-[9px] leading-tight tracking-wide uppercase truncate max-w-full">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>

  );
}
