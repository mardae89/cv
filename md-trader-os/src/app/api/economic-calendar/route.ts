import { buildContext } from "@/lib/engine/context";
import { ASSETS } from "@/lib/data/universe";
import { CACHE_MEDIUM, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const importance = searchParams.get("importance");
  const currency = searchParams.get("currency");
  const days = Math.min(Number(searchParams.get("days") ?? 14), 30);

  const ctx = await buildContext();
  let events = ctx.events.filter((e) => e.time <= ctx.now + days * 86_400_000 && e.time >= ctx.now - 3 * 86_400_000);
  if (importance && importance !== "any") events = events.filter((e) => e.importance === importance);
  if (currency && currency !== "any") events = events.filter((e) => e.currency === currency);

  // Which markets each event is likely to matter to — derived from the same
  // eventTags the event-risk engine uses, so the calendar and the score agree.
  const withAssets = events.map((e) => ({
    ...e,
    affected: ASSETS.filter(
      (a) => a.eventTags.some((t) => e.tags.includes(t)) || (a.currencies ?? []).includes(e.currency),
    )
      .slice(0, 8)
      .map((a) => a.symbol),
  }));

  return ok(
    { events: withAssets, currencies: Array.from(new Set(ctx.events.map((e) => e.currency))).sort(), demo: ctx.demo },
    { headers: CACHE_MEDIUM },
  );
}
