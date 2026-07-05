
# Sunbeams: gamificación integrada en "Círculo"

Reorganizamos la app para que "Círculo" sea el perfil completo del usuario: identidad + progreso + red social. "Ajustes" desaparece de la barra y vive dentro de un icono de rueda en la esquina superior derecha de "Círculo". Alarma, Canales y Recibidos quedan intactos.

## 1. Reorganización de navegación

**Barra de navegación (4 pestañas, antes 5):**
```text
Alarma   Círculo   Canales   Recibidos
```

- Se elimina la pestaña **Ajustes** de la barra inferior.
- Se elimina el badge de racha ✨ de la parte superior de **Alarma** (se mueve a Círculo).
- Alarma, Canales y Recibidos: **sin cambios**.

**Nueva pestaña Círculo — jerarquía:**
```text
┌────────────────────────────────┐
│              ⚙️  ← Ajustes       │  ← icono arriba a la derecha
│      [ Avatar grande ]         │
│      Nombre para mostrar       │
│      @tu_handle                │
│                                │
│  ── Nivel: Aurora ──           │
│  [████████░░░] 320/750 ☀️      │
│                                │
│   12       3        7 🔥       │
│  Círculo Pendientes Racha      │
│                                │
│  [Compartir perfil]  [QR]      │
├────────────────────────────────┤
│  Retos de la semana (2/3)      │
│  · Envía a 5 personas   ▓▓▓░░  │
│  · Racha de 7 días      ▓▓▓▓▓ ✓│
│  · Despierta 5 días     ▓▓░░░  │
├────────────────────────────────┤
│  Tu círculo esta semana        │
│  [🥇 Marta 240] [🥈 Javi 180] …│
├────────────────────────────────┤
│  Logros (7/22)                 │
│  [🔥][🌅][👥][🌟][?][?][?] …  │
├────────────────────────────────┤
│  Añadir por @usuario           │
│  Solicitudes pendientes        │
│  En tu círculo                 │
└────────────────────────────────┘
```

**Rueda de Ajustes → hoja lateral (Sheet):** al pulsar el ⚙️ se abre un `<Sheet side="right">` con todo el contenido actual de `settings.tsx` (perfil/@usuario, cumpleaños, apariencia, permisos, modo desarrollador, cerrar sesión). La ruta `/settings` se conserva como redirect a `/circle` por si algún enlace la referencia.

## 2. Sistema Sunbeams ☀️ (dentro de Círculo)

Puntos que se ganan por acciones (según elección: **enviar** + **despertar con la app**):

| Acción | Sunbeams |
|---|---|
| Enviar un amanecer a alguien de tu círculo | +10 |
| Enviar a alguien nuevo (primera vez) | +25 bonus |
| Abrir /wake y escuchar el mensaje del día | +5 |
| Bonus por día de racha (envío o despertar) | +2 por día (tope +20) |
| Completar reto semanal | +50 |
| Desbloquear logro | 25–200 según rareza |

**Niveles** (acumulado, no se resetea):
```text
Alba          0
Aurora        250
Amanecer      750
Solsticio     2 000
Mediodía      5 000
Cenit         12 000
Eterno       25 000
```
Barra de progreso al siguiente nivel visible bajo el @handle.

## 3. Rachas (visibles en el header de Círculo)

Dos rachas independientes:
- **Racha de envío**: días consecutivos enviando ≥1 mensaje. Reutiliza `profiles.streak_count` como base.
- **Racha de despertar**: días consecutivos abriendo /wake.

Hitos: 3, 7, 14, 30, 60, 100, 365 → logro automático.

**Congelador (streak freeze)**: 1 día de gracia al mes por racha; se consume automáticamente si se rompería.

## 4. Logros (~22 iniciales, grid en Círculo)

4 familias con icono, título, descripción y rareza (Común/Rara/Épica/Legendaria):

