import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(hhmm: string) {
  // "07:00" -> "07:00"
  return hhmm.slice(0, 5);
}

export function nextTriggerAt(timeStr: string, tz?: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

export function humanCountdown(target: Date): string {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "ahora";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `en ${m} min`;
  return `en ${h}h ${m}m`;
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
