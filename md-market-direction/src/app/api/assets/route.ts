import { ASSETS, GROUPS, resolveAsset, searchAssets } from "@/lib/data/universe";
import { CACHE_MEDIUM, ok } from "@/lib/api";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const group = searchParams.get("group");
  const cls = searchParams.get("class");

  let list = q ? searchAssets(q, 40) : ASSETS;
  if (group) list = list.filter((a) => a.group === group);
  if (cls) list = list.filter((a) => a.assetClass === cls);

  // A searched ticker that is not in the curated universe is still analysable.
  if (q && list.length === 0) {
    const synth = resolveAsset(q);
    if (synth) list = [synth];
  }

  return ok(
    {
      groups: GROUPS,
      assets: list.map((a) => ({
        symbol: a.symbol, name: a.name, assetClass: a.assetClass, group: a.group,
        sector: a.sector ?? null, precision: a.precision,
      })),
    },
    { headers: CACHE_MEDIUM },
  );
}
