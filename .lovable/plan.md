# Por qué la alarma no suena hoy

El despertador actual sólo dispara desde `src/routes/_authenticated/home.tsx`:

```ts
const i = setInterval(() => {
  if (Date.now() >= target.getTime()) navigate({ to: "/wake" });
}, 1000);
```

Eso significa que **sólo suena si la app está abierta, en primer plano y la pestaña activa**. Con el móvil bloqueado, el navegador suspende los timers, no navega a `/wake` y `wakeAudio.playRingLoop()` nunca arranca. Además, aunque navegara, los navegadores **bloquean autoplay** sin un gesto reciente del usuario, así que el audio fallaría.

Para que funcione con el teléfono bloqueado necesitamos tres piezas que hoy no existen:

1. Un **scheduler en servidor** que sepa qué usuario debe despertarse a qué hora.
2. Un canal que **despierte al sistema operativo** aunque el navegador esté cerrado → **Web Push** (FCM en Android/Chrome, APNs vía Safari 16.4+ en iOS, pero **sólo si la PWA está instalada en Home Screen**).
3. Una **PWA instalable** con Service Worker que reciba el push, muestre notificación con sonido/vibración y abra `/wake` al tocar.

# Plan de acción

## Fase 1 — PWA instalable de verdad (base imprescindible)

- Añadir `public/manifest.webmanifest` con `name`, `short_name`, `start_url: "/wake?source=push"`, `scope: "/"`, `display: "standalone"`, `theme_color`, `background_color`, iconos 192/512 (incl. `purpose: "maskable"`).
- Enlazar manifest, `theme-color`, `apple-touch-icon` y meta `apple-mobile-web-app-capable` en `src/routes/__root.tsx`.
- Generar iconos en `public/icons/` (reutilizando la estética luxury existente).
- Pantalla onboarding "Añadir a la pantalla de inicio" con instrucciones específicas iOS/Android — bloqueador clave porque **iOS sólo permite Web Push si la app está instalada**.
- Componente `InstallPrompt` que capture `beforeinstallprompt` en Android/Chrome.

## Fase 2 — Service Worker para Web Push

- `public/sw.js` mínimo (sin caché offline para no romper el preview; sigue el skill PWA y `messaging` worker exempto de los guards de preview):
  - `push` → `self.registration.showNotification(title, { body, icon, badge, vibrate: [400,200,400,200,800], requireInteraction: true, tag: "wake", data: { url: "/wake?messageId=..." } })`.
  - `notificationclick` → abre/foca cliente en `data.url`.
- Registro del SW guardado tras `primeAudio()` y sólo en producción (no en `id-preview--*`).
- Hook `usePushSubscription()`:
  - pide `Notification.requestPermission()` con UX explicativa (no en frío).
  - `pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC })`.
  - envía la `PushSubscription` al backend.

## Fase 3 — Backend: suscripciones + envío Web Push

- Migración nueva `push_subscriptions`:
  - `id`, `user_id` FK auth.users, `endpoint` unique, `p256dh`, `auth`, `user_agent`, `created_at`, `last_seen_at`.
  - RLS: el dueño puede leer/insertar/borrar las suyas; `service_role` ALL.
  - `GRANT` apropiados.
