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

/* Structure is read from BODIES, not wicks. A line is drawn at the edge of the
   body at each elbow, and a wick poking past an elbow does not make a new one. */
const bodyTop = (c: Candle) => Math.max(c.o, c.c);
const bodyBottom = (c: Candle) => Math.min(c.o, c.c);

interface Elbow {
  index: number;
  t: number;
  price: number;
  kind: "high" | "low";
}

/**
 * Elbows: the turning points of the structure, measured on body edges.
 *
 * Same symmetric fractal rule the rest of the app uses — a bar is an elbow when
 * its body edge is the most extreme of the k bars either side — but reading the
 * body rather than the wick, which is where the line actually gets drawn.
 */
function findElbows(candles: Candle[], k = 3): Elbow[] {
  const out: Elbow[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      // Ties are the normal case on bodies: a candle opens where the last one
      // closed, so the turn bar and the one after it share a body edge exactly.
      // Rejecting both on equality finds no elbows at all. Only a STRICTLY more
      // extreme neighbour disqualifies; equality to the left does, so a plateau
      // yields one elbow at its start rather than one per bar.
      if (bodyTop(candles[j]) > bodyTop(candles[i])) isHigh = false;
      if (j < i && bodyTop(candles[j]) === bodyTop(candles[i])) isHigh = false;
      if (bodyBottom(candles[j]) < bodyBottom(candles[i])) isLow = false;
      if (j < i && bodyBottom(candles[j]) === bodyBottom(candles[i])) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ index: i, t: candles[i].t, price: bodyTop(candles[i]), kind: "high" });
    else if (isLow) out.push({ index: i, t: candles[i].t, price: bodyBottom(candles[i]), kind: "low" });
  }
  return out;
}

/**
 * THE LINE.
 *
 * One line, on the most recent elbow of whichever kind the trend is making. An
 * uptrend makes higher lows, so the line sits on the latest higher low and
 * ratchets up as new ones form; a downtrend makes lower highs and the line
 * ratchets down. Breaking it IS the shift, and the shift runs AGAINST the trend
 * that drew it — break an uptrend's higher low and the structure has turned
 * down, break a downtrend's lower high and it has turned up.
 */
function currentLine(
  candles: Candle[],
  index: number,
): { price: number; t: number; shift: WickDirection } | null {
  const elbows = findElbows(candles.slice(0, index + 1), 3);
  const lows = elbows.filter((e) => e.kind === "low");
  const highs = elbows.filter((e) => e.kind === "high");
  if (lows.length < 2 && highs.length < 2) return null;

  const risingLows = lows.length >= 2 && lows[lows.length - 1].price > lows[lows.length - 2].price;
  const fallingHighs = highs.length >= 2 && highs[highs.length - 1].price < highs[highs.length - 2].price;

  // When both read the same way the newer elbow decides, so the line follows the
  // structure that is actually in front of price.
  if (risingLows && !fallingHighs) {
    const e = lows[lows.length - 1];
    return { price: e.price, t: e.t, shift: "sell" };
  }
  if (fallingHighs && !risingLows) {
    const e = highs[highs.length - 1];
    return { price: e.price, t: e.t, shift: "buy" };
  }
  if (risingLows && fallingHighs) {
    const lo = lows[lows.length - 1];
    const hi = highs[highs.length - 1];
    return lo.index >= hi.index
      ? { price: lo.price, t: lo.t, shift: "sell" }
      : { price: hi.price, t: hi.t, shift: "buy" };
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
  settings: SosSettings,
  limit = 40,
): SosEvent[] {
  const closes = candles.map((c) => c.c);
  const emaSeries = ema(closes, 50);
  const atrSeries = atr(candles, 14);
  const out: SosEvent[] = [];

  let i = 60;
  // A line is broken once. Without this, every bar that stays past it
  // re-qualifies and the series fills with duplicates of the same break — the
  // next shift waits for a new elbow to form.
  let lastLineT = -1;

  while (i < candles.length) {
    const line = currentLine(candles, i - 1);
    const e = emaSeries[i];
    if (!line || e == null) {
      i++;
      continue;
    }
    if (line.t === lastLineT) {
      i++;
      continue;
    }

    const up = line.shift === "buy";
    const c = candles[i];
    // The BODY must clear the line, and the close must be the right side of the
    // EMA. Either failing means the structure has not shifted and the line stands.
    const clearedLine = up ? bodyBottom(c) > line.price && c.c > line.price : bodyTop(c) < line.price && c.c < line.price;
    const clearedEma = up ? c.c > e : c.c < e;
    if (!clearedLine || !clearedEma) {
      i++;
      continue;
    }

    const event: SosEvent = {
      direction: line.shift,
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
    let pullbackAt = -1;
    for (let j = i + 1; j < candles.length && j <= i + settings.confirmWithin; j++) {
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
        break;
      }
    }

    out.push(event);
    lastLineT = line.t;
    i += 1;
  }

  return out.slice(-limit).reverse();
}

/**
 * The live read: the line price is standing on right now, and the most recent
 * shift sequence it produced.
 */
export function sosSnapshot(
  candles: Candle[],
  timeframe: Timeframe,
  settings: SosSettings,
): {
  timeframe: Timeframe;
  /** The elbow line in force now, and which way a break of it would shift. */
  line: { price: number; t: number; shift: WickDirection } | null;
  latest: SosEvent | null;
  events: SosEvent[];
} {
  const events = findSosEvents(candles, settings);
  return {
    timeframe,
    line: currentLine(candles, candles.length - 1),
    latest: events[0] ?? null,
    events,
  };
}
