## Objetivo

Dar a cada usuario un **WakeCode** único y memorable (ej. `WAKE-7F3K9P`) que pueda compartir fácilmente para que otros lo añadan a su círculo, sin depender de búsquedas por username.

## Por qué un código en vez de username

- Los usernames pueden ser largos, ambiguos o repetidos visualmente (l/I/1). Un código corto y con alfabeto seguro (sin O/0/I/1) elimina errores al dictarlo.
- Es **estable y privado**: se puede regenerar si se filtra, sin perder identidad.
- Permite **deep links** y **QR**: pegar enlace o escanear cámara → solicitud directa.

## Formato del código

- 8 caracteres, alfabeto Crockford sin ambigüedades: `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`.
- Se muestra agrupado: `WAKE · ABCD-EFGH` (solo formato visual; almacenado plano en mayúsculas).
- Generado en el servidor con reintentos ante colisión (espacio > 1 billón de combinaciones).

## Flujo de usuario

```text
┌─ Pestaña "Tu Círculo" (header)
│   ┌──────────────────────────┐
│   │  TU CÓDIGO               │
│   │  ABCD · EFGH      [Copy] │
│   │  [Compartir]  [QR]  [↻]  │
│   └──────────────────────────┘
│
├─ Sección "Añadir por código"
│   Input 8 chars (auto-uppercase, formato XXXX-XXXX, paste-friendly)
│   → al completar, lookup → preview tarjeta usuario → "Enviar solicitud"
│
├─ [Escanear QR] → cámara → detecta wake://add/ABCDEFGH → mismo preview
│
└─ Búsqueda por @username (se mantiene, secundaria)
```

### Compartir
- Web Share API con texto: `Despiértame en SurpriseWake → https://app/add/ABCDEFGH`
- Fallback: copiar al portapapeles.
- QR generado client-side desde la URL de invitación.

### Recibir invitación por link
- Ruta pública `/add/$code` (sin auth gate). Si no hay sesión → guarda code en `sessionStorage` y redirige a `/auth`; tras login se reanuda la solicitud automáticamente.
- Si hay sesión → muestra preview del usuario y botón "Añadir a mi círculo".

## Cambios técnicos

### 1. Base de datos (migración)

- Añadir a `profiles`:
  - `wake_code TEXT UNIQUE NOT NULL` (8 chars, mayúsculas).
  - Índice único ya implícito por `UNIQUE`.
- Función `public.generate_wake_code()` SQL/plpgsql: genera código aleatorio con alfabeto seguro, reintenta hasta encontrar uno libre (loop con `EXISTS` check).
- Backfill: `UPDATE profiles SET wake_code = generate_wake_code() WHERE wake_code IS NULL;` (antes de añadir `NOT NULL`).
- Actualizar `handle_new_user()` para asignar `wake_code` en el INSERT inicial.
- Función `public.lookup_by_wake_code(_code TEXT)` SECURITY DEFINER que devuelve solo `{id, username, display_name, avatar_url}` (evita exponer toda la tabla a búsquedas por código de extraños — la política RLS actual permite SELECT a cualquier authenticated, pero esta función centraliza y normaliza el input).
- Función `public.regenerate_my_wake_code()` SECURITY DEFINER, rate-limited (máx 1/min via `updated_at` check).

### 2. Server functions (`src/lib/friends.functions.ts`)

- `getMyWakeCode()` → devuelve `wake_code` del usuario actual.
- `lookupWakeCode({ code })` → normaliza (uppercase, strip non-alphanum), llama RPC `lookup_by_wake_code`, devuelve perfil o null.
- `sendFriendRequestByCode({ code })` → resuelve code → reutiliza lógica existente de `sendFriendRequest`.
- `regenerateWakeCode()` → RPC.

### 3. UI

**`src/routes/_authenticated/circle.tsx`** — añadir en la parte superior:
- Tarjeta destacada con código formateado, botones **Copiar**, **Compartir** (Web Share API), **QR** (modal con `<canvas>` usando `qrcode` lib), **Regenerar** (con confirm).
- Bloque "Añadir por código" con input segmentado de 8 caracteres + botón.

**`src/routes/_authenticated/settings.tsx`** — mostrar el código también como info secundaria.

**Nueva ruta pública `src/routes/add.$code.tsx`** — landing de invitación.

### 4. Dependencia nueva

- `qrcode` (~20kB, sin deps nativas) para generar QR client-side.

## Fuera de alcance

- Códigos temporales/de un solo uso.
- Estadísticas de cuántos te han añadido por código.
- Deep linking nativo (Capacitor/Universal Links) — el link `https://` ya funciona en web.
