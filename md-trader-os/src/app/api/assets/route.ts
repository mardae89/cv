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

  // An exact alias ("NQ", "USOIL") the substring search missed still resolves.
  if (q && list.length === 0) {
    const known = resolveAsset(q);
    if (known) list = [known];
  }

  return ok(
    {
      groups: GROUPS,
      assets: list.map((a) => ({
        symbol: a.symbol, name: a.name, assetClass: a.assetClass, group: a.group,
        aliases: a.aliases, precision: a.precision,
      })),
    },
    { headers: CACHE_MEDIUM },
  );
}
