# Deploying MD Market Direction with live prices

The result is a permanent URL you can open on any device, showing real market
data. Setup is about ten minutes and needs no terminal.

---

## 1. Get a market data key

Create a free account at **[twelvedata.com](https://twelvedata.com/pricing)** and
copy your API key.

The free tier allows **8 requests per minute and 800 per day**. That is not much,
so the app is built around it (see *How the budget is spent* below) — you do not
need a paid plan to get real prices on the markets that matter.

## 2. Import the repo into Vercel

At **[vercel.com/new](https://vercel.com/new)**, import `mardae89/cv`, then set:

| Setting | Value |
|---|---|
| **Root Directory** | `md-market-direction` |
| **Framework Preset** | Next.js (auto-detected) |

If the app is still on a feature branch, set that branch as the Production Branch
under *Settings → Git*, or merge it to `main` first.

## 3. Add environment variables

In the import screen's **Environment Variables** section:

| Name | Value | Why |
|---|---|---|
| `TWELVE_DATA_API_KEY` | your key | **Turns on real prices.** Without it the app runs on demo data. |
| `AUTH_SECRET` | any long random string | Signs session cookies. Required in production. |
| `MD_PUBLIC_MODE` | `true` | Market pages open without a login. |

Optional, to tune cost and coverage:

| Name | Default | Effect |
|---|---|---|
| `MD_LIVE_SYMBOLS` | 12 core markets | Which markets get live data. |
| `MD_API_PER_MINUTE` | `8` | Match your plan's rate limit. |
| `MD_API_PER_DAY` | `800` | Match your plan's daily quota. |
| `MD_INTRADAY_TTL_MS` | `900000` | How long intraday data is cached (15 min). |
| `MD_DAILY_TTL_MS` | `21600000` | How long daily data is cached (6 h). |

## 4. Deploy

Press **Deploy**. When it finishes you get a `*.vercel.app` URL. Open it — the
dashboard loads straight away.

---

## What you should see

The banner at the top tells you the truth about your data, always:

- **“Live data on 12 of 51 markets”** — the key works. The other markets are
  labelled `Demo` individually on every card.
- **“Demo mode”** — no live symbol has successfully returned data yet. This is
  also what you see for the first minute of a fresh deploy while the cache warms.
- **“…request budget reached”** — the plan's quota is spent; the app fell back to
  demo data rather than showing errors. It recovers on its own.

Coverage counts markets that have **actually returned live data**, not markets
you configured. A symbol whose fetch failed still reads as demo.

## How the budget is spent

A naive six-timeframe scan of 51 assets would cost 288 requests per refresh and
burn the daily quota in three page loads. Instead:

- **Two requests per asset, not six.** Only a 5-minute and a daily series are
  fetched; 15M, 1H and 4H are aggregated from the 5-minute series and the weekly
  from the daily one. This also keeps the timeframes mutually consistent, which
  matters because the conflict detector compares them against each other.
- **Quotes are batched** into one request for all symbols.
- **Long cache windows** — 15 minutes intraday, 6 hours for daily bars, because
  a daily bar only changes once a day.
- **A hard budget guard** refuses a call *before* making it once the per-minute
  or per-day limit is reached.

Twelve live symbols cost 24 requests per full refresh, so a normal day sits
comfortably inside 800. A fresh instance warms up over the first couple of page
loads because of the 8-per-minute limit; the banner says `N more warming up`
while that happens.

To cover more markets, either raise `MD_LIVE_SYMBOLS` and the budget together on
a paid plan, or swap the provider — see below.

## Changing data provider

Everything above the provider layer is vendor-agnostic. To use a different feed,
implement `MarketDataProvider` in `src/lib/providers/live/` and register it in
`src/lib/providers/registry.ts`. Implementing the optional `getSeriesBundle`
gives you the two-requests-per-asset economics automatically.

## A note on what has and has not been tested

The engine, the scoring, the caching, the budget guard and the degradation
behaviour are all exercised and verified. The **Twelve Data adapter itself has
never run against the live API** — it is written to their documented REST shapes,
but no credentials existed where it was built. Your first deploy is its first
real test. The two things most likely to need adjusting are the symbol mappings
for indices and commodities (`SYMBOL_MAP` in `twelveData.ts`) and the exact
response shape of a batched quote. If a specific market stays on demo data while
others go live, that mapping is the place to look — *Settings → Data Sources*
shows the provider's last error message verbatim.
