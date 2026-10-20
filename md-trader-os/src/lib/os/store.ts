"use client";

import { useCallback, useEffect, useState } from "react";
import type { Timeframe } from "@/lib/types";

/**
 * BECOMING — THE TRADER'S OWN DATA.
 *
 * Journal, plan, check-ins, vision board and reviews all live in this browser,
 * the same way watchlists and alerts do: there is no sign-in, so there is no
 * server profile to keep them in. Each area has its own key so one corrupted
 * value can never take the others down with it.
 *
 * Every read and write is wrapped. A private window or blocked storage degrades
 * to "empty", and a full quota reports itself instead of throwing — the vision
 * board's images are the one thing large enough to hit it.
 */

export const OS_KEYS = {
  plan: "mdos.plan.v1",
  journal: "mdos.journal.v1",
  checkins: "mdos.checkins.v1",
  vision: "mdos.vision.v1",
  reviews: "mdos.reviews.v1",
  reset: "mdos.reset.v1",
} as const;

const EVENT = "mdos:store";

export function readKey<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Returns false when the browser refused the write (quota, private mode). */
export function writeKey<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * A stored value that every component on the page shares: a write anywhere
 * re-renders every reader of the same key, and another tab's write arrives
 * through the storage event.
 *
 * `ready` is false until the stored value has been read, because the server
 * render and the first client render must agree on the fallback.
 */
