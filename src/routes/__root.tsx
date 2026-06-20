import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/inter-tight/400.css";
import "@fontsource/inter-tight/500.css";
import "@fontsource/inter-tight/600.css";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="device-frame">
      <div className="device-shell flex items-center justify-center bg-background px-6">
        <div className="text-center">
          <h1 className="font-display text-6xl">404</h1>
          <p className="mt-2 text-sm text-muted-foreground">Esta pantalla no existe.</p>
          <Link to="/home" className="mt-6 inline-block rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="device-frame">
      <div className="device-shell flex items-center justify-center bg-background px-6">
        <div className="text-center max-w-xs">
          <h1 className="font-display text-3xl">Algo se interrumpió</h1>
          <p className="mt-2 text-sm text-muted-foreground">Vuelve a intentarlo en un momento.</p>
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="mt-6 rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
          >
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "SurpriseWake — Despierta con tu círculo" },
      { name: "description", content: "Sustituye tu alarma por mensajes sorpresa de las personas que te importan." },
      { name: "theme-color", content: "#f4efe6" },
      { property: "og:title", content: "SurpriseWake — Despierta con tu círculo" },
      { property: "og:description", content: "Sustituye tu alarma por mensajes sorpresa de las personas que te importan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "SurpriseWake — Despierta con tu círculo" },
      { name: "twitter:description", content: "Sustituye tu alarma por mensajes sorpresa de las personas que te importan." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7fdd95ad-e32e-4e4c-8f41-54b04f98e2cc/id-preview-5795ba68--537aaa78-c643-464a-a85b-202a9d8208f0.lovable.app-1781972296581.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7fdd95ad-e32e-4e4c-8f41-54b04f98e2cc/id-preview-5795ba68--537aaa78-c643-464a-a85b-202a9d8208f0.lovable.app-1781972296581.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" toastOptions={{ style: { background: "var(--color-card)", color: "var(--color-foreground)", border: "1px solid var(--color-border)" } }} />
    </QueryClientProvider>
  );
}
