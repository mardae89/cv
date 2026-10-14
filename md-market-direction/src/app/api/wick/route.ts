import { buildContext } from "@/lib/engine/context";
import { resolveAsset } from "@/lib/data/universe";
import { TF_MS } from "@/lib/data/synth";
import { ema } from "@/lib/engine/indicators";
import { detectWickSetup, scanHistory } from "@/lib/engine/wick";
import { WICK_DEFAULTS, WICK_TIMEFRAMES, type WickSettings } from "@/lib/config/wick";
import { CACHE_SHORT, fail, ok } from "@/lib/api";
import type { Timeframe } from "@/lib/types";

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
  const tf = (searchParams.get("timeframe") ?? "1D") as Timeframe;
  if (!symbol) return fail("symbol is required");
  if (!WICK_TIMEFRAMES.includes(tf)) {
    return fail(`Wick setups are scanned on ${WICK_TIMEFRAMES.join(", ")}.`);
  }

  const asset = resolveAsset(symbol);
  if (!asset) return fail("Unknown symbol", 404);

  const settings = readSettings(searchParams);
  const ctx = await buildContext();
  const candles = await ctx.candles(asset.symbol, tf);
  if (candles.length < 60) return fail("Not enough history on that timeframe.", 503);

  const periodMs = TF_MS[tf];
  const live = detectWickSetup(asset.symbol, candles, tf, settings, periodMs);
  const history = scanHistory(asset.symbol, candles, tf, settings, periodMs);

  const closes = candles.map((c) => c.c);

  return ok(
    {
      symbol: asset.symbol,
      name: asset.name,
      precision: asset.precision,
      timeframe: tf,
      demo: ctx.demo,
      settings,
      live: {
        setup: live.setup,
        rules: live.rules,
        direction: live.direction,
      },
      history,
      // Returned so the chart can draw the same 50 EMA the rules were read from.
      ema50: ema(closes, 50).slice(Math.max(0, candles.length - 400)),
      candles: candles.slice(Math.max(0, candles.length - 400)),
      generatedAt: Date.now(),
    },
    { headers: CACHE_SHORT },
  );
}
