import { buildContext } from "@/lib/engine/context";
import { requireFeature } from "@/lib/auth/guard";
import type { NewsCategory } from "@/lib/types";
import { CACHE_MEDIUM, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // The full news feed and its market mapping are part of News Intelligence.
  // Headline teasers still reach every user through the daily brief.
  const auth = await requireFeature("news.intelligence");
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") as NewsCategory | null;
  const impact = searchParams.get("impact");
  const symbol = searchParams.get("symbol");
  const limit = Math.min(Number(searchParams.get("limit") ?? 60), 200);

  const ctx = await buildContext();
  let articles = ctx.news;
  if (category && category !== ("all" as NewsCategory)) articles = articles.filter((a) => a.category === category);
  if (impact && impact !== "any") articles = articles.filter((a) => a.impact === impact);
  if (symbol) articles = articles.filter((a) => a.symbols.includes(symbol.toUpperCase()));

  return ok({ articles: articles.slice(0, limit), demo: ctx.demo, generatedAt: Date.now() }, { headers: CACHE_MEDIUM });
}
