import type { Candle, Timeframe } from "@/lib/types";
import type { SosSettings } from "@/lib/config/wick";
import type { WickDirection } from "@/lib/config/wick";
import { atr, ema } from "./indicators";

/**
 * SHIFT OF STRUCTURE.
 *
 * A sequence, not a single event. Three things must happen in order:
 *
 *   1. THE SHIFT — for a buy, a candle CLOSES above the most recent LOWER HIGH;
 *      for a sell, below the most recent HIGHER LOW. A lower high is a swing
 *      high beneath the swing high before it: the thing a downtrend keeps
 *      making. Breaking the most recent one is what says the trend has turned.
 *      A wick through the line is not a break; the body has to close beyond it.
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
  /** What that level was: the HL an uptrend broke, or the LH a downtrend broke. */
  lineLabel: "HL" | "LH";
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

export interface Elbow {
  index: number;
  t: number;
  price: number;
  kind: "high" | "low";
  /**
   * How this elbow sits against the previous one of its own kind:
   * HH higher high, LH lower high, HL higher low, LL lower low.
   * Null for the first of each kind, which has nothing to compare against.
   */
  label: "HH" | "LH" | "HL" | "LL" | null;
  /**
   * The bar at which this point was KNOWN to be a turn — price had to move away
   * from it far enough to prove it. Replaying structure bar by bar reads this
   * rather than `index`, so nothing is marked before it could have been seen.
   */
  confirmedIndex: number;
}

/**
 * Elbows: the turning points of the structure, measured on body edges.
 *
 * Price makes a high, turns, makes a low, turns again — so the points alternate,
 * and that is what this walks. It follows the running extreme in the direction
 * price is going and only calls the turn once price has come back off it by more
 * than `minSwingAtr` x ATR(14); the extreme it came off becomes the elbow, and
 * the walk reverses.
 *
 * The fractal rule this replaces — most extreme of the k bars either side —
 * silently dropped turns where one neighbouring body ran past the turn bar, so a
 * chart in a clean uptrend showed its higher highs and missed the higher lows
 * between them. An alternating walk cannot miss one: every high has a low after
 * it. The ATR threshold is what keeps noise out, rather than a bar count.
 */
export function findElbows(candles: Candle[], minSwingAtr = 0.5): Elbow[] {
  if (candles.length < 3) return [];
  const atrSeries = atr(candles, 14);
  // ATR has no value until it has enough bars; the first one it does produce is
  // the best available stand-in for the bars before it.
  const firstAtr = atrSeries.find((a): a is number => a != null) ?? null;
  const threshold = (i: number) => {
    const a = atrSeries[i] ?? firstAtr;
    if (a != null && a > 0) return a * minSwingAtr;
    // No ATR at all (a series shorter than the window): fall back to a fraction
    // of price so the walk still has a scale to work against.
    return Math.abs(candles[i].c) * 0.002 * minSwingAtr;
  };

  const out: Elbow[] = [];
  const push = (index: number, kind: "high" | "low", confirmedIndex: number) =>
    out.push({
      index,
      t: candles[index].t,
      price: kind === "high" ? bodyTop(candles[index]) : bodyBottom(candles[index]),
      kind,
      label: null,
      confirmedIndex,
    });

  let dir: "up" | "down" | null = null;
  let hiIdx = 0;
  let loIdx = 0;

  for (let i = 1; i < candles.length; i++) {
    const th = threshold(i);
    const top = bodyTop(candles[i]);
    const bot = bodyBottom(candles[i]);

    if (dir === null) {
      // Until price has moved far enough either way, both extremes are still
      // candidates and whichever is left behind first becomes the first elbow.
      if (top > bodyTop(candles[hiIdx])) hiIdx = i;
      if (bot < bodyBottom(candles[loIdx])) loIdx = i;
      if (hiIdx < i && bodyTop(candles[hiIdx]) - bot > th) {
        push(hiIdx, "high", i);
        dir = "down";
        loIdx = i;
      } else if (loIdx < i && top - bodyBottom(candles[loIdx]) > th) {
        push(loIdx, "low", i);
        dir = "up";
        hiIdx = i;
      }
      continue;
    }

    // STRICTLY higher carries the leg on. Matching the running extreme does not:
    // one candle opens where the last one closed, so a red bar inside a rally
    // ties the high it is pulling back from, and treating that tie as a new high
    // swallowed the turn — which is exactly why rallies showed their higher
    // highs and none of the higher lows between them.
    if (dir === "up") {
      if (top > bodyTop(candles[hiIdx])) hiIdx = i;
      else if (bodyTop(candles[hiIdx]) - bot > th) {
        push(hiIdx, "high", i);
        dir = "down";
        loIdx = i;
      }
    } else {
      if (bot < bodyBottom(candles[loIdx])) loIdx = i;
      else if (top - bodyBottom(candles[loIdx]) > th) {
        push(loIdx, "low", i);
        dir = "up";
        hiIdx = i;
      }
    }
  }

  // Each elbow is named against the previous one of its own kind, which is what
  // makes it structure: a high is only a LOWER high relative to the high before.
  let lastHigh: number | null = null;
  let lastLow: number | null = null;
  for (const e of out) {
    if (e.kind === "high") {
      if (lastHigh != null) e.label = e.price > lastHigh ? "HH" : "LH";
      lastHigh = e.price;
    } else {
      if (lastLow != null) e.label = e.price > lastLow ? "HL" : "LL";
      lastLow = e.price;
    }
  }
  return out;
}

