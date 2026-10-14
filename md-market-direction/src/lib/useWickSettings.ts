"use client";

import { useCallback, useEffect, useState } from "react";
import { WICK_DEFAULTS, type WickSettings } from "@/lib/config/wick";

const KEY = "md.wickSettings";
const EVENT = "md:wickSettings";

/**
 * Wick thresholds, held per browser.
 *
 * Unknown and out-of-shape values fall back to the default rather than being
 * trusted, so an old saved payload from before a setting existed cannot leave a
 * threshold undefined and silently change what counts as a setup.
 */
function read(): WickSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...WICK_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<WickSettings>;
    const out = { ...WICK_DEFAULTS };
    for (const key of Object.keys(WICK_DEFAULTS) as (keyof WickSettings)[]) {
      const v = parsed[key];
      if (key === "alignment") {
        if (v === "strict" || v === "loose") out.alignment = v;
      } else if (typeof v === "number" && Number.isFinite(v)) {
        (out[key] as number) = v;
      }
    }
    return out;
  } catch {
    return { ...WICK_DEFAULTS };
  }
}

export function useWickSettings(): {
  settings: WickSettings;
  set: <K extends keyof WickSettings>(key: K, value: WickSettings[K]) => void;
  reset: (key?: keyof WickSettings) => void;
  isDefault: (key: keyof WickSettings) => boolean;
} {
  const [settings, setSettings] = useState<WickSettings>(WICK_DEFAULTS);

  useEffect(() => {
    const sync = () => setSettings(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const save = useCallback((next: WickSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* not persisting is survivable; the session still honours the choice */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const set = useCallback(
    <K extends keyof WickSettings>(key: K, value: WickSettings[K]) => {
      save({ ...read(), [key]: value });
    },
    [save],
  );

  const reset = useCallback(
    (key?: keyof WickSettings) => {
      save(key ? { ...read(), [key]: WICK_DEFAULTS[key] } : { ...WICK_DEFAULTS });
    },
    [save],
  );

  const isDefault = useCallback(
    (key: keyof WickSettings) => settings[key] === WICK_DEFAULTS[key],
    [settings],
  );

  return { settings, set, reset, isDefault };
}

/** The settings as query params, so the API scores exactly what is on screen. */
export function wickQuery(settings: WickSettings): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(settings)) p.set(k, String(v));
  return p.toString();
}
