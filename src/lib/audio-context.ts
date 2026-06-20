// Singleton AudioContext primed by a user gesture to bypass autoplay restrictions.
let ctx: AudioContext | null = null;
let primed = false;

export function getAudioContext(): AudioContext {
  if (typeof window === "undefined") {
    throw new Error("AudioContext only available in the browser");
  }
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

export async function primeAudio(): Promise<boolean> {
  try {
    const c = getAudioContext();
    if (c.state === "suspended") await c.resume();
    // Play one silent tick to fully unlock on iOS
    const osc = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0.0001;
    osc.connect(g);
    g.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.02);
    primed = true;
    return true;
  } catch (e) {
    console.error("Failed to prime audio", e);
    return false;
  }
}

export function isAudioPrimed() {
  return primed;
}

export async function playGentleTone(durationSec = 1.2) {
  const c = getAudioContext();
  if (c.state === "suspended") await c.resume();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = 240;
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.18, c.currentTime + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durationSec);
  osc.connect(g);
  g.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + durationSec + 0.05);
}

export function vibratePattern(pattern: number[] = [400, 200, 400, 200, 800]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* noop */
    }
  }
}

// MediaRecorder helpers
export function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch { /* noop */ }
  }
  return "";
}

export async function startRecorder(): Promise<{ recorder: MediaRecorder; stream: MediaStream; mime: string }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickAudioMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  return { recorder, stream, mime };
}
