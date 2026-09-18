import { buildContext } from "@/lib/engine/context";
import { scanUniverse, toScannerRow } from "@/lib/engine/market";
import { effectiveTier } from "@/lib/auth/session";
import { viewer } from "@/lib/auth/public";
import { FREE_TIER_SYMBOLS } from "@/lib/data/universe";
import { recordUsage } from "@/lib/db/store";
import { CACHE_SHORT, ok, resolveMode, resolveScope } from "@/lib/api";
import { symbolMatches } from "@/lib/symbols";
import type { ScannerRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const user = await viewer();
  const tier = effectiveTier(user);
  const mode = resolveMode(searchParams.get("mode"), user);
  const scope = resolveScope(searchParams.get("scope"), user);

  const ctx = await buildContext();
  const analyses = await scanUniverse(ctx, mode, undefined, scope);
  let rows = analyses.map(toScannerRow);

  // Free tier sees a limited universe — the rest is shown locked, never hidden.
  const lockedCount = tier === "free" ? rows.filter((r) => !FREE_TIER_SYMBOLS.includes(r.symbol)).length : 0;
  if (tier === "free") rows = rows.filter((r) => FREE_TIER_SYMBOLS.includes(r.symbol));

  const direction = searchParams.get("direction");
  const minScore = Number(searchParams.get("minScore") ?? 0);
  const assetClass = searchParams.get("class");
  const ma50 = searchParams.get("ma50");
  const structure = searchParams.get("structure");
  const momentum = searchParams.get("momentum");
  const news = searchParams.get("news");
  const eventRisk = searchParams.get("eventRisk");
  const query = (searchParams.get("q") ?? "").trim();

  const matches = (r: ScannerRow) => {
    if (direction && direction !== "any" && r.direction !== direction) return false;
    if (minScore) {
      // A minimum score filter is symmetric: it means "at least this strong",
      // in whichever direction the market is leaning.
      const strength = Math.max(r.score, 100 - r.score);
      if (strength < minScore) return false;
    }
    if (assetClass && assetClass !== "any" && r.assetClass !== assetClass) return false;
    if (ma50 && ma50 !== "any" && r.ma50 !== ma50) return false;
    if (structure && structure !== "any" && r.structure !== structure) return false;
    if (momentum && momentum !== "any" && r.momentum !== momentum) return false;
    if (news && news !== "any" && r.news !== news) return false;
    if (eventRisk && eventRisk !== "any" && r.eventRisk !== eventRisk) return false;
    if (!symbolMatches(query, r.symbol, r.name)) return false;
    return true;
  };

  const filtered = rows.filter(matches).sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));
  recordUsage(user?.id ?? null, "scan", `${filtered.length} results`);

  return ok(
    { rows: filtered, total: rows.length, lockedCount, tier, demo: ctx.demo, generatedAt: Date.now() },
    { headers: CACHE_SHORT },
  );
}
