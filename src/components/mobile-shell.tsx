import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AlarmClock, Users, Inbox, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileShell({ children, hideTabBar }: { children: ReactNode; hideTabBar?: boolean }) {
  return (
    <div className="device-frame">
      <div className="device-shell relative bg-background flex flex-col">
        <main className={cn("flex-1 overflow-y-auto no-scrollbar", !hideTabBar && "pb-24")}>
          {children}
        </main>
        {!hideTabBar && <TabBar />}
      </div>
    </div>
  );
}

const TABS = [
  { to: "/home", label: "Alarma", icon: AlarmClock },
  { to: "/circle", label: "Círculo", icon: Users },
  { to: "/inbox", label: "Recibidos", icon: Inbox },
  { to: "/settings", label: "Ajustes", icon: Settings },
] as const;

function TabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-2 pointer-events-none">
      <div className="pointer-events-auto bg-card/85 backdrop-blur-xl border border-border rounded-full px-2 py-2 flex items-center justify-around shadow-[0_8px_24px_-12px_oklch(0_0_0_/_0.2)]">
        {TABS.map((t) => {
          const active = pathname === t.to || (t.to === "/home" && pathname === "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full transition-all",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} strokeWidth={1.5} />
              <span className="text-[10px] tracking-wide uppercase">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
