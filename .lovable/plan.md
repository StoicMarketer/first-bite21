# Plan: cola diaria, alarma en bucle, cumpleaños y canales temáticos

## 1. Una sola alarma por día (resto en cola)

**Regla:** cada día natural (zona horaria del usuario) se reproduce **un único mensaje recibido**. El resto queda en cola visible en la bandeja y se podrá escuchar bajo demanda; los mensajes no consumidos siguen disponibles al día siguiente, donde de nuevo se reproducirá solo uno.

**Cambios:**
- `messages`: añadir `played_on_date date` (null hasta que se entrega).
- `getWakeQueue` (`src/lib/messages.functions.ts`): devolver **1 mensaje** elegido así, en este orden de prioridad:
  1. Si ya hay un mensaje marcado con `played_on_date = hoy` y `is_played = false` → ese (continuación tras refresco).
  2. Si no, el más antiguo `is_played = false` sin `played_on_date`, y al seleccionarlo, marcarlo con `played_on_date = hoy` (lock atómico por `UPDATE ... RETURNING`).
  Además devuelve `queued_count` = mensajes pendientes restantes para mostrarlo en Home / bandeja.
- Excepción cumpleaños (ver §3): si hoy es cumpleaños, devolver todos los pendientes en orden cronológico (sin el límite de 1).
- `markPlayed` no cambia.
- Bandeja (`/inbox`): nueva sección "En cola" con los pendientes; botón "Escuchar ahora" que lleva a `/wake?force=true&messageId=…`.

## 2. Alarma en bucle hasta que el usuario la apague

- `wakeAudio.playClip(url)` admite `{ loop: true }` y se llama así en `wake.tsx` para el mensaje del día. El timbre de pre-despertar ya hace loop.
- El paso `playing → reacting` ya **no** es automático al terminar el clip: solo termina si el usuario:
  - desliza/pulsa **"Detener alarma"** (nuevo botón principal durante `playing`), que pasa a `reacting`.
  - o pulsa **X** (cancela todo y sale a `/home`).
- Mensajes de texto: se sintetiza con TTS en loop (re-`speak` al `onend`) hasta que el usuario detenga.
- Cumpleaños: en lugar de loop infinito por mensaje, se encadenan los pendientes; cuando termina la lista, vuelve a empezar desde el primero hasta que el usuario detenga.

## 3. Fecha de nacimiento y excepción cumpleaños

- Migración: `profiles.birthdate date null`, `profiles.birthday_unlimited boolean default true`.
- **Signup (`src/routes/auth.tsx`)**: nuevo campo "Fecha de nacimiento" (solo en modo `signup`), guardado en `auth.signUp({ data: { birthdate } })`. El trigger `handle_new_user` lee `raw_user_meta_data->>'birthdate'` y lo escribe en `profiles.birthdate`.
- **Onboarding**: si un usuario existente no tiene `birthdate`, se añade un paso opcional para capturarla (campo `<input type="date">`).
- **Settings**: editar fecha de nacimiento y toggle "Alarmas ilimitadas el día de mi cumpleaños".
- `getWakeQueue` calcula `isBirthday = (mm-dd de profile.birthdate == hoy en su tz)` y si es true + `birthday_unlimited`, omite el límite del §1.

## 4. Canales temáticos con IA (modelo híbrido)

**Concepto:** los usuarios se suscriben a "canales" (estilo Telegram). Cualquier suscriptor del canal puede enviar un despertar al resto. Si la bandeja personal está vacía, la app recurre a un mensaje generado por IA siguiendo el tono del canal favorito.

### Esquema (migración)

- `channels` (`id, slug, name, description, tone_prompt, voice, cover_url, is_official boolean, created_by uuid null`)
- `channel_subscriptions` (`channel_id, user_id, joined_at, allow_send boolean default true, allow_receive boolean default true`) PK (channel_id, user_id)
- `channel_messages` (`id, channel_id, sender_id, kind, text_content, audio_path, created_at`)
- `messages`: añadir `channel_id uuid null` y `is_ai boolean default false` para distinguir el origen cuando un mensaje de canal se entrega a un usuario.

GRANTs + RLS:
- `channels`: SELECT público (anon+auth) de oficiales; INSERT propios opcional más adelante.
- `channel_subscriptions`: usuario gestiona las suyas.
- `channel_messages`: SELECT solo si suscrito; INSERT si suscrito con `allow_send`.

