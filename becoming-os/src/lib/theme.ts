// Day (light) and Night (dark) appearance. The choice is a per-device
// preference, kept in this browser; "system" follows the device setting, or
// the claude.ai viewer's own light/dark choice when the app runs inside it.
import { useEffect, useState } from "react";

export type ThemeChoice = "day" | "night" | "system";
const KEY = "becoming-os:theme";
const listeners = new Set<() => void>();

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "day" || v === "night" || v === "system") return v;
  } catch {
    // storage blocked: fall through to the default
  }
  return "night";
}

function systemIsLight(): boolean {
  const host = document.documentElement.getAttribute("data-theme");
  if (host === "light") return true;
  if (host === "dark") return false;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches;
}

export function effectiveTheme(choice = getThemeChoice()): "light" | "dark" {
  if (choice === "day") return "light";
  if (choice === "night") return "dark";
  return systemIsLight() ? "light" : "dark";
}

function apply() {
  const t = effectiveTheme();
  const root = document.documentElement;
  if (t === "light") root.setAttribute("data-app-theme", "light");
  else root.removeAttribute("data-app-theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "light" ? "#f8f7f4" : "#0a0a0b");
  listeners.forEach((l) => l());
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // storage blocked: the choice lasts for this visit only
  }
  current = choice;
  apply();
}

let current: ThemeChoice = "night";

/** Call once before the first render, so the right colours paint immediately. */
export function initTheme() {
  current = getThemeChoice();
  apply();
  if (typeof matchMedia === "function") {
    matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => current === "system" && apply());
  }
  // The claude.ai viewer sets data-theme on the root when its own theme changes.
  new MutationObserver(() => current === "system" && apply()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

/** The current choice and resolved theme, re-rendering when either changes. */
export function useTheme(): { choice: ThemeChoice; theme: "light" | "dark"; setChoice: (c: ThemeChoice) => void } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return { choice: current, theme: effectiveTheme(current), setChoice: setThemeChoice };
}
