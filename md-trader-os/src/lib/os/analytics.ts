import { pipSize } from "@/lib/data/universe";
import type { CheckIn, Trade, TradingPlan } from "./store";
import { dayKey, RED_FLAG_EMOTIONS } from "./store";

/**
 * JOURNAL ANALYTICS.
 *
 * R is the unit throughout: a trade's result divided by what it risked. It is
 * the only number that compares a EUR/USD scalp with a NAS100 swing, and the
 * only one that says whether the edge is real independent of position size.
 * Money P/L is reported beside it whenever the trader logged it.
 */

/* ------------------------------- closing a trade ------------------------------ */

export interface CloseInput {
  exit: number | null;
  pnl: number | null;
}

/** Works out pips, R and the outcome from whatever the trader entered. */
export function settle(trade: Trade, input: CloseInput): Pick<Trade, "exit" | "pnl" | "pips" | "resultR" | "outcome"> {
  const sign = trade.direction === "long" ? 1 : -1;
  const exit = input.exit != null && Number.isFinite(input.exit) ? input.exit : null;
  const pnl = input.pnl != null && Number.isFinite(input.pnl) ? input.pnl : null;

  const pips = exit != null ? ((exit - trade.entry) * sign) / pipSize(trade.symbol) : null;

  // Price-based R is exact when a stop was recorded; money-based R covers the
  // trader who logs only what the broker paid them.
  let resultR: number | null = null;
  if (exit != null && trade.stop != null && trade.stop !== trade.entry) {
    resultR = ((exit - trade.entry) * sign) / Math.abs(trade.entry - trade.stop);
  } else if (pnl != null && trade.riskAmount) {
    resultR = pnl / trade.riskAmount;
  }

  const basis = resultR ?? (pnl != null ? pnl : pips);
  const scratch = resultR != null ? 0.05 : pnl != null ? 0 : 0.5;
  const outcome: Trade["outcome"] =
    basis == null ? "breakeven" : basis > scratch ? "win" : basis < -scratch ? "loss" : "breakeven";

  return { exit, pnl, pips, resultR, outcome };
}

/* --------------------------------- summaries --------------------------------- */

export interface Stats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  /** Mean R per trade — the expectancy. */
  expectancy: number | null;
  totalR: number;
  avgWinR: number | null;
  avgLossR: number | null;
  profitFactor: number | null;
  pnl: number;
  hasPnl: boolean;
  bestR: number | null;
  worstR: number | null;
  maxLosingStreak: number;
  maxDrawdownR: number;
  planAdherence: number | null;
}

function closedOf(trades: Trade[]) {
  return trades.filter((t) => t.outcome !== "open");
}

/** A trade's R if known; otherwise its sign from P/L, so streaks still count. */
function rOf(t: Trade): number | null {
  return t.resultR;
}

export function stats(trades: Trade[]): Stats {
  const closed = closedOf(trades).slice().sort((a, b) => (a.closedAt ?? a.openedAt) - (b.closedAt ?? b.openedAt));
  const wins = closed.filter((t) => t.outcome === "win");
  const losses = closed.filter((t) => t.outcome === "loss");
  const rs = closed.map(rOf).filter((r): r is number => r != null);
  const winR = rs.filter((r) => r > 0);
  const lossR = rs.filter((r) => r < 0);
  const totalR = rs.reduce((a, b) => a + b, 0);

  const pnlTrades = closed.filter((t) => t.pnl != null);
  const pnl = pnlTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);

  // Profit factor from R when there is R, else from money.
  let profitFactor: number | null = null;
  if (rs.length) {
    const gross = winR.reduce((a, b) => a + b, 0);
    const lost = Math.abs(lossR.reduce((a, b) => a + b, 0));
    profitFactor = lost ? gross / lost : gross ? Infinity : null;
  } else if (pnlTrades.length) {
    const gross = pnlTrades.filter((t) => (t.pnl ?? 0) > 0).reduce((s, t) => s + (t.pnl ?? 0), 0);
    const lost = Math.abs(pnlTrades.filter((t) => (t.pnl ?? 0) < 0).reduce((s, t) => s + (t.pnl ?? 0), 0));
    profitFactor = lost ? gross / lost : gross ? Infinity : null;
  }

  let streak = 0;
  let maxStreak = 0;
  for (const t of closed) {
    streak = t.outcome === "loss" ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }

  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const r of closed.map(rOf)) {
    if (r == null) continue;
    equity += r;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }

  const judged = closed.filter((t) => t.followedPlan != null);

  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    expectancy: rs.length ? totalR / rs.length : null,
    totalR,
    avgWinR: winR.length ? winR.reduce((a, b) => a + b, 0) / winR.length : null,
    avgLossR: lossR.length ? lossR.reduce((a, b) => a + b, 0) / lossR.length : null,
    profitFactor,
    pnl,
    hasPnl: pnlTrades.length > 0,
    bestR: rs.length ? Math.max(...rs) : null,
    worstR: rs.length ? Math.min(...rs) : null,
    maxLosingStreak: maxStreak,
    maxDrawdownR: maxDd,
    planAdherence: judged.length ? (judged.filter((t) => t.followedPlan).length / judged.length) * 100 : null,
  };
}

