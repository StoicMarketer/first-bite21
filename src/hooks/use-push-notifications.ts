import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getCurrentSubscription, isIOS, isPushSupported, isStandalone, serializeSubscription, subscribeToPush,
} from "@/lib/push";
import { registerPushSubscription, unregisterPushSubscription } from "@/lib/push.functions";

export type PushStatus = "unsupported" | "needs-install" | "needs-permission" | "denied" | "ready" | "loading";

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const registerFn = useServerFn(registerPushSubscription);
  const unregisterFn = useServerFn(unregisterPushSubscription);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!isPushSupported()) { setStatus("unsupported"); return; }
    if (isIOS() && !isStandalone()) { setStatus("needs-install"); return; }
    if (Notification.permission === "denied") { setStatus("denied"); return; }
    const sub = await getCurrentSubscription();
    if (sub) {
      setEndpoint(sub.endpoint);
      setStatus("ready");
    } else {
      setStatus(Notification.permission === "granted" ? "needs-permission" : "needs-permission");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    setStatus("loading");
    try {
      const sub = await subscribeToPush();
      if (!sub) throw new Error("no-sub");
      const s = serializeSubscription(sub);
      await registerFn({ data: { ...s, userAgent: navigator.userAgent } });
      setEndpoint(sub.endpoint);
      setStatus("ready");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "ios-needs-install") setStatus("needs-install");
      else if (msg === "permission-denied") setStatus("denied");
      else setStatus("needs-permission");
      return false;
    }
  }, [registerFn]);

  const disable = useCallback(async () => {
    const sub = await getCurrentSubscription();
    if (sub) {
      try { await sub.unsubscribe(); } catch { /* noop */ }
      try { await unregisterFn({ data: { endpoint: sub.endpoint } }); } catch { /* noop */ }
    }
    setEndpoint(null);
    setStatus("needs-permission");
  }, [unregisterFn]);

  return { status, endpoint, enable, disable, refresh, isIOS: isIOS(), isStandalone: isStandalone() };
}
