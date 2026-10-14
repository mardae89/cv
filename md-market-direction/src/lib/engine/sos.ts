import type { Candle, Timeframe } from "@/lib/types";
import type { SosSettings } from "@/lib/config/wick";
import type { WickDirection } from "@/lib/config/wick";
import { atr, ema } from "./indicators";
import { findSwings } from "./structure";

/**
 * SHIFT OF STRUCTURE.
 *
 * A sequence, not a single event. Three things must happen in order:
 *
 *   1. THE SHIFT — for a buy, a candle BODY closes above the most recent LOWER
 *      HIGH; for a sell, below the most recent HIGHER LOW. A lower high is a
 *      swing high beneath the swing high before it: the thing a downtrend keeps
 *      making. Breaking the most recent one is what says the trend has turned.
 *
 *      The body must also close on the correct side of the 50 EMA. A wick
 *      through the line is not a shift, and neither is a close that is past the
 *      line but still the wrong side of the EMA — in that case the structure has
 *      not shifted yet and the line stands.
 *
 *   2. THE PULLBACK — price pauses or retraces. Read either as at least one
 *      candle closing against the direction, or as price returning to within a
 *      set distance of the shift line. Switchable.
 *
 *   3. THE CONFIRMATION — a candle that engulfs the one before it, or whose body
 *      is at least `confirmBodyAtr` x ATR(14). It too must close the correct
 *      side of the 50 EMA.
 *
 * Nothing here decides position size, entry price or risk. It marks where a
 * structure shift completed.
 */

export interface SosEvent {
  direction: WickDirection;
  /** The level a body had to close beyond. */
  line: number;
  /** Bar where the line was set (the lower high / higher low itself). */
  lineT: number;
  /** Bar whose body closed beyond the line AND the EMA. */
  shiftT: number;
  shiftClose: number;
  /** Bar recognised as the pullback, null while still waiting for one. */
  pullbackT: number | null;
  /** Bar that confirmed, null while still waiting. */
  confirmT: number | null;
  confirmKind: "engulfing" | "body" | null;
  confirmClose: number | null;
  state: "shifted" | "pullback" | "confirmed";
}

function isEngulfing(prev: Candle, c: Candle, up: boolean): boolean {
  const body = (x: Candle) => [Math.min(x.o, x.c), Math.max(x.o, x.c)] as const;
  const [pLo, pHi] = body(prev);
  const [cLo, cHi] = body(c);
  const directional = up ? c.c > c.o : c.c < c.o;
  return directional && cLo <= pLo && cHi >= pHi;
}

/**
 * The most recent lower high (buy) or higher low (sell) at or before `index`.
 *
 * "Lower" and "higher" are judged against the previous swing of the same kind,
 * which is what makes it structure rather than just the last swing.
 */
function structureLine(
  candles: Candle[],
  index: number,
  up: boolean,
): { price: number; t: number; index: number } | null {
  const swings = findSwings(candles.slice(0, index + 1), 3);
  const kind = up ? "high" : "low";
  const same = swings.filter((s) => s.kind === kind);
  for (let i = same.length - 1; i >= 1; i--) {
    const cur = same[i];
    const prev = same[i - 1];
    const qualifies = up ? cur.price < prev.price : cur.price > prev.price;
    if (qualifies) return { price: cur.price, t: cur.t, index: cur.index };
  }
  return null;
}

/**
 * Walk the series and return every completed or in-progress shift sequence.
 *
 * Replayed forward using only the candles available at each bar, so a sequence
 * listed here is one the live detector would have produced at the time.
 */
export function findSosEvents(
  candles: Candle[],
  direction: WickDirection,
  settings: SosSettings,
  limit = 40,
): SosEvent[] {
  const up = direction === "buy";
  const closes = candles.map((c) => c.c);
  const emaSeries = ema(closes, 50);
  const atrSeries = atr(candles, 14);
  const out: SosEvent[] = [];

  let i = 60;
  // A structure line is broken once. Without this, every bar that stays past the
  // line re-qualifies and the series fills with duplicate "shifts" of the same
  // break — the next one has to wait for a NEW lower high (or higher low) to
  // form above it.
  let lastLineT = -1;

  while (i < candles.length) {
    const line = structureLine(candles, i - 1, up);
    const e = emaSeries[i];
    if (!line || e == null) {
      i++;
      continue;
    }
    if (line.t === lastLineT) {
      i++;
      continue;
    }

    const c = candles[i];
    const bodyTop = Math.max(c.o, c.c);
    const bodyBottom = Math.min(c.o, c.c);
    // The BODY must clear the line, and the close must be the right side of the
    // EMA. Either failing means the structure has not shifted and the line stands.
    const clearedLine = up ? bodyTop > line.price && c.c > line.price : bodyBottom < line.price && c.c < line.price;
    const clearedEma = up ? c.c > e : c.c < e;
    if (!clearedLine || !clearedEma) {
      i++;
      continue;
    }

    const event: SosEvent = {
      direction,
      line: line.price,
      lineT: line.t,
      shiftT: c.t,
      shiftClose: c.c,
      pullbackT: null,
      confirmT: null,
      confirmKind: null,
      confirmClose: null,
      state: "shifted",
    };

    /* 2. the pullback */
    let j = i + 1;
    let pullbackAt = -1;
    for (; j < candles.length && j <= i + settings.confirmWithin; j++) {
      const k = candles[j];
      const hit =
        settings.pullback === "candle"
          ? (up ? k.c < k.o : k.c > k.o)
          : (() => {
              const a = atrSeries[j] ?? 0;
              return up
                ? k.l <= line.price + a * settings.retestAtr
                : k.h >= line.price - a * settings.retestAtr;
            })();
      if (hit) {
        pullbackAt = j;
        break;
      }
    }

    if (pullbackAt >= 0) {
      event.pullbackT = candles[pullbackAt].t;
      event.state = "pullback";

      /* 3. the confirmation */
      for (let k = pullbackAt + 1; k < candles.length && k <= pullbackAt + settings.confirmWithin; k++) {
        const cand = candles[k];
        const ce = emaSeries[k];
        const a = atrSeries[k];
        if (ce == null || a == null) continue;
        const sideOk = up ? cand.c > ce : cand.c < ce;
        if (!sideOk) continue;
        const body = Math.abs(cand.c - cand.o);
        const directional = up ? cand.c > cand.o : cand.c < cand.o;
        const engulf = isEngulfing(candles[k - 1], cand, up);
        const strong = directional && body >= settings.confirmBodyAtr * a;
        if (!engulf && !strong) continue;
        event.confirmT = cand.t;
        event.confirmKind = engulf ? "engulfing" : "body";
        event.confirmClose = cand.c;
        event.state = "confirmed";
        i = k;
        break;
      }
    }

    out.push(event);
    lastLineT = line.t;
    i += 1;
  }

  return out.slice(-limit).reverse();
}

/** The live sequence on each side, if one is running. */
export function sosSnapshot(
  candles: Candle[],
  timeframe: Timeframe,
  settings: SosSettings,
): { timeframe: Timeframe; buy: SosEvent | null; sell: SosEvent | null; events: SosEvent[] } {
  const buys = findSosEvents(candles, "buy", settings);
  const sells = findSosEvents(candles, "sell", settings);
  return {
    timeframe,
    buy: buys[0] ?? null,
    sell: sells[0] ?? null,
    events: [...buys, ...sells].sort((a, b) => b.shiftT - a.shiftT),
  };
}