export interface Bucket {
  key: string;
  trades: number;
  winRate: number;
  expectancy: number | null;
  totalR: number;
  pnl: number;
}

export function groupBy(trades: Trade[], keyFn: (t: Trade) => string | string[] | null): Bucket[] {
  const map = new Map<string, Trade[]>();
  for (const t of closedOf(trades)) {
    const k = keyFn(t);
    if (k == null) continue;
    for (const key of Array.isArray(k) ? k : [k]) {
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
  }
  return Array.from(map.entries())
    .map(([key, list]) => {
      const s = stats(list);
      return { key, trades: s.trades, winRate: s.winRate, expectancy: s.expectancy, totalR: s.totalR, pnl: s.pnl };
    })
    .sort((a, b) => b.trades - a.trades);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function breakdowns(trades: Trade[]) {
  return {
    byMarket: groupBy(trades, (t) => t.symbol),
    byStrategy: groupBy(trades, (t) => t.strategy || "Unspecified"),
    bySetup: groupBy(trades, (t) => (t.setupGrade ? `${t.setupGrade} setup` : null)),
    bySession: groupBy(trades, (t) => t.session),
    byEmotion: groupBy(trades, (t) => t.emotionBefore),
    byPlan: groupBy(trades, (t) => (t.followedPlan == null ? null : t.followedPlan ? "Followed my plan" : "Broke my plan")),
    byDay: groupBy(trades, (t) => DAYS[new Date(t.openedAt).getDay()]),
    byDirection: groupBy(trades, (t) => (t.direction === "long" ? "Long" : "Short")),
    byScore: groupBy(trades, (t) => {
      const s = t.mdScoreAtEntry;
      if (s == null) return null;
      const strength = Math.max(s, 100 - s);
      return strength >= 75 ? "MD alignment 75+" : strength >= 60 ? "MD alignment 60–74" : "MD alignment under 60";
    }),
    byMistake: groupBy(trades, (t) => (t.mistakes.length ? t.mistakes : null)),
  };
}

/** Cumulative R, trade by trade, for the equity curve. */
export function equityCurve(trades: Trade[]): { t: number; r: number }[] {
  let r = 0;
  return closedOf(trades)
    .filter((t) => t.resultR != null)
    .sort((a, b) => (a.closedAt ?? a.openedAt) - (b.closedAt ?? b.openedAt))
    .map((t) => {
      r += t.resultR ?? 0;
      return { t: t.closedAt ?? t.openedAt, r };
    });
}

/** Net result per calendar day — R where known, money otherwise. */
export function dailyResults(trades: Trade[]): Map<string, { r: number; pnl: number; trades: number }> {
  const out = new Map<string, { r: number; pnl: number; trades: number }>();
  for (const t of closedOf(trades)) {
    const k = dayKey(t.closedAt ?? t.openedAt);
    const cur = out.get(k) ?? { r: 0, pnl: 0, trades: 0 };
    cur.r += t.resultR ?? 0;
    cur.pnl += t.pnl ?? 0;
    cur.trades += 1;
    out.set(k, cur);
  }
  return out;
}

/* ---------------------------------- today ----------------------------------- */

export interface TodayState {
  tradesToday: number;
  openNow: number;
  rToday: number;
  pnlToday: number;
  /** Losses in a row, counting back from the most recent closed trade. */
  lossStreak: number;
  /** Today's loss as a share of the daily limit, 0..1+ (null when unknowable). */
  lossUsed: number | null;
  tradesUsed: number;
  lastLossAt: number | null;
}

export function today(trades: Trade[], plan: TradingPlan, now = Date.now()): TodayState {
  const key = dayKey(now);
  const todays = trades.filter((t) => dayKey(t.openedAt) === key);
  const closedToday = trades.filter((t) => t.outcome !== "open" && dayKey(t.closedAt ?? t.openedAt) === key);
  const rToday = closedToday.reduce((s, t) => s + (t.resultR ?? 0), 0);
  const pnlToday = closedToday.reduce((s, t) => s + (t.pnl ?? 0), 0);

  const closed = trades
    .filter((t) => t.outcome !== "open")
    .sort((a, b) => (b.closedAt ?? b.openedAt) - (a.closedAt ?? a.openedAt));
  let lossStreak = 0;
  for (const t of closed) {
    if (t.outcome === "loss") lossStreak++;
    else break;
  }
  const lastLoss = closed.find((t) => t.outcome === "loss");

  // The daily limit is a percentage of the account. With an account size it is
  // measured in money; without one, in R, since 1R = the per-trade risk %.
  let lossUsed: number | null = null;
  if (plan.maxDailyLossPct > 0) {
    if (plan.accountSize && closedToday.some((t) => t.pnl != null)) {
      const limit = (plan.accountSize * plan.maxDailyLossPct) / 100;
      lossUsed = pnlToday < 0 ? -pnlToday / limit : 0;
    } else if (plan.riskPerTradePct > 0) {
      const limitR = plan.maxDailyLossPct / plan.riskPerTradePct;
      lossUsed = rToday < 0 ? -rToday / limitR : 0;
    }
  }

  return {
    tradesToday: todays.length,
    openNow: trades.filter((t) => t.outcome === "open").length,
    rToday,
    pnlToday,
    lossStreak,
    lossUsed,
    tradesUsed: plan.maxTradesPerDay > 0 ? todays.length / plan.maxTradesPerDay : 0,
    lastLossAt: lastLoss ? lastLoss.closedAt ?? lastLoss.openedAt : null,
  };
}

/* -------------------------------- tilt meter -------------------------------- */

export interface Tilt {
  /** 0 calm … 100 stop trading. */
  level: number;
  state: "clear" | "caution" | "tilted";
  label: string;
  reasons: string[];
}

/**
 * How likely the next trade is to be an emotional one, from what the journal
 * and the morning check-in already know. Each factor names itself, so the meter
 * is never a mystery number.
 */
export function tilt(trades: Trade[], plan: TradingPlan, checkIn: CheckIn | null, now = Date.now()): Tilt {
  const t = today(trades, plan, now);
  const reasons: string[] = [];
  let level = 0;

  if (t.lossStreak > 0) {
    const share = t.lossStreak / Math.max(1, plan.maxConsecutiveLosses);
    level += Math.min(40, share * 32);
    reasons.push(`${t.lossStreak} loss${t.lossStreak > 1 ? "es" : ""} in a row (your limit is ${plan.maxConsecutiveLosses})`);
  }
  if (t.lossUsed != null && t.lossUsed > 0) {
    level += Math.min(40, t.lossUsed * 40);
    reasons.push(`${Math.round(t.lossUsed * 100)}% of today's loss limit used`);
  }
  if (plan.maxTradesPerDay > 0 && t.tradesToday >= plan.maxTradesPerDay) {
    level += 25;
    reasons.push(`Trade limit reached (${t.tradesToday} of ${plan.maxTradesPerDay})`);
  } else if (t.tradesUsed >= 0.66 && t.tradesToday > 0) {
    level += 8;
  }
  if (t.lastLossAt && now - t.lastLossAt < plan.cooldownMinutes * 60_000) {
    level += 15;
    reasons.push(`Last loss was ${Math.max(1, Math.round((now - t.lastLossAt) / 60_000))} min ago — inside your ${plan.cooldownMinutes}-minute cool-down`);
  }
  const todays = trades.filter((x) => dayKey(x.openedAt) === dayKey(now));
  const flagged = todays.filter((x) => x.emotionBefore && RED_FLAG_EMOTIONS.includes(x.emotionBefore));
  if (flagged.length) {
    level += 12 * flagged.length;
    reasons.push(`Entered ${flagged.length} trade${flagged.length > 1 ? "s" : ""} today feeling ${Array.from(new Set(flagged.map((x) => x.emotionBefore))).join(", ").toLowerCase()}`);
  }
  if (todays.some((x) => x.mistakes.includes("Revenge trade"))) {
    level += 20;
    reasons.push("A trade today is already tagged as revenge");
  }
  if (checkIn) {
    if (checkIn.sleep != null && checkIn.sleep <= 2) {
      level += 10;
      reasons.push("Poor sleep logged this morning");
    }
    if (checkIn.stress != null && checkIn.stress >= 4) {
      level += 10;
      reasons.push("High stress logged this morning");
    }
    if (checkIn.mood != null && checkIn.mood <= 2) {
      level += 6;
      reasons.push("Low mood logged this morning");
    }
  }

  level = Math.min(100, Math.round(level));
  const state: Tilt["state"] = level >= 55 ? "tilted" : level >= 25 ? "caution" : "clear";
  const label =
    state === "tilted" ? "Step away — today is no longer about the market"
      : state === "caution" ? "Caution — slow down, A+ setups only"
        : "Clear head — trade your plan";
  return { level, state, label, reasons };
}

/* ---------------------------- losing-streak math ---------------------------- */

/**
 * Probability of at least one run of `k` or more consecutive losses in `n`
 * independent trades that each lose with probability `q`. Exact, by dynamic
 * programming over the length of the current run.
 */
export function streakProbability(n: number, k: number, q: number): number {
  if (k <= 0) return 1;
  if (n < k) return 0;
  // state[j] = probability of being on a run of exactly j losses with no k-run yet
  let state = new Array(k).fill(0);
  state[0] = 1;
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const next = new Array(k).fill(0);
    for (let j = 0; j < k; j++) {
      const p = state[j];
      if (!p) continue;
      next[0] += p * (1 - q);
      if (j + 1 >= k) hit += p * q;
      else next[j + 1] += p * q;
    }
    state = next;
  }
  return hit;
}

/** The longest losing streak you should expect to see at least once, ~50% odds. */
export function expectedWorstStreak(n: number, q: number): number {
  let k = 1;
  while (k < n && streakProbability(n, k + 1, q) >= 0.5) k++;
  return k;
}