export function useStored<T>(key: string, fallback: T, normalise?: (raw: T) => T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = (e?: Event) => {
      if (e instanceof CustomEvent && e.detail !== key) return;
      const raw = readKey<T>(key, fallback);
      setValue(normalise ? normalise(raw) : raw);
      setReady(true);
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
    // `fallback` and `normalise` are module constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = useCallback(
    (next: T | ((prev: T) => T)): boolean => {
      const resolved = typeof next === "function"
        ? (next as (prev: T) => T)(normalise ? normalise(readKey<T>(key, fallback)) : readKey<T>(key, fallback))
        : next;
      setValue(resolved);
      return writeKey(key, resolved);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, save, ready] as const;
}

export function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Local calendar date, YYYY-MM-DD — a trader's "today" is their own day. */
export function dayKey(t: number | Date = Date.now()): string {
  const d = typeof t === "number" ? new Date(t) : t;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Monday of the week containing `t`, as a day key. */
export function weekKey(t: number | Date = Date.now()): string {
  const d = new Date(typeof t === "number" ? t : t.getTime());
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return dayKey(d);
}

/* ================================ TRADING PLAN ================================ */

export interface PlanItem {
  id: string;
  text: string;
}

export interface TradingPlan {
  accountSize: number | null;
  accountCurrency: string;
  riskPerTradePct: number;
  maxTradesPerDay: number;
  maxDailyLossPct: number;
  /** Losses in a row that trigger a mandatory break. */
  maxConsecutiveLosses: number;
  /** Length of that break, and of any break taken from the Reset Room. */
  cooldownMinutes: number;
  minRR: number;
  sessions: string[];
  markets: string[];
  strategies: string[];
  /** Ticked before every trade on the journal's pre-trade check. */
  checklist: PlanItem[];
  /** The non-negotiables. */
  rules: PlanItem[];
  whyITrade: string;
  updatedAt: number;
}

export const SESSIONS = ["Asia", "London", "New York", "London / NY overlap"] as const;

export const DEFAULT_PLAN: TradingPlan = {
  accountSize: null,
  accountCurrency: "USD",
  riskPerTradePct: 1,
  maxTradesPerDay: 3,
  maxDailyLossPct: 3,
  maxConsecutiveLosses: 2,
  cooldownMinutes: 30,
  minRR: 2,
  sessions: ["London", "New York"],
  markets: ["EUR/USD", "GBP/USD", "XAU/USD", "NAS100"],
  strategies: ["MD Momentum", "Wick Catch"],
  checklist: [
    { id: "c1", text: "Weekly and daily agree on direction" },
    { id: "c2", text: "Previous weekly candle supports the trade" },
    { id: "c3", text: "Price is on the right side of the weekly 50 EMA" },
    { id: "c4", text: "Entry is at a wick zone, not in the middle of nowhere" },
    { id: "c5", text: "Stop is beyond the wick, not inside it" },
    { id: "c6", text: "Reward is at least my minimum R:R" },
    { id: "c7", text: "No high-impact release in the next hour" },
    { id: "c8", text: "I am calm, not chasing and not trying to win back a loss" },
  ],
  rules: [
    { id: "r1", text: "I never move my stop further away." },
    { id: "r2", text: "I risk the same amount on every trade. No doubling up to recover." },
    { id: "r3", text: "When I hit my daily loss limit, I am done for the day." },
    { id: "r4", text: "If I missed the entry, I let it go. There is always another setup." },
    { id: "r5", text: "Two losses in a row means a break before the next trade." },
    { id: "r6", text: "Every trade gets journaled — wins and losses." },
  ],
  whyITrade: "",
  updatedAt: 0,
};

export function normalisePlan(raw: Partial<TradingPlan> | null | undefined): TradingPlan {
  const p = { ...DEFAULT_PLAN, ...(raw ?? {}) };
  return {
    ...p,
    checklist: Array.isArray(p.checklist) ? p.checklist : DEFAULT_PLAN.checklist,
    rules: Array.isArray(p.rules) ? p.rules : DEFAULT_PLAN.rules,
    sessions: Array.isArray(p.sessions) ? p.sessions : DEFAULT_PLAN.sessions,
    markets: Array.isArray(p.markets) ? p.markets : DEFAULT_PLAN.markets,
    strategies: Array.isArray(p.strategies) && p.strategies.length ? p.strategies : DEFAULT_PLAN.strategies,
  };
}

export function usePlan() {
  return useStored<TradingPlan>(OS_KEYS.plan, DEFAULT_PLAN, normalisePlan);
}

/* =================================== JOURNAL ================================== */

export const EMOTIONS = [
  "Calm", "Confident", "Patient", "Focused", "Neutral",
  "Anxious", "FOMO", "Impatient", "Frustrated", "Revenge", "Greedy", "Fearful", "Bored", "Tired",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

/** Emotions that, by themselves, are a reason not to take the trade. */
export const RED_FLAG_EMOTIONS: Emotion[] = ["FOMO", "Revenge", "Greedy", "Frustrated", "Impatient", "Tired"];

export const MISTAKES = [
  "Entered early",
  "Chased the entry",
  "No stop / moved stop",
  "Oversized position",
  "Against the HTF trend",
  "Revenge trade",
  "FOMO entry",
  "Traded during news",
  "Exited too early",
  "Held a loser too long",
  "Broke a rule",
  "Overtraded",
  "Not in my plan",
] as const;
export type Mistake = (typeof MISTAKES)[number];

export type SetupGrade = "A+" | "A" | "B" | "C";

export interface Trade {
  id: string;
  symbol: string;
  direction: "long" | "short";
  strategy: string;
  setupGrade: SetupGrade | null;
  timeframe: Timeframe;
  session: string | null;
  entry: number;
  stop: number | null;
  target: number | null;
  /** In account currency; drives R when the trade closes with a P/L. */
  riskAmount: number | null;
  lots: number | null;
  mdScoreAtEntry: number | null;
  /** Pre-trade checklist items ticked, by plan item id. */
  checklist: string[];
  checklistTotal: number;
  emotionBefore: Emotion | null;
  confidence: number | null;
  reasons: string;
  screenshotUrl: string | null;
  openedAt: number;
  /* ---- filled in when the trade is closed ---- */
  closedAt: number | null;
  exit: number | null;
  pnl: number | null;
  pips: number | null;
  resultR: number | null;
  outcome: "open" | "win" | "loss" | "breakeven";
  emotionAfter: Emotion | null;
  followedPlan: boolean | null;
  mistakes: Mistake[];
  lesson: string;
  /** How well the trade was executed — not whether it won. */
  executionRating: number | null;
}

export function normaliseTrades(raw: unknown): Trade[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Partial<Trade>[])
    .filter((t) => t && typeof t.id === "string" && typeof t.symbol === "string")
    .map((t) => ({
      strategy: "", setupGrade: null, timeframe: "1H", session: null, stop: null, target: null,
      riskAmount: null, lots: null, mdScoreAtEntry: null, checklist: [], checklistTotal: 0,
      emotionBefore: null, confidence: null, reasons: "", screenshotUrl: null,
      closedAt: null, exit: null, pnl: null, pips: null, resultR: null, outcome: "open",
      emotionAfter: null, followedPlan: null, mistakes: [], lesson: "", executionRating: null,
      direction: "long", entry: 0, openedAt: Date.now(),
      ...t,
    }) as Trade)
    .sort((a, b) => b.openedAt - a.openedAt);
}

export function useTrades() {
  return useStored<Trade[]>(OS_KEYS.journal, [], normaliseTrades);
}

/* ================================== CHECK-INS ================================= */

export interface CheckIn {
  date: string;
  mood: number | null;
  sleep: number | null;
  focus: number | null;
  stress: number | null;
  intention: string;
  gratitude: string;
  /** Pre-session routine items done, by id. */
  routine: string[];
  /** End of day. */
  followedRules: boolean | null;
  reflection: string;
  dayGrade: SetupGrade | null;
  updatedAt: number;
}

export const ROUTINE = [
  { id: "r-htf", text: "Marked the weekly and daily direction on my focus markets" },
  { id: "r-zones", text: "Marked my wick zones and key levels" },
  { id: "r-cal", text: "Checked the economic calendar for red-folder releases" },
  { id: "r-plan", text: "Re-read my rules and my daily loss limit" },
  { id: "r-vision", text: "Looked at my vision board" },
  { id: "r-breath", text: "Two minutes of slow breathing before the open" },
];

export function emptyCheckIn(date: string): CheckIn {
  return {
    date, mood: null, sleep: null, focus: null, stress: null, intention: "", gratitude: "",
    routine: [], followedRules: null, reflection: "", dayGrade: null, updatedAt: 0,
  };
}

export function useCheckIns() {
  return useStored<Record<string, CheckIn>>(OS_KEYS.checkins, {});
}

/* ================================ VISION BOARD ================================ */

export interface VisionItem {
  id: string;
  kind: "image" | "goal" | "affirmation";
  title: string;
  text: string;
  /** A downscaled data URL (uploads) or a link. */
  image: string | null;
  /** Goals only: where you are against where you are going. */
  current: number | null;
  target: number | null;
  unit: string;
  deadline: string | null;
  createdAt: number;
}

export function useVision() {
  return useStored<VisionItem[]>(OS_KEYS.vision, []);
}

/* ================================ WEEKLY REVIEW =============================== */

export interface WeeklyReview {
  week: string;
  wentWell: string;
  toImprove: string;
  lesson: string;
  focusNext: string;
  grade: SetupGrade | null;
  updatedAt: number;
}

export function useReviews() {
  return useStored<Record<string, WeeklyReview>>(OS_KEYS.reviews, {});
}

/* ================================= RESET ROOM ================================= */

export type UrgeKind = "fomo" | "revenge" | "overtrading" | "fear" | "boredom";

export interface UrgeLog {
  id: string;
  at: number;
  kind: UrgeKind;
  resisted: boolean;
  note: string;
}

export interface ResetState {
  cooldownUntil: number | null;
  cooldownReason: string | null;
  urges: UrgeLog[];
}

export const EMPTY_RESET: ResetState = { cooldownUntil: null, cooldownReason: null, urges: [] };

export function useReset() {
  return useStored<ResetState>(OS_KEYS.reset, EMPTY_RESET, (raw) => ({ ...EMPTY_RESET, ...raw, urges: Array.isArray(raw?.urges) ? raw.urges : [] }));
}

/* ================================== BACKUP ==================================== */

/** Everything in Becoming as one JSON document, for export and restore. */
export function exportAll(): string {
  const out: Record<string, unknown> = { app: "md-trader-os", version: 1, exportedAt: new Date().toISOString() };
  for (const [name, key] of Object.entries(OS_KEYS)) out[name] = readKey(key, null);
  return JSON.stringify(out, null, 2);
}

export function importAll(json: string): { ok: boolean; message: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, message: "That file is not valid JSON." };
  }
  if (parsed?.app !== "md-trader-os") return { ok: false, message: "That file is not an MD Trader OS backup." };
  let restored = 0;
  for (const [name, key] of Object.entries(OS_KEYS)) {
    if (parsed[name] != null && writeKey(key, parsed[name])) restored++;
  }
  return { ok: true, message: `Restored ${restored} section${restored === 1 ? "" : "s"}.` };
}