- Server function `registerPushSubscription` y `unregisterPushSubscription` (`createServerFn` + `requireSupabaseAuth`).
- Secrets nuevos: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:`). Se piden con `secrets--add_secret`. `VITE_VAPID_PUBLIC_KEY` para el cliente.
- Ruta pública `src/routes/api/public/hooks/wake-tick.ts` (cron sin auth, valida `apikey` con la anon key):
  - Lee `alarms` activas cuya hora local (según `profiles.timezone`) coincida con el minuto actual y no se hayan disparado hoy.
  - Para cada usuario, busca un mensaje siguiente con `getWakeQueue`-style logic; arma payload `{ title, body, url: "/wake?messageId=<id>" }`.
  - Envía Web Push a todas sus `push_subscriptions` con la lib `web-push` (compatible Workers; si no, usar implementación VAPID con `crypto.subtle` ya disponible en workerd — preferida para evitar deps Node-only).
  - Marca `alarms.last_fired_on` (columna nueva) para idempotencia.
- pg_cron cada minuto golpeando ese endpoint con la `apikey` anon.

## Fase 4 — Reproducción robusta en `/wake`

- Al abrir `/wake?messageId=...` desde la notificación, mostrar pantalla "Toca para despertar" — un único tap desbloquea audio y vibración (políticas de autoplay).
- Tras el tap: `primeAudio()` + `playRingLoop` + `vibratePattern` en bucle hasta `dismiss`.
- Fallback texto: si TTS no está disponible (iOS bloqueo), mostrar typewriter grande + tono zen.
- `wakeLock` API (`navigator.wakeLock.request("screen")`) para mantener pantalla encendida durante el despertar.
- Pre-firmar audios en el payload del push (URL ya válida 10 min) para evitar dependencia de red al abrir.
- Reintento de notificación a los 30s y 60s si el usuario no abrió (segundo push con `tag: "wake"` que reemplaza).

## Fase 5 — Permisos y onboarding

- Nuevo paso en `src/routes/onboarding.tsx`:
  1. "Instala la app" (con detección iOS Safari → instrucciones Compartir → Añadir a inicio).
  2. "Activa notificaciones" → `requestPermission` + `subscribe`.
  3. "Prueba tu alarma" → botón que dispara push de prueba en 10s vía server function.
- Banner persistente en `/home` si `Notification.permission !== "granted"` o no hay subscription.

## Fase 6 — Verificación

- Test E2E nuevo: registra subscription mock, llama al endpoint de tick, comprueba que `web-push` se invoca y que `last_fired_on` se actualiza.
- Checklist manual en docs internas: Android Chrome instalado, iOS 16.4+ instalado desde Home Screen, escritorio.

# Detalles técnicos

- **iOS**: Web Push sólo funciona desde Safari ≥16.4 **y con la PWA instalada**. Es ineludible; sin instalación, no hay alarma con pantalla bloqueada. Comunicarlo claramente en UI.
- **Android**: funciona en Chrome sin instalar, pero instalar mejora fiabilidad y permite icono.
- **Service Worker en preview Lovable**: el SW de push (`firebase-messaging-sw.js`-style) está exento de los guards del skill PWA. Aun así, registrarlo sólo si `location.hostname` no empieza por `id-preview--`/`preview--` y no es iframe, para evitar caches accidentales.
- **Worker runtime (Cloudflare)**: la librería `web-push` usa `crypto` Node — compatible con `nodejs_compat`. Si falla, implementar VAPID JWT con `crypto.subtle` (ES256) — ~40 líneas.
- **Timezones**: usar `profiles.timezone` (ya existe) en el tick para comparar contra hora local del usuario.
- **Idempotencia**: añadir `alarms.last_fired_on date` con índice; el tick salta si `last_fired_on = today_local`.
- **Sonido de notificación**: en Android el `sound` del manifest está deprecado; usamos `vibrate` + apertura de `/wake` que reproduce el ringtone real.
- **Limpieza**: cuando un endpoint Web Push devuelve 404/410, borrar la subscription.
- **No tocar** archivos auto-generados (`client.ts`, `types.ts`, `routeTree.gen.ts`, `.env` Supabase).

# Lo que necesito de ti antes de implementar

1. ¿Generamos las claves VAPID nosotros (te pediré guardarlas como secret) o ya tienes?
2. ¿Confirmas que el público objetivo principal es iOS? Si sí, priorizo la UX de instalación + el aviso "necesitas instalar la app para que la alarma funcione bloqueada".
3. ¿OK con añadir la dependencia `web-push` (o prefieres implementación VAPID manual sin deps)?
