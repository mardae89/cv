import { buildContext } from "@/lib/engine/context";
import { trendBias } from "@/lib/engine/crossMarket";
import { ASSETS, getAsset } from "@/lib/data/universe";
import { CACHE_SHORT, fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAP_SYMBOLS = ["DXY", "XAU/USD", "US10Y", "SPX", "NDX", "WTI", "BTC/USD", "VIX", "EUR/USD", "USD/JPY", "COPPER", "XAG/USD"];

/** The relationship graph behind the Cross-Market Map. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const focus = searchParams.get("symbol");
  const ctx = await buildContext();

  if (focus) {
    const asset = getAsset(focus);
    if (!asset) return fail("Unknown symbol.", 404);
    const links = [];
    for (const link of asset.related) {
      const bias = await trendBias(ctx, link.symbol);
      const related = getAsset(link.symbol);
      links.push({
        symbol: link.symbol,
        name: related?.name ?? link.symbol,
        label: link.label,
        sign: link.sign,
        weight: link.weight,
        bias,
        confirmation: bias == null ? null : bias * link.sign,
      });
    }
    // Markets that point BACK at this one — the relationship graph is directed
    // in the data, but users think about it both ways.
    const inbound = ASSETS.filter((a) => a.related.some((r) => r.symbol === asset.symbol) && a.symbol !== asset.symbol)
      .map((a) => {
        const rel = a.related.find((r) => r.symbol === asset.symbol)!;
        return { symbol: a.symbol, name: a.name, label: rel.label, sign: rel.sign };
      })
      .slice(0, 10);
    return ok({ symbol: asset.symbol, name: asset.name, links, inbound }, { headers: CACHE_SHORT });
  }

  const nodes = [];
  for (const symbol of MAP_SYMBOLS) {
    const asset = getAsset(symbol);
    if (!asset) continue;
    const bias = await trendBias(ctx, symbol);
    nodes.push({ symbol, name: asset.name, group: asset.group, bias });
  }
  const edges = MAP_SYMBOLS.flatMap((symbol) => {
    const asset = getAsset(symbol);
    if (!asset) return [];
    return asset.related
      .filter((r) => MAP_SYMBOLS.includes(r.symbol))
      .map((r) => ({ from: symbol, to: r.symbol, sign: r.sign, weight: r.weight, label: r.label }));
  });

  return ok({ nodes, edges, demo: ctx.demo }, { headers: CACHE_SHORT });
}
