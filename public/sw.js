// SurpriseWake messaging service worker.
// Receives Web Push notifications and opens the wake screen on tap.
// This worker is push-only — it does NOT cache HTML/JS to avoid stale app shells.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try { payload = { title: "SurpriseWake", body: event.data?.text() || "Tienes un despertar." }; } catch { payload = {}; }
  }

  const title = payload.title || "SurpriseWake";
  const body = payload.body || "Tu círculo te quiere despertar.";
  const url = payload.url || "/wake?source=push";
  const tag = payload.tag || "wake";

  const options = {
    body,
    icon: "/icons/icon-512.png",
    badge: "/icons/icon-512.png",
    vibrate: [600, 200, 600, 200, 600, 200, 1000],
    tag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: { url, messageId: payload.messageId || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/wake?source=push";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        try {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(url);
          } else {
            client.postMessage({ type: "wake-navigate", url });
          }
          return;
        } catch {
          // try next
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