- **Constancia**: Primer amanecer, Racha 7/30/100, Madrugador (despertar antes de las 7:00 ×10)
- **Círculo**: Primer amigo, Círculo de 5/15, 5 favoritos, Enviaste a todo tu círculo en una semana
- **Volumen**: 10/50/250/1000 mensajes enviados
- **Diversidad**: A 3 personas en un día, A 10 en una semana, Primer audio, Primer mensaje a un canal
- **Especiales**: Se despertaron contigo ×10, Fin de semana perfecto, Aniversario (1 año)

Al desbloquear: modal centrado con blur, icono grande, animación de partículas doradas y botón "Compartir" (envía tarjeta a un amigo del círculo).

## 5. Retos semanales

Cada lunes 00:00 (UTC) se asignan 3 retos rotativos por usuario:
- "Envía amaneceres a 5 personas distintas"
- "Mantén tu racha 7 días"
- "Despierta con la app 5 días"
- "Envía a alguien nuevo"
- "Reacciona a 3 amaneceres recibidos"

Card con 3 barras en Círculo. Completar los 3 → bonus + logro "Semana perfecta".

## 6. Leaderboard privado del círculo

Sección "Tu círculo esta semana" en Círculo: lista horizontal ordenada por Sunbeams ganados en los últimos 7 días entre tus amigos. Muestra avatar + mini badge de nivel + puntos semanales. Solo tú ves el ranking de tu propio círculo.

Además, cada avatar de amigo (aquí y en "Envíales un amanecer" de Alarma) lleva un mini badge de nivel — la única intrusión visual en la pestaña Alarma, y solo si el amigo tiene nivel ≥ Aurora (sin ensuciar).

## 7. Notificaciones sociales (opt-in)

Push reutilizando `push_subscriptions`:
- "Marta acaba de alcanzar racha de 30 días 🔥"
- "Nuevo nivel en tu círculo: Javi es ahora Solsticio"
- "Te quedan 4h para no perder tu racha"

---

## Detalles técnicos

### Migración SQL (una sola)

```sql
CREATE TABLE public.user_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  sunbeams INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 0,
  send_streak INT NOT NULL DEFAULT 0,
  send_streak_last_date DATE,
  wake_streak INT NOT NULL DEFAULT 0,
  wake_streak_last_date DATE,
  send_freeze_available BOOLEAN NOT NULL DEFAULT true,
  wake_freeze_available BOOLEAN NOT NULL DEFAULT true,
  freeze_reset_month DATE NOT NULL DEFAULT date_trunc('month', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.achievements (
  code TEXT PRIMARY KEY,
  family TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  rarity TEXT NOT NULL,
  sunbeams_reward INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE public.user_achievements (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  achievement_code TEXT NOT NULL REFERENCES public.achievements(code),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, achievement_code)
);

CREATE TABLE public.weekly_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  week_start DATE NOT NULL,
  code TEXT NOT NULL,
  target INT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, week_start, code)
);

CREATE TABLE public.sunbeam_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sunbeam_events_user_week_idx
  ON public.sunbeam_events (user_id, created_at DESC);

-- GRANTs + RLS: cada tabla lectura/escritura por su dueño; user_progress y
-- user_achievements del círculo se leen sólo si hay friendship aceptada.
-- Seed inicial del catálogo de achievements dentro de la misma migración.
```

RPC `award_sunbeams(_amount, _reason, _ref)` (SECURITY DEFINER): inserta evento, actualiza total y nivel, devuelve `{ new_total, new_level, level_up }`.

RPCs `apply_send_event(_message_id)` y `apply_wake_event()` que en una transacción actualizan racha + puntos + progreso de retos + chequeo de logros. Devuelven la lista de logros recién desbloqueados.

### Backend

**Nuevo archivo `src/lib/gamification.functions.ts`:**
- `getMyProgress()` → `{ sunbeams, level, nextLevelAt, sendStreak, wakeStreak, achievements[], weeklyChallenges[] }`
- `getCircleLeaderboard()` → top del círculo por sunbeams últimos 7 días
- `markAchievementSeen(code)`
- `registerWakeOpen()` (llamado desde `/wake` al montar)

