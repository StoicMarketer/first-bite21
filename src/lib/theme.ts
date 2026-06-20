import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "sw-theme";

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return v === "dark" || v === "light" ? v : null;
}

export function resolveTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", t === "dark");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "dark" ? "#1a1714" : "#f4efe6");
}

export function setTheme(t: Theme) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, t);
  applyTheme(t);
  window.dispatchEvent(new CustomEvent("sw-theme-change", { detail: t }));
}

export function useTheme(): [Theme, (t: Theme) => void, () => void] {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    applyTheme(theme);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<Theme>).detail;
      if (t) setThemeState(t);
    };
    window.addEventListener("sw-theme-change", handler);
    return () => window.removeEventListener("sw-theme-change", handler);
  }, []);

  const update = (t: Theme) => { setTheme(t); setThemeState(t); };
  const toggle = () => update(theme === "dark" ? "light" : "dark");

  return [theme, update, toggle];
}

export const themeInitScript = `(function(){try{var s=localStorage.getItem('${KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
