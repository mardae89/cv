# Deploying MD Trader OS with live prices

About ten minutes, no terminal. The result is a permanent URL you can open on
any device.

---

## 1. Choose where real prices come from

**No setup at all:** deploy as-is. With no token set, the app reads real prices
for every market from Yahoo Finance's public chart data. Indices, metals and
energy come from their futures contracts (NQ=F, ES=F, GC=F, CL=F …), which track
the CFDs closely but not exactly — gold futures sit a few dollars from spot. It
is an unofficial, personal-use feed: fine for building and filming, but switch to
a feed licensed for redistribution before charging subscribers.

**Your broker's own prices (recommended):** add an OANDA token, below. Where
OANDA covers a market it takes priority over the free feed.

### Get an OANDA token

OANDA returns *your broker's own prices*, and it carries every tradable market
in this app: all 28 forex pairs, the index futures, gold, silver, copper, oil and
natural gas.

> OANDA → **Manage API Access** → **Generate** a personal access token. Copy it.
> No account ID is needed. Note whether the account is *practice* or *live*.

**Optional:** a free **[Twelve Data](https://twelvedata.com/pricing)** key adds
live data for the three reference markets OANDA does not have — the dollar
index, VIX and the US 10-year yield. Without it those three stay on labelled
demo data, which only affects the cross-market and regime reads.

## 2. Import the repo into Vercel

At **[vercel.com/new](https://vercel.com/new)**, import `mardae89/cv` as a **new
project** (separate from MD Market Direction), then set:

| Setting | Value |
|---|---|
| **Root Directory** | `md-trader-os` |
| **Framework Preset** | Next.js (auto-detected) |

If the app is still on a feature branch, set that branch as the Production Branch
under *Settings → Git*, or merge it to `main` first.

## 3. Add environment variables

| Name | Value | Why |
|---|---|---|
| `OANDA_API_TOKEN` | your OANDA token | **Turns on real prices** for all 42 tradable markets. |
| `OANDA_ENVIRONMENT` | `practice` or `live` | Must match the account the token came from. |
| `AUTH_SECRET` | any long random string | Required in production. |
| `MD_PUBLIC_MODE` | `true` | Pages open without a login. |
| `TWELVE_DATA_API_KEY` | *(optional)* | Live DXY, VIX and US10Y from a metered feed. |
| `MD_FREE_DATA` | *(optional)* `off` | Turns the no-key Yahoo Finance feed off. |
| `MD_LIVE_SYMBOLS` | `DXY,VIX,US10Y` | *(only with Twelve Data)* which markets it serves. |
| `FMP_API_KEY` | *(optional)* | Real economic calendar instead of demo events. |
| `ANTHROPIC_API_KEY` | *(optional)* | AI Analyst answers in prose instead of the built-in explainer. |

## 4. Deploy

Press **Deploy**. Open the `*.vercel.app` URL — the dashboard loads straight away.

---

## What you should see

The banner at the top always states the truth about the data:

- **"Live data on N of 45 markets"** — the token works. Anything not live is
  labelled `Demo` on its own card.
- **"Demo mode"** — no live symbol has returned data yet. Also what you see for
  the first minute of a fresh deploy while the cache warms.

## Your data

The journal, plan, check-ins, vision board and reviews are stored in each
visitor's own browser. Nothing personal is sent to the server. Use **Settings →
Back up my journal & plan** to download a copy, and restore it on another
device.

## Not tested against live APIs

The OANDA and Twelve Data adapters are written to the vendors' documented REST
shapes and carried over from MD Market Direction. They have not been run against
the live APIs from this build, because no credentials exist where it was built.
If one market stays on demo data while others go live, the symbol mapping is the
place to look — `NON_FX_INSTRUMENTS` in `src/lib/providers/live/oanda.ts` — and
*Settings → Data Sources* shows the provider's last error verbatim.
