/**
 * THE API, IN THE BROWSER.
 *
 * The deployed app's pages fetch /api/… from its server. Here the same route
 * handlers run in the page instead: the engine, the demo data generator and
 * the scoring are the app's own code, imported unchanged. Only the store,
 * cookies and crypto are swapped for in-memory stand-ins (see build.mjs).
 */
import * as adminOverview from "@/app/api/admin/overview/route";
import * as ai from "@/app/api/ai/route";
import * as alerts from "@/app/api/alerts/route";
import * as alertById from "@/app/api/alerts/[id]/route";
import * as assets from "@/app/api/assets/route";
import * as backtest from "@/app/api/backtest/route";
import * as brief from "@/app/api/brief/route";
import * as candles from "@/app/api/candles/route";
import * as crossMarket from "@/app/api/cross-market/route";
import * as calendar from "@/app/api/economic-calendar/route";
import * as marketAnalysis from "@/app/api/market-analysis/route";
import * as marketScore from "@/app/api/market-score/route";
import * as momentum from "@/app/api/momentum/route";
import * as quotes from "@/app/api/quotes/route";
import * as scanner from "@/app/api/scanner/route";
import * as status from "@/app/api/status/route";
import * as subscription from "@/app/api/subscription/route";
import * as user from "@/app/api/user/route";
import * as watchlists from "@/app/api/watchlists/route";
import * as watchlistById from "@/app/api/watchlists/[id]/route";
import * as wickCatcher from "@/app/api/wick-catcher/route";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;
// Dynamic routes type their params as { id }; the dispatcher always supplies the matched groups.
type RouteModule = Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", Handler>>;

const ROUTES: [RegExp, RouteModule][] = [
  [/^\/api\/admin\/overview$/, adminOverview as RouteModule],
  [/^\/api\/ai$/, ai as RouteModule],
  [/^\/api\/alerts$/, alerts as RouteModule],
  [/^\/api\/alerts\/(?<id>[^/]+)$/, alertById as unknown as RouteModule],
  [/^\/api\/assets$/, assets as RouteModule],
  [/^\/api\/backtest$/, backtest as RouteModule],
  [/^\/api\/brief$/, brief as RouteModule],
  [/^\/api\/candles$/, candles as RouteModule],
  [/^\/api\/cross-market$/, crossMarket as RouteModule],
  [/^\/api\/economic-calendar$/, calendar as RouteModule],
  [/^\/api\/market-analysis$/, marketAnalysis as RouteModule],
  [/^\/api\/market-score$/, marketScore as RouteModule],
  [/^\/api\/momentum$/, momentum as RouteModule],
  [/^\/api\/quotes$/, quotes as RouteModule],
  [/^\/api\/scanner$/, scanner as RouteModule],
  [/^\/api\/status$/, status as RouteModule],
  [/^\/api\/subscription$/, subscription as RouteModule],
  [/^\/api\/user$/, user as RouteModule],
  [/^\/api\/watchlists$/, watchlists as RouteModule],
  [/^\/api\/watchlists\/(?<id>[^/]+)$/, watchlistById as unknown as RouteModule],
  [/^\/api\/wick-catcher$/, wickCatcher as RouteModule],
];

const ORIGIN = "https://preview.local";

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export function installApi() {
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, ORIGIN);
    if (url.origin !== ORIGIN || !url.pathname.startsWith("/api/")) return realFetch(input, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() as keyof RouteModule;
    for (const [pattern, mod] of ROUTES) {
      const m = url.pathname.match(pattern);
      if (!m) continue;
      const handler = mod[method];
      if (!handler) return json({ error: `${method} is not supported here.` }, 405);
      // Let the page paint its loading state before the engine takes the thread.
      await new Promise((r) => setTimeout(r, 0));
      const req = new Request(ORIGIN + url.pathname + url.search, { method, headers: init?.headers, body: init?.body });
      try {
        return await handler(req, { params: Promise.resolve({ ...(m.groups ?? {}) }) });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Request failed." }, 500);
      }
    }
    return json({ error: "Not found." }, 404);
  };
}
