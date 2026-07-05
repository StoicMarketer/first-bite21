
## Objetivo

1. Sustituir el código de 8 dígitos (`wake_code`) por el `@username` como identificador público para añadir contactos, tal como Instagram/X.
2. Rediseñar la pestaña "Círculo" con formato de perfil social: avatar grande, `@handle`, nombre, contador de personas en el círculo, botón compartir perfil, y debajo la lista.

---

## Cambios funcionales

### A. Identificador = @username

- `@username` ya existe en `profiles` (único, generado en `handle_new_user`). Lo elevamos a identificador público.
- En **Ajustes** se añade un editor de `@username` (validación: `^[a-z0-9_]{3,20}$`, único). Server fn `updateUsername`.
- La URL de invitación pasa de `/add/<CODE>` a `/u/<username>`. Mantenemos `/add/<code>` como alias (redirige) para no romper enlaces ya compartidos.
- Nueva server fn `lookupUsername({ username })` (SECURITY DEFINER RPC `lookup_by_username`) que devuelve `{ id, username, display_name, avatar_url }`.
- `AddByCode` se renombra a `AddByHandle`: input con prefijo `@`, autoformato a minúsculas, sin guion. Sigue mostrando la ficha con avatar + botón "Añadir".
- El `wake_code` deja de mostrarse en la UI. NO se borra de la base de datos ni el RPC (compatibilidad con enlaces antiguos), simplemente queda oculto y no se regenera manualmente.

### B. Círculo estilo perfil social

Estructura de `/circle` reescrita:

```text
┌────────────────────────────┐
│      [ Avatar grande ]     │
│      Nombre para mostrar   │
│      @tu_handle    [editar]│
│                            │
│   12         3             │
│  Círculo  Pendientes       │
│                            │
│  [Compartir perfil]  [QR]  │
└────────────────────────────┘

Añadir a alguien
[ @ input ....................... ] [Buscar]

Solicitudes pendientes (3)
· fila · fila · fila

En tu círculo (12)
· fila · fila · fila
```

- El contador **Círculo** = `circle.length` (personas aceptadas). Se muestra siempre, con `—` mientras carga.
- El contador **Pendientes** = `pending.length`. Al pulsarlo hace scroll a la sección.
- "Compartir perfil" comparte `${origin}/u/<username>` con `navigator.share`; "QR" abre el mismo modal QR existente pero con la nueva URL y mostrando `@handle` en lugar del código.
- Se elimina la búsqueda por texto libre (`searchUsers`) para simplificar; sólo se añade por handle exacto. (Mantengo la server fn por si se quiere reactivar).

### C. Ruta `/u/$username`

- Nueva ruta pública `src/routes/u.$username.tsx` calcada de `add.$code.tsx`, usando `lookupUsername`.
- `src/routes/add.$code.tsx` se conserva y, al resolver, redirige a `/u/<username>` cuando encuentra el perfil.

---

## Detalles técnicos

**Migración SQL** (una sola):
- `CREATE OR REPLACE FUNCTION public.lookup_by_username(_username text) RETURNS TABLE(...) SECURITY DEFINER` que hace `SELECT ... WHERE username = lower(_username)`.
- `CREATE OR REPLACE FUNCTION public.update_my_username(_username text)` que valida regex, unicidad y actualiza `profiles.username` del `auth.uid()`. Devuelve el username final.
- No se toca la tabla `profiles` (ya tiene `username unique`).

**Server fns nuevas en `src/lib/friends.functions.ts`**:
- `lookupUsername` (POST, auth) → llama `lookup_by_username`.
- `updateUsername` (POST, auth) → llama `update_my_username`, invalida caché.
- `getMyProfile` (GET, auth) → devuelve `{ username, display_name, avatar_url }` para el header del círculo.

**Componentes**:
- Nuevo `src/components/profile-header.tsx` (avatar + nombre + @ + contadores + acciones compartir/QR).
- Nuevo `src/components/add-by-handle.tsx` (reemplaza a `add-by-code.tsx`; este se borra).
- `wake-code-card.tsx` se borra de la vista de Círculo (queda el archivo por si se reusa el modal QR — extraeremos `QrModal` a `src/components/qr-modal.tsx`).
- `src/routes/_authenticated/circle.tsx` se reescribe según el layout de arriba.
- `src/routes/_authenticated/settings.tsx` gana un bloque "Tu @usuario" con input + botón guardar.

**Rutas**:
- Añadir `src/routes/u.$username.tsx`.
- Actualizar `src/routes/add.$code.tsx`: al obtener `preview` con `username`, `navigate({ to: "/u/$username", params: { username: preview.username }, replace: true })`.
- Regenerar `routeTree.gen.ts` automáticamente (plugin Vite).

**Compatibilidad**:
- Los enlaces `/add/<CODE>` existentes siguen funcionando (redirigen).
- Notificaciones/mensajes actuales no dependen de `wake_code`, sólo de `id`.

---

## Fuera de alcance
- No se elimina la columna `wake_code` ni los RPC `regenerate_my_wake_code` / `lookup_by_wake_code` (compatibilidad).
- No se cambia la lógica de canales, alarmas ni notificaciones push.
- No se añade búsqueda por texto ni sugerencias de amigos.

## Verificación
- Playwright: sign-in → `/circle` muestra header con `@handle` y contadores; añadir por `@` de otro usuario de prueba envía solicitud; el otro perfil ve pendiente y acepta.
- Comprobar que `/add/<code>` antiguo redirige a `/u/<username>`.
- `tsgo` limpio.
