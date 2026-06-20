import { getAudioContext, playGentleTone, vibratePattern } from "./audio-context";

class WakeAudioManager {
  private currentAudio: HTMLAudioElement | null = null;
  private zenOsc: OscillatorNode | null = null;
  private zenGain: GainNode | null = null;
  private zenStopTimer: number | null = null;
  private ringInterval: number | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;

  playRingLoop() {
    this.stopRing();
    vibratePattern([400, 200, 400, 200, 800]);
    playGentleTone(1.2).catch(() => {});
    this.ringInterval = window.setInterval(() => {
      vibratePattern([400, 200, 400]);
      playGentleTone(1.0).catch(() => {});
    }, 4000);
  }

  stopRing() {
    if (this.ringInterval !== null) {
      window.clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(0); } catch { /* noop */ }
    }
  }

  playClip(url: string): Promise<void> {
    this.stopClip();
    return new Promise((resolve, reject) => {
      const a = new Audio(url);
      a.preload = "auto";
      this.currentAudio = a;
      a.onended = () => {
        if (this.currentAudio === a) this.currentAudio = null;
        resolve();
      };
      a.onerror = () => {
        if (this.currentAudio === a) this.currentAudio = null;
        reject(new Error("audio_error"));
      };
      a.play().catch((e) => reject(e));
    });
  }

  stopClip() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.src = "";
      } catch { /* noop */ }
      this.currentAudio = null;
    }
  }

  speak(text: string, lang = "es-ES"): Promise<void> {
    this.cancelSpeech();
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = 0.95;
        u.onend = () => {
          if (this.activeUtterance === u) this.activeUtterance = null;
          resolve();
        };
        u.onerror = () => {
          if (this.activeUtterance === u) this.activeUtterance = null;
          resolve();
        };
        this.activeUtterance = u;
        window.speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    });
  }

  cancelSpeech() {
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch { /* noop */ }
    this.activeUtterance = null;
  }

  playZen(durationMs = 30000) {
    this.stopZen();
    try {
      const c = getAudioContext();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = 196;
      gain.gain.setValueAtTime(0.0001, c.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, c.currentTime + 4);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start();
      this.zenOsc = osc;
      this.zenGain = gain;
      this.zenStopTimer = window.setTimeout(() => this.stopZen(), durationMs);
    } catch { /* noop */ }
  }

  stopZen() {
    if (this.zenStopTimer !== null) {
      window.clearTimeout(this.zenStopTimer);
      this.zenStopTimer = null;
    }
    if (this.zenOsc && this.zenGain) {
      try {
        const c = getAudioContext();
        const now = c.currentTime;
        this.zenGain.gain.cancelScheduledValues(now);
        this.zenGain.gain.setValueAtTime(this.zenGain.gain.value, now);
        this.zenGain.gain.linearRampToValueAtTime(0.0001, now + 0.25);
        this.zenOsc.stop(now + 0.3);
      } catch { /* noop */ }
      try { this.zenOsc.disconnect(); } catch { /* noop */ }
      try { this.zenGain.disconnect(); } catch { /* noop */ }
    }
    this.zenOsc = null;
    this.zenGain = null;
  }

  stopAll() {
    this.stopRing();
    this.stopClip();
    this.cancelSpeech();
    this.stopZen();
  }
}

export const wakeAudio = new WakeAudioManager();
