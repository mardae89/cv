import { buildContext } from "@/lib/engine/context";
import { resolveAsset } from "@/lib/data/universe";
import { TF_MS } from "@/lib/data/synth";
import { ema } from "@/lib/engine/indicators";
import { checkAlignment, detectWickSetup, scanHistory } from "@/lib/engine/wick";
import { sosSnapshot } from "@/lib/engine/sos";
import {
  entryTimeframes,
  lowerRungs,
  rungsFor,
  SOS_DEFAULTS,
  SOS_TIMEFRAMES,
  WICK_DEFAULTS,
  WICK_TIMEFRAME,
  type WickSettings,
} from "@/lib/config/wick";
import { CACHE_SHORT, fail, ok } from "@/lib/api";
import type { Candle, Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Settings arrive as query params so a tuned threshold can be shared as a link. */
function readSettings(params: URLSearchParams): WickSettings {
  const num = (key: keyof WickSettings, lo: number, hi: number) => {
    // An absent param must fall through to the default. Number(null) is 0, which
    // would pass a range starting at 0 and silently override it.
    const given = params.get(key);
    if (given === null || given === "") return WICK_DEFAULTS[key] as number;
    const raw = Number(given);
    return Number.isFinite(raw) && raw >= lo && raw <= hi ? raw : (WICK_DEFAULTS[key] as number);
  };
  return {
    bodyAtrMultiple: num("bodyAtrMultiple", 0.1, 3),
    emaSlopeLookback: Math.round(num("emaSlopeLookback", 2, 50)),
    adxMin: num("adxMin", 0, 60),
    momentumMin: Math.round(num("momentumMin", 1, 20)),
    momentumWindow: Math.round(num("momentumWindow", 2, 20)),
    zoneStart: num("zoneStart", 0.1, 0.9),
    zoneEnd: num("zoneEnd", 0.2, 0.99),
    overrunLimit: num("overrunLimit", 0, 1.5),
    alignment: params.get("alignment") === "strict" ? "strict" : "loose",
  };
}

/**
 * Wick Catching — setups on one market and timeframe.
 *
 * Returns the live read (the candle forming now) and a replay of past setups
 * found with only the candles that existed at the time, so the history can be
 * checked against setups the user already knows were valid.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  // The chart timeframe. The wick setup is ALWAYS weekly; this only decides
  // which series the structure read runs on.
  const tf = (searchParams.get("timeframe") ?? "1D") as Timeframe;
  if (!symbol) return fail("symbol is required");
  if (!SOS_TIMEFRAMES.includes(tf)) return fail(`Unknown timeframe ${tf}.`);

  const asset = resolveAsset(symbol);
  if (!asset) return fail("Unknown symbol", 404);

  const settings = readSettings(searchParams);
  const ctx = await buildContext();

  /* The setup: weekly, always. Wicks are caught on the weekly and nowhere else,
     so the zone has one source whatever chart it is being read against. */
  const weekly = await ctx.candles(asset.symbol, WICK_TIMEFRAME);
  if (weekly.length < 60) return fail("Not enough weekly history.", 503);
  const periodMs = TF_MS[WICK_TIMEFRAME];
  const live = detectWickSetup(asset.symbol, weekly, WICK_TIMEFRAME, settings, periodMs);
  const history = scanHistory(asset.symbol, weekly, WICK_TIMEFRAME, settings, periodMs);

  /* The structure read runs on whatever the chart is showing. */
  const candles = tf === WICK_TIMEFRAME ? weekly : await ctx.candles(asset.symbol, tf);

  /* Alignment needs the rungs below this one. Fetched only when there is a
     setup to check — no setup, no reason to pull more series. */
  if (live.setup && live.direction) {
    const needed = lowerRungs(WICK_TIMEFRAME, rungsFor(settings.alignment));
    const series: Partial<Record<Timeframe, Candle[]>> = {};
    for (const lower of needed) series[lower] = await ctx.candles(asset.symbol, lower);
    live.setup.alignment = checkAlignment(tf, live.direction, series, settings);
  }

  /* The shift-of-structure read on the same series, both directions. */
  const sos = sosSnapshot(candles, tf, SOS_DEFAULTS);

  const closes = candles.map((c) => c.c);

  return ok(
    {
      symbol: asset.symbol,
      name: asset.name,
      precision: asset.precision,
      /** The chart timeframe, which the structure read follows. */
      timeframe: tf,
      /** The setup timeframe, which is always the weekly. */
      setupTimeframe: WICK_TIMEFRAME,
      demo: ctx.demo,
      settings,
      live: {
        setup: live.setup,
        rules: live.rules,
        direction: live.direction,
      },
      entryTimeframes: entryTimeframes(WICK_TIMEFRAME),
      sos,
      history,
      // Returned so the chart can draw the same 50 EMA the rules were read from.
      ema50: ema(closes, 50).slice(Math.max(0, candles.length - 400)),
      candles: candles.slice(Math.max(0, candles.length - 400)),
      generatedAt: Date.now(),
    },
    { headers: CACHE_SHORT },
  );
}
