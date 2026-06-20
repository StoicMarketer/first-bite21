## Canales creados por usuarios (Growth Loop)

Cada usuario podrá crear su propio canal, invitar a su gente con un enlace/código corto, enviar despertares personales a todos sus suscriptores, y descubrir canales de otros. El esquema ya soporta `created_by` e `is_official` en `channels`, así que la base está lista — falta abrir el flujo de creación, invitación y descubrimiento.

### 1. Modelo de datos (migración)

Cambios a `channels`:
- `invite_code text unique` — código corto (8 chars tipo wake_code) para `/c/<code>` o `/channels/join/<code>`.
- `visibility text not null default 'unlisted'` con check `in ('public','unlisted','private')`:
  - **public**: aparece en el directorio público a todos.
  - **unlisted**: sólo accesible con el enlace de invitación (por defecto en canales de usuario).
  - **private**: sólo accesible con invitación y previa aprobación del creador (futuro; v1 lo tratamos como unlisted con join manual).
- `max_members int default 500` — tope blando para evitar abusos en v1.
- `is_official` queda como hoy (canales semilla curados por el equipo).

Función + trigger:
- `generate_channel_invite_code()` análogo a `generate_wake_code()`.
- Trigger `before insert on channels` que rellena `invite_code` si está nulo y normaliza `slug` (lowercase, sin espacios) cuando lo crea un usuario.

Políticas RLS nuevas:
- `channels_insert_own`: `auth.uid() is not null` y `with check (created_by = auth.uid() and is_official = false)` — los usuarios sólo pueden crear canales no oficiales a su nombre.
- `channels_update_own`: el creador puede editar `name, description, cover_emoji, visibility, tone_prompt, voice` de sus propios canales.
- `channels_delete_own`: el creador puede borrar su canal (cascada ya hace el resto).
- Ampliar `channels_public_select_official` → permitir también `visibility = 'public'` y "ver canal si conozco su `invite_code`" se resuelve vía RPC `SECURITY DEFINER` (`lookup_channel_by_invite`), no por RLS abierta.

Tabla `channel_subscriptions`: ya sirve. Para canales privados (futuro) añadiremos `status` (`pending|active`), no en v1.

Storage: nuevo bucket `channel-covers` (público en lectura) para portadas opcionales (`cover_url`). v1 sigue con emoji + opcional URL.

### 2. Funciones de servidor (`src/lib/channels.functions.ts`)

Añadir:
- `createChannel({ name, description, coverEmoji, visibility, tonePrompt?, voice? })` → inserta con `created_by = userId`, autosuscribe al creador (`allow_send=true, allow_receive=true, share_wake_code=true`) en la misma transacción (dos inserts). Devuelve `{ slug, inviteCode }`.
- `updateChannel({ channelId, patch })` — sólo creador.
- `deleteChannel({ channelId })` — sólo creador.
- `myChannels()` → canales `created_by = userId`.
- `lookupChannelByInvite({ code })` (RPC `security definer` en SQL) → devuelve metadatos mínimos del canal por `invite_code` aunque el usuario no esté suscrito, para la pantalla de aceptar invitación.
- `joinByInvite({ code })` → resuelve canal y crea suscripción.
- `rotateInviteCode({ channelId })` — opcional, sólo creador.
- Extender `listChannels` para devolver sólo `is_official = true` o `visibility = 'public'` o aquellos donde el usuario ya está suscrito, ordenado por: mis canales primero, luego oficiales, luego públicos por miembros desc.

### 3. Rutas y UI

