# Deploying MD Market Direction with live prices

The result is a permanent URL you can open on any device, showing real market
data. Setup is about ten minutes and needs no terminal.

---

## 1. Get a market data token

**If you trade with OANDA — use OANDA.** It returns *your broker's own prices*,
so the app matches the charts you are already looking at, rather than being
close-ish. It covers forex, metals, indices and commodities: 27 of the 51
markets, and the ones a discretionary trader actually watches.

> OANDA → **Manage API Access** → **Generate** a personal access token. Copy it.
> No account ID is needed. Note whether the account is *practice* or *live*.

**Otherwise, or to also cover stocks and crypto:** create a free account at
**[twelvedata.com](https://twelvedata.com/pricing)** and copy the API key. Its
free tier allows 8 requests/minute and 800/day, so the app restricts it to a
shortlist (see *How the budget is spent*).

You can use both. Each symbol is routed to whichever provider covers it, and
anything neither covers stays on clearly-labelled demo data.

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
| `OANDA_API_TOKEN` | your OANDA token | **Turns on real prices** for forex, metals, indices, commodities. |
| `OANDA_ENVIRONMENT` | `practice` or `live` | Must match the account the token came from. |
| `AUTH_SECRET` | any long random string | Signs session cookies. Required in production. |
| `MD_PUBLIC_MODE` | `true` | Market pages open without a login. |
| `TWELVE_DATA_API_KEY` | *(optional)* | Adds live stocks, crypto, DXY and yields. |

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

## What OANDA deliberately does not map

A wrong mapping is worse than none, so these fall through to Twelve Data or demo
rather than being guessed:

- **US10Y / US02Y** — this app treats these as *yields*. OANDA's `USB10Y_USD` is
  a bond *price*, which moves inversely. Mapping them would silently invert every
  cross-market relationship that depends on yields.
- **DXY, VIX** — OANDA has no equivalent instrument.
- **Individual stocks and crypto** — not offered, or region-dependent.

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
