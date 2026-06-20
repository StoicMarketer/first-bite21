
# Diagnóstico

Comprobé los dos usuarios de prueba en la base de datos:

- **alex** (`alexmosqueracapdevila@gmail.com`) → alarma `07:00`, inactiva.
- **elmarketer** (`elmarketerestoico@gmail.com`) → alarma `19:15`, inactiva.
- Amistad aceptada de alex → elmarketer.
- Hay **3 audios** enviados por alex a elmarketer hoy ~17:05 UTC, todos con `scheduled_for = 2026-06-21` y `is_played = false`.

## Por qué la alarma que sonó fue "la predeterminada" (zen)

Cuando se envió el audio, la alarma del receptor era todavía la default `07:00`. En `sendMessage` (src/lib/messages.functions.ts) se calcula `scheduled_for` así:
1. Toma la hora de la alarma actual del receptor.
2. Si esa hora ya pasó hoy, suma 1 día.

Como 07:00 < 17:05, los mensajes quedaron fijados a **mañana**. Luego el usuario cambió la alarma a 19:15, pero los mensajes ya estaban "congelados" para el día siguiente.

Resultado: al disparar `/wake` hoy, `getWakeQueue` filtra `scheduled_for <= hoy` → devuelve **lista vacía** → `playNext(0)` entra en la rama `if (list.length === 0) startZen()` → suena el oscilador zen de 196 Hz durante 30 s. Eso es "la alarma predeterminada".

## Por qué se solapan/quedan sonidos sonando en /wake

En `src/routes/_authenticated/wake.tsx` hay tres fuentes de audio independientes sin un gestor común:

1. **Tono de ringing** (`playGentleTone` + `toneInterval` cada 4 s). El `useEffect` lo limpia al cambiar de fase, pero `playGentleTone` crea su propio oscilador que se auto-apaga; ok.
2. **Audio del mensaje** (`new Audio(signedUrl)`) guardado en `audioRef`.
3. **Zen fallback** (`startZen`) que crea otro oscilador + gain dentro del `AudioContext` global, **sin guardarlos en ninguna ref**.

`stopAndExit` hace `audioRef.current?.pause()` y `zenRef.current?.pause()`, pero `zenRef` **nunca se asigna**, así que el oscilador del zen sigue corriendo dentro del AudioContext aunque el componente se desmonte y se navegue fuera. Ese es el "otro sonido que se queda activado".

Además, al deslizar para descartar, `dismiss()` cambia a fase `playing` y llama a `playNext(0)`; si la cola está vacía, lanza `startZen` mientras el `useEffect` de ringing aún está limpiándose en el mismo tick → momento en que pueden coincidir el último tono gentle y el inicio del zen.

# Plan de implementación

## 1. Entrega real de mensajes (fix de `scheduled_for`)

Archivo: `src/lib/messages.functions.ts`

- `getWakeQueue`: dejar de filtrar por `scheduled_for <= today`. Devolver **todos los mensajes no jugados** cuyo `created_at <= now()` para el `receiver_id`. Mantener `scheduled_for` solo como metadato informativo ("se entregará en tu próxima alarma").
- `sendMessage`: seguir calculando `scheduled_for` para la UI del remitente (cuándo lo recibirá), pero usando la alarma activa del receptor; si la alarma está inactiva, marcar `scheduled_for = mañana` por convención. Esto ya no bloquea la entrega.
- Efecto neto: los 3 audios de alex pasarán a entregarse en la próxima apertura de `/wake` de elmarketer, independientemente del cambio de alarma.

## 2. Disparo de la alarma (Home)

Archivo: `src/routes/_authenticated/home.tsx`

- Mantener el loop que navega a `/wake` cuando `Date.now() >= nextTriggerAt(alarmTime)` y `isActive`.
- Añadir guarda anti-doble-disparo: si la URL ya es `/wake`, no re-navegar.
- Dejar el modo simulación (`/wake?force=true`) intacto.

## 3. Gestor único de audio para /wake

Archivo nuevo: `src/lib/wake-audio.ts` con una clase singleton ligera `WakeAudio` que expone:

```ts
playRingLoop()      // tono suave + vibración cada 4s
stopRing()
playClip(url): Promise<void>   // resuelve al terminar; rechaza si error
stopClip()
playZen(): void     // arranca oscilador, guarda refs internos
stopZen()
stopAll()           // pausa <audio>, cancela osciladores, cancela speechSynthesis, limpia intervalos, vibrate(0)
```

Internamente guarda:
- `currentAudio: HTMLAudioElement | null`
- `zenOsc / zenGain` y un timer de auto-stop
- `ringInterval`
- Referencia al `AudioContext` con `disconnect()` real

## 4. Refactor de `src/routes/_authenticated/wake.tsx`

- Sustituir todos los `useRef<HTMLAudioElement>`, `toneInterval`, `startZen` inline y los efectos de audio por llamadas al `WakeAudio` singleton.
- En cada transición de fase, llamar primero a `WakeAudio.stopAll()` y luego arrancar la fuente correspondiente (ring / clip / zen).
- `useEffect(() => () => WakeAudio.stopAll(), [])` al desmontar.
- Botón X (`stopAndExit`) y el final de `reacting → done` también llaman `stopAll()` antes de `navigate`.
- TTS (`SpeechSynthesisUtterance`): registrar el `utterance` activo y cancelarlo en `stopAll()`.
- Si `playClip` falla (URL caducada, formato no soportado), mostrar `toast.error` y avanzar al siguiente mensaje, en lugar de quedarse colgado.

## 5. Verificación con los dos usuarios

Una vez desplegado:
1. Login como elmarketer → entrar a `/wake?force=true` → debe reproducir secuencialmente los 3 audios pendientes (signedUrl válida 5 min) y marcarlos `is_played=true`.
2. Login como alex → enviar un audio nuevo de prueba → activar alarma de elmarketer a +2 min → en elmarketer, esperar a que Home dispare `/wake` automáticamente y reproduzca el nuevo audio.
3. Pulsar X en cualquier fase → confirmar que ningún sonido continúa después de navegar fuera.

## Detalles técnicos

- **No** se tocan tablas ni RLS; solo se relaja el filtro de `scheduled_for` en lectura.
- `WakeAudio` vive en cliente; usa el `AudioContext` ya creado por `getAudioContext()` en `src/lib/audio-context.ts`.
- El oscilador zen se guarda en `this.zenOsc` y `this.zenGain`; `stopZen()` hace `gain.linearRampToValueAtTime(0.0001, now+0.3); osc.stop(now+0.4); osc.disconnect(); gain.disconnect();` y limpia el timer de auto-stop.
- `stopAll` también ejecuta `window.speechSynthesis.cancel()` y `navigator.vibrate(0)`.
- El loop de Home comprueba `location.pathname !== "/wake"` antes de navegar para evitar re-entradas.

## Archivos afectados

- `src/lib/messages.functions.ts` (lógica de cola)
- `src/lib/wake-audio.ts` (nuevo gestor de audio)
- `src/routes/_authenticated/wake.tsx` (refactor a gestor único)
- `src/routes/_authenticated/home.tsx` (guarda anti-doble-disparo)