Nuevas rutas:
- `src/routes/_authenticated/channels.new.tsx` — formulario de creación (nombre, descripción, emoji, visibilidad). Tras crear, redirige a `/channels/$slug` y muestra modal "Comparte tu canal" con el enlace `https://.../c/<invite_code>` + botón copiar + `navigator.share`.
- `src/routes/c.$code.tsx` (**pública**, top-level) — landing de invitación: muestra nombre, descripción, miembros, CTA "Unirme". Si no hay sesión, redirige a `/auth?redirect=/c/<code>`. Tras login, autoejecuta `joinByInvite` y manda a `/channels/$slug`. Esto es el corazón del growth loop: link compartible que convierte visitantes en usuarios registrados y suscriptores.
- `src/routes/_authenticated/channels.mine.tsx` — "Mis canales": lista de canales creados por mí con stats (miembros, mensajes esta semana) y acceso a editar.

Cambios en rutas existentes:
- `channels.tsx`: añadir botón flotante "Crear canal" + sección "Mis canales" arriba si existen.
- `channels.$slug.tsx`: si soy el creador, mostrar panel admin (compartir enlace de invitación con copy/share, editar metadatos, ver lista de miembros, expulsar, rotar código). Mostrar siempre el enlace de invitación a cualquier suscriptor (para que cualquier miembro pueda invitar — multiplica el loop).
- `home.tsx` / onboarding: añadir CTA "Crea tu canal y trae a tu gente" después del primer despertar enviado.

### 4. Growth loop (UX)

Tras crear un canal:
1. Modal "Tu canal está listo" con preview de un enlace `lovable.app/c/<code>` y tres opciones: Copiar, Compartir (WhatsApp/IG/SMS vía `navigator.share`), QR.
2. Notificación in-app cuando alguien se une por tu enlace ("Marta se unió a tu canal Mañanas brutales").
3. Al recibir el primer despertar desde un canal de un amigo, banner "¿Te gustó? Crea el tuyo y despierta a tu gente" → CTA a `/channels/new`.
4. Cualquier miembro (no sólo el creador) puede reenviar la invitación → cada usuario es un nodo viral.

### 5. Detalles técnicos

- `invite_code` se usa también como path corto `/c/<code>` para que quepa en SMS/IG.
- `lookupChannelByInvite` y `joinByInvite` son **públicos para lectura mínima** vía SECURITY DEFINER (no exponemos `tone_prompt` ni la lista de miembros aquí) — sólo `name, description, cover_emoji, member_count`.
- `createChannel` valida nombre 3–40, descripción ≤140, emoji ≤4 chars, slug autogenerado a partir del nombre con sufijo numérico si colisiona.
- En el fanout existente (`fanout_channel_messages`) no hace falta tocar nada: ya distribuye `channel_messages` a `messages` para todos los suscriptores con `allow_receive=true`, respetando 1 por día.
- IA fallback: los canales de usuario no tienen `tone_prompt` semilla por defecto; la IA sólo dispara para canales oficiales o si el creador definió un prompt. Esto evita ruido para canales pequeños sin actividad.
- Límite anti-spam v1: máximo 3 canales creados por usuario y 1 mensaje a canal cada 30 min (validación en server fn).

### 6. Orden de implementación

1. Migración (campos, RLS, función `generate_channel_invite_code`, trigger, RPCs `lookup_channel_by_invite` + `join_channel_by_invite`).
2. Server fns nuevas + extensión de `listChannels`.
3. Ruta pública `/c/$code` + autosuscripción tras login.
4. UI `channels.new.tsx` + modal de compartir.
5. Panel admin en `channels.$slug.tsx` + página `channels.mine.tsx`.
6. CTAs de growth (home + post-recepción).

### Archivos afectados

Nuevos: migración SQL, `src/routes/_authenticated/channels.new.tsx`, `src/routes/_authenticated/channels.mine.tsx`, `src/routes/c.$code.tsx`, `src/components/share-channel-sheet.tsx`.
Modificados: `src/lib/channels.functions.ts`, `src/routes/_authenticated/channels.tsx`, `src/routes/_authenticated/channels.$slug.tsx`, `src/routes/_authenticated/home.tsx`, `src/components/mobile-shell.tsx` (link a "Mis canales" desde el header de Canales).