/**
 * THE LINE.
 *
 * The structure point in force: the most recent higher low or lower high,
 * whichever came last. That is the elbow price is working away from, and the one
 * a close beyond turns the structure — break an uptrend's higher low and it has
 * turned down, break a downtrend's lower high and it has turned up.
 *
 * Highs and lows that are not HL or LH carry no line. A lower low is where a
 * downtrend already went, not a level it has still to break.
 *
 * Reads only elbows already confirmed at `atIndex`, so replaying the series bar
 * by bar never uses a turn that had not happened yet.
 */
export interface StructureLine {
  price: number;
  t: number;
  /** Which way a break of this line shifts the structure. */
  shift: WickDirection;
  /** The elbow the line sits on, named: an uptrend's HL, a downtrend's LH. */
  label: "HL" | "LH";
  /**
   * True once a close has already gone beyond it. A broken level is history, not
   * a level to watch, so it is reported rather than drawn across the chart.
   */
  broken: boolean;
}

function currentLine(
  elbows: Elbow[],
  atIndex: number,
  candles: Candle[],
): StructureLine | null {
  let found: Elbow | null = null;
  for (const e of elbows) {
    if (e.confirmedIndex > atIndex) break;
    if (e.label === "HL" || e.label === "LH") found = e;
  }
  if (!found) return null;

  const shift: WickDirection = found.label === "HL" ? "sell" : "buy";
  let broken = false;
  for (let i = found.index + 1; i <= atIndex && i < candles.length; i++) {
    const beyond = shift === "sell" ? candles[i].c < found.price : candles[i].c > found.price;
    if (beyond) {
      broken = true;
      break;
    }
  }
  return { price: found.price, t: found.t, shift, label: found.label as "HL" | "LH", broken };
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
  const elbows = findElbows(candles, settings.swingAtr);
  const out: SosEvent[] = [];

  let i = 60;
  // A line is broken once. Without this, every bar that stays past it
  // re-qualifies and the series fills with duplicates of the same break — the
  // next shift waits for a new elbow to form.
  let lastLineT = -1;

  while (i < candles.length) {
    const line = currentLine(elbows, i - 1, candles);
    if (!line || line.broken) {
      i++;
      continue;
    }
    if (line.t === lastLineT) {
      i++;
      continue;
    }

    const up = line.shift === "buy";
    const c = candles[i];
    // The break is a CLOSE beyond the line. A wick through is not a break, and
    // the 50 EMA has no say here — that test belongs to the confirmation candle,
    // which is where the method puts it.
    if (up ? c.c <= line.price : c.c >= line.price) {
      i++;
      continue;
    }

    const event: SosEvent = {
      direction: line.shift,
      line: line.price,
      lineLabel: line.label,
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
  line: StructureLine | null;
  latest: SosEvent | null;
  events: SosEvent[];
  /** Every structure point on the series, for marking up the chart. */
  elbows: Elbow[];
} {
  const elbows = findElbows(candles, settings.swingAtr);
  const events = findSosEvents(candles, settings);
  return {
    timeframe,
    line: currentLine(elbows, candles.length - 1, candles),
    latest: events[0] ?? null,
    events,
    // Trimmed to what a chart can show without becoming a wall of dots.
    elbows: elbows.slice(-80),
  };
}
