# Plan: SurpriseWake MVP

App social mobile-first donde la alarma del usuario se reemplaza por mensajes (audio/texto) grabados por sus contactos. Estética *quiet luxury* — neutros cálidos, tipografía geométrica, mucho espacio en blanco.

## Fases

### Fase 1 — Fundaciones de UI (con mocks, testeable de inmediato)
- Contenedor móvil estricto: en desktop se centra un viewport `max-w-[420px]` con marco tipo *device frame* (color stone) y el resto del fondo neutro.
- Design tokens en `src/styles.css`: paleta off-white / stone / carbón, acentos cálidos (terracotta suave), radios generosos, sombras muy sutiles. Modo claro/oscuro vía `prefers-color-scheme`.
- Tipografía: **Fraunces** (display, despertar editorial) + **Inter Tight** (UI), vía `@fontsource`.
- Tab bar inferior minimalista (3 iconos lucide: Alarm, Users, Bell/Inbox).
- Rutas TanStack: `/auth`, `/onboarding`, `/_authenticated/` (home alarma), `/_authenticated/circle`, `/_authenticated/inbox`, `/_authenticated/wake` (full-screen, sin tab bar), `/_authenticated/settings`.

### Fase 2 — Lovable Cloud + Auth
- Activar Cloud. Auth: email/contraseña + Google (vía broker Lovable).
- Onboarding post-signup: 3 pantallas explicando beneficio → solicitan permiso de **notificaciones** y desbloqueo de **audio** (tap para crear AudioContext "primado"). Permiso de micrófono se pide solo al primer intento de grabar.
- Trigger que crea fila en `profiles` al registrarse (username, avatar, timezone detectada por `Intl`).

### Fase 3 — Esquema de base de datos (con RLS + GRANTS)
- `profiles` — id (FK auth.users), username único, avatar_url, timezone, streak_count, last_wake_date.
- `friendships` — user_id, friend_id, status (`pending`/`accepted`). Policies: ver si soy parte; insertar si soy el solicitante; aceptar si soy el receptor.
- `alarms` — user_id, alarm_time (time), is_active, days_of_week (array, futuro). Una alarma activa por usuario en MVP.
- `messages` — sender_id, receiver_id, audio_path (storage), text_content, kind (`audio`/`text`), is_played, played_at, scheduled_for (date), saved_by_receiver (bool, para el freemium).
- `reactions` — message_id, sender_id (= receptor original), emoji, audio_path, created_at.
- Storage buckets privados: `wake-audios/{receiver_id}/{message_id}.webm`, `reactions/`. Acceso vía signed URLs solo cuando dispara la alarma.
- Función `has_role` reservada para futuro plan premium; tabla `user_roles` + enum `app_role` (`free`/`premium`).

### Fase 4 — Flujos principales
1. **Dashboard alarma**: reloj digital grande (Fraunces, tabular-nums), debajo selector de hora (drum picker custom estilo iOS), toggle activar, texto contextual ("Despertarás con la voz de 3 amigos mañana a las 7:00").
2. **Tu Círculo**: lista horizontal de avatares con punto luminoso si tienen alarma en próximas 24h. Botón "+" → Web Share API con link de invitación. Tap a un amigo abre **Bottom Sheet** (shadcn Drawer) con dos tabs: *Escribir* / *Grabar*. Grabar = botón circular grande, *hold-to-record* con `MediaRecorder` + visualizador de waveform en tiempo real, máx 30s. Al soltar → upload a Storage, insert en `messages` con `scheduled_for` = próxima alarma del receptor.
3. **Inbox / pendientes**: solicitudes de amistad, mensajes enviados (sin reproducir contenido, solo "Entregado / Escuchado"), mensajes guardados.
4. **Motor de alarma** (frontend):
   - Hook `useAlarmEngine` con `setInterval(1s)` comparando `Date.now()` con próxima alarma activa.
   - Service worker registra `Notification` programada como respaldo si la app está cerrada (best-effort, web limitation — se documenta al usuario).
   - Al disparar: navega a `/wake`, vibra (`navigator.vibrate([400,200,400,...])`) + oscilador `OscillatorNode` muy suave (240Hz fade-in) para no requerir interacción previa.
