import { buildContext } from "@/lib/engine/context";
import { CACHE_SHORT, fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!symbols.length) return fail("Provide ?symbols=EUR/USD,XAU/USD");
  if (symbols.length > 50) return fail("Maximum 50 symbols per request.");
  const ctx = await buildContext();
  const quotes = await Promise.all(symbols.map((s) => ctx.quote(s)));
  return ok({ quotes: quotes.filter(Boolean), demo: ctx.demo, generatedAt: Date.now() }, { headers: CACHE_SHORT });
}