Canales oficiales semilla: **Productividad Estoica**, **Mentalidad Deportiva**, **Humor Absurdo**, **Mañanas Zen**, **Motivación Pop**, cada uno con `tone_prompt` específico.

### Flujo de envío en canal

- `sendChannelMessage({channelId, kind, text|audioPath})`: inserta en `channel_messages`. Un job (`pg_cron` cada minuto) hace **fanout** a `messages` para cada suscriptor con `allow_receive = true` y `user_id != sender_id`, con `channel_id` propagado. Así reutilizamos toda la lógica de `getWakeQueue`, cola única y cumpleaños.
- Para evitar saturar canales grandes: cada canal entrega máximo **1 mensaje por suscriptor por día** (regla aplicada en el fanout: si ya hay un `messages` de ese canal para ese receptor con `created_at::date = hoy`, no se duplica).

### Fallback IA cuando la cola está vacía

- Nuevo `createServerFn getAiWakeMessage` (Lovable AI, modelo `google/gemini-3-flash-preview`):
  - Input: canal favorito del usuario (primer `channel_subscriptions` por `joined_at`) o uno por defecto.
  - Prompt = `channel.tone_prompt` + nombre del usuario + idioma. Salida: 1–2 frases.
  - Genera audio opcional con `openai/gpt-4o-mini-tts` (voz del canal) y lo sube a `wake-audios` con `is_ai = true`.
- `getWakeQueue`: si no hay pendientes humanos y `force` o es la hora de la alarma, devuelve el mensaje IA generado al vuelo. **No** se guarda como `messages` para no romper la regla "una por día"; vive solo en la sesión `/wake`.

### UI

- Nueva ruta `/_authenticated/channels` con: lista de canales, buscador, botón "Suscribirme", banner "Aparecer como contactable en este canal (compartir mi código)".
- Detalle `/_authenticated/channels/$slug`: feed de últimos despertares del canal, miembros recientes y CTA "Enviar despertar al canal".
- Tab nueva en `mobile-shell` (`Canales`) o entrada en `/circle` ("Explorar canales").
- En `/circle`: si el usuario no tiene amigos, banner "Aún no tienes a nadie. Suscríbete a un canal" con 3 sugerencias.

## Detalles técnicos

```text
DB
├─ messages              + played_on_date date, + channel_id uuid null, + is_ai bool
├─ profiles              + birthdate date, + birthday_unlimited bool
├─ channels              (nuevo)
├─ channel_subscriptions (nuevo)
└─ channel_messages      (nuevo)

Server fns
├─ getWakeQueue        → 1 msg/día (excepto cumpleaños), incluye queued_count
├─ getAiWakeMessage    → fallback IA con tono de canal
├─ subscribeChannel / unsubscribeChannel / listChannels / getChannel
└─ sendChannelMessage  → inserta en channel_messages

Jobs
└─ pg_cron "fanout_channel_messages" cada minuto → channel_messages → messages
```

## Archivos afectados (resumen)

- `supabase` migrations (esquema + RLS + GRANTs + semilla canales + cron)
- `src/lib/messages.functions.ts` — nueva lógica de cola y cumpleaños
- `src/lib/channels.functions.ts` (nuevo)
- `src/lib/ai-wake.functions.ts` (nuevo, Lovable AI)
- `src/lib/wake-audio.ts` — soporte `{ loop }` y loop TTS
- `src/routes/_authenticated/wake.tsx` — bucle hasta detener, cumpleaños
- `src/routes/_authenticated/home.tsx` — badge "N en cola"
- `src/routes/_authenticated/inbox.tsx` — sección "En cola"
- `src/routes/_authenticated/circle.tsx` — fallback canales si vacío
- `src/routes/_authenticated/channels.tsx` + `channels.$slug.tsx` (nuevos)
- `src/routes/_authenticated/settings.tsx` — birthdate + toggle cumpleaños
- `src/routes/auth.tsx` — campo fecha de nacimiento en signup
- `src/routes/onboarding.tsx` — paso opcional birthdate
- `src/components/mobile-shell.tsx` — tab "Canales"

## Preguntas que asumo (avísame si cambian)

- Zona horaria del "día": uso `profiles.timezone` ya existente.
- "En cola" se mantiene **indefinidamente** hasta que el usuario los escuche o los archive.
- IA solo se activa cuando no hay mensajes humanos pendientes; nunca duplica una alarma humana.
- Los canales arrancan como **oficiales curados por nosotros** (5 semilla); canales creados por usuarios quedan fuera de esta entrega.
