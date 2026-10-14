import { buildContext } from "@/lib/engine/context";
import { ASSETS } from "@/lib/data/universe";
import { TF_MS } from "@/lib/data/synth";
import { checkAlignment, detectWickSetup } from "@/lib/engine/wick";
import {
  entryTimeframes,
  lowerRungs,
  rungsFor,
  WICK_DEFAULTS,
  WICK_TIMEFRAMES,
  type WickAlignment,
} from "@/lib/config/wick";
import { CACHE_SHORT, fail, ok } from "@/lib/api";
import type { Candle, Timeframe } from "@/lib/types";
import type { WickSetup } from "@/lib/engine/wick";

export const dynamic = "force-dynamic";

/** Markets worth scanning: everything tradable. Macro references are not. */
const SCANNED = ASSETS.filter((a) => a.group !== "Macro Reference");

export interface WickScanRow {
  symbol: string;
  name: string;
  group: string;
  precision: number;
  direction: WickSetup["direction"];
  state: WickSetup["zone"]["state"];
  zoneNear: number;
  zoneFar: number;
  invalidation: number;
  pullbackLabel: string;
  progress: number;
  /** Which lower rungs were checked, and whether they held. */
  alignedWith: string[];
}

/**
 * Every market with a LIVE setup on one timeframe — the board of what is ready
 * right now, not a history.
 *
 * Only `waiting` and `in-zone` are returned. A setup whose price has already run
 * past 0, or closed through the invalidation level, is finished: listing it
 * would pad the board with trades that cannot be taken.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tf = (searchParams.get("timeframe") ?? "1W") as Timeframe;
  const alignment: WickAlignment = searchParams.get("alignment") === "strict" ? "strict" : "loose";
  if (!WICK_TIMEFRAMES.includes(tf)) {
    return fail(`Wick setups are scanned on ${WICK_TIMEFRAMES.join(", ")}.`);
  }

  const ctx = await buildContext();
  const periodMs = TF_MS[tf];
  const settings = { ...WICK_DEFAULTS, alignment };
  const needed = lowerRungs(tf, rungsFor(alignment));
  const rows: WickScanRow[] = [];
  let rejectedByAlignment = 0;

  for (const asset of SCANNED) {
    const candles = await ctx.candles(asset.symbol, tf);
    if (candles.length < 60) continue;

    const { setup } = detectWickSetup(asset.symbol, candles, tf, settings, periodMs);
    if (!setup) continue;
    if (setup.zone.state !== "waiting" && setup.zone.state !== "in-zone") continue;

    // Loose checks one rung below, strict checks two. A setup the lower
    // timeframes contradict is not on the board.
    const series: Partial<Record<Timeframe, Candle[]>> = {};
    for (const lower of needed) series[lower] = await ctx.candles(asset.symbol, lower);
    const aligned = checkAlignment(tf, setup.direction, series, settings);
    if (!aligned.passed) {
      rejectedByAlignment++;
      continue;
    }

    rows.push({
      symbol: asset.symbol,
      name: asset.name,
      group: asset.group,
      precision: asset.precision,
      direction: setup.direction,
      state: setup.zone.state,
      zoneNear: setup.zone.zoneNear,
      zoneFar: setup.zone.zoneFar,
      invalidation: setup.zone.invalidation,
      pullbackLabel: setup.pullbackLabel,
      progress: setup.zoneProgress,
      alignedWith: aligned.aligned,
    });
  }

  // Price already in the zone is the one to look at first; after that, the
  // nearest to it. Alphabetical within a tie so the board does not reshuffle.
  rows.sort(
    (a, b) =>
      Number(b.state === "in-zone") - Number(a.state === "in-zone") ||
      b.progress - a.progress ||
      a.symbol.localeCompare(b.symbol),
  );

  return ok(
    {
      timeframe: tf,
      alignment,
      scanned: SCANNED.length,
      rejectedByAlignment,
      entryTimeframes: entryTimeframes(tf),
      rows,
      demo: ctx.demo,
      generatedAt: Date.now(),
    },
    { headers: CACHE_SHORT },
  );
}