5. **Pantalla de Despertar** (full screen, sin chrome): degradado amanecer animado (oklch dawn → day), hora gigante, "Swipe to wake" (Framer Motion drag). Al completar swipe: `audioContext.resume()`, descarga signed URL del primer mensaje en cola, reproduce; si es texto, lo muestra con animación typewriter + TTS opcional via `speechSynthesis`. Reproduce mensajes en **cola** (uno tras otro). Fallback zen: tono de cuenco tibetano local (`/sounds/zen-bowl.mp3`) en loop si no hay mensajes.
6. **Bucle de reacción**: tras último mensaje, sheet inferior con 6 emojis rápidos + botón "Grabar 3s" para responder al emisor. Skip opcional.
7. **Auto-borrado y guardar (freemium)**: tras `is_played=true`, edge task marca para borrado en 24h. Botón ⭐ "Guardar este despertar" → `saved_by_receiver=true` (límite 3 para usuarios free; al intentar el 4º, modal "Plan Sunrise — próximamente").
8. **Streaks**: incrementa `streak_count` cuando el usuario envía ≥1 mensaje en el día; visible en perfil y como micro-indicador en el dashboard.

### Fase 5 — Modo simulación de tiempo (dev tool)
- En Settings (sección "Modo desarrollador") botón **"Disparar alarma ahora"** que invoca el wake flow con mensajes reales pendientes o mock, sin esperar a la hora. Visible siempre en MVP para facilitar testing.

## Detalles técnicos clave

- **Bypass autoplay**: AudioContext se crea y `resume()` durante el onboarding tras tap explícito; se guarda referencia. En la pantalla de despertar el swipe vuelve a llamar `resume()` por si el SO la suspendió.
- **Grabación**: `MediaRecorder` con `audio/webm;codecs=opus`, fallback `audio/mp4` para Safari iOS.
- **Subida**: upload directo a Supabase Storage con path predecible; el receptor obtiene signed URL (TTL 5 min) solo desde el server function `getWakeQueue` (con `requireSupabaseAuth`), que valida que la alarma esté activa y verifica que el mensaje le pertenece.
- **Mensajes ocultos**: el cliente **no** consulta nunca contenido de mensajes futuros; el server function `getWakeQueue` es la única vía y solo devuelve mensajes cuyo `scheduled_for <= today` y `receiver_id = auth.uid()`.
- **Server functions** (en `src/lib/*.functions.ts`):
  - `sendMessage`, `getCircle`, `respondFriendRequest`, `searchUsers`, `getWakeQueue`, `markPlayed`, `sendReaction`, `saveMessage`, `triggerTestWake`.
- **Notificaciones push**: fuera de alcance MVP (requiere FCM/APNs y Capacitor). En MVP solo `Notification` local programada vía SW como respaldo, documentado como "funciona si la app está abierta en segundo plano".

## Oportunidades de mejora identificadas (incluidas)
1. **Cola de mensajes** en lugar de uno solo: refuerza el efecto "regalo colectivo".
2. **Streaks "morning karma"**: gamifica el envío recurrente.
3. **Mensajes efímeros + guardar (freemium)**: privacidad por defecto, monetización futura clara.
4. **Modo simulación visible**: clave para que pruebes el flujo sin esperar.
5. **TTS para mensajes de texto**: si no hay audio, la voz sintetizada mantiene el ritual sonoro.
6. **Indicador "tu amigo tiene alarma en X horas"**: empuja el envío oportuno sin revelar la hora exacta (privacidad).

## Fuera de alcance MVP (lo dejo anotado)
- Push notifications nativas reales (requiere Capacitor build).
- Plan premium con pasarela de pago (solo modal "próximamente").
- Llamadas grupales / mensajes para múltiples receptores en un solo envío.
- Repetición semanal de alarmas (campo ya en schema).

## Entrega
Construyo todo en una sola pasada de build (Fases 1→5), conectando Cloud desde el inicio según pediste, dejando el flujo end-to-end testeable con el botón de simulación.