**Modificaciones:**
- `sendMessage` en `messages.functions.ts`: tras insertar, llama a `apply_send_event`; devuelve `{ ...actual, unlocks: [...], levelUp: bool }` para disparar popup.
- Nuevo cron `src/routes/api/public/hooks/weekly-reset.ts` (lunes 00:00 UTC): asigna 3 retos aleatorios por usuario activo y resetea freezes mensuales.

### Frontend

**Reescritura de `src/routes/_authenticated/circle.tsx`** con esta composición vertical:
1. `<CircleTopBar>` (botón ⚙️ que abre `<SettingsSheet>`)
2. `<ProfileHeader>` extendido (avatar + @handle + display name + botones compartir/QR)
3. `<LevelBar>` (nivel + Sunbeams + progreso)
4. `<StatsRow>` (3 contadores: Círculo · Pendientes · Racha)
5. `<WeeklyChallengesCard>`
6. `<CircleLeaderboard>`
7. `<AchievementsGrid>` (grid 2×N, bloqueados en gris con `?`)
8. `<AddByHandle>` (ya existe)
9. Pendientes + En tu círculo (ya existen)

**Nuevos componentes:**
- `src/components/settings-sheet.tsx` — envuelve el contenido de `settings.tsx` en `<Sheet side="right">`. Se reutiliza literalmente el JSX y los mutadores actuales.
- `src/components/level-bar.tsx`
- `src/components/weekly-challenges-card.tsx`
- `src/components/circle-leaderboard.tsx`
- `src/components/achievements-grid.tsx`
- `src/components/achievement-unlocked-modal.tsx` (global, escucha resultado de `sendMessage`/`registerWakeOpen`)
- `src/components/level-badge.tsx` (mini badge junto a avatares)

**Rutas:**
- `src/routes/_authenticated/settings.tsx` → convertirlo en redirect `beforeLoad: () => redirect({ to: "/circle" })`. Alternativa: borrar el archivo y ajustar cualquier `<Link to="/settings">` (hay uno en la barra de navegación) para que apunte al ⚙️ de `/circle`.
- **Actualizar `MobileShell`** (`src/components/mobile-shell.tsx`): quitar la pestaña "Ajustes" de la barra inferior.

### Cron / mantenimiento

Un único cron semanal (`0 0 * * 1`) en `weekly-reset.ts`. La detección de ruptura de racha es pasiva (se comprueba `last_date` en cada evento, respetando timezone del perfil, consumiendo freeze si aplica).

## Fases de entrega

1. **Fase 0 (reorganización UI)**: quitar pestaña Ajustes, mover contenido a `SettingsSheet` con ⚙️ en Círculo, redirect `/settings → /circle`. Sin cambios de lógica. *(Se puede desplegar aisladamente.)*
2. **Fase 1 (base)**: tablas + RPCs + `LevelBar` + integración con `sendMessage` y `/wake` + `StatsRow` con racha unificada. Popup de subida de nivel.
3. **Fase 2 (logros)**: catálogo seed + `AchievementsGrid` + `AchievementUnlockedModal`.
4. **Fase 3 (social)**: `CircleLeaderboard` + `LevelBadge` en avatares del círculo (y sección "Envíales un amanecer" de Alarma) + retos semanales + cron.
5. **Fase 4 (pulido)**: notificaciones push de hitos + tarjeta compartible de logro + micro-animaciones.

## Preguntas abiertas

- ¿`profiles.streak_count` actual se migra como saldo inicial de Sunbeams (p.ej. ×10) o todos empezamos desde 0?
- ¿Retos semanales rotación aleatoria simple del pool, o adaptados al comportamiento del usuario?
- El `LevelBadge` junto a avatares en la sección "Envíales un amanecer" de Alarma es la única "contaminación" del bloque gamificado fuera de Círculo — ¿lo mantenemos o preferís que Alarma quede totalmente limpia?
