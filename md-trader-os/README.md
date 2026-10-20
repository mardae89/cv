# MD TRADER OS

**Know the direction. Become the trader.**

Half MD Market Direction, half Becoming OS — built only for forex and futures
traders.

- **Market Direction** — the MD engine, unchanged in how it scores, pointed at
  forex and futures only: all 28 forex pairs, the index futures (NAS100, SPX500,
  US30, US2000, GER40, UK100, JPN225, HK50), metals (gold, silver, copper) and
  energy (WTI, Brent, natural gas). MD Momentum, the Wick Catcher, the scanner,
  the economic calendar, cross-market confirmation, backtesting, alerts,
  watchlists and the AI analyst.
- **Becoming** — the trader's side: a trade journal with real analytics, a
  trading plan the app holds you to, a daily check-in and tilt meter, the Reset
  Room for FOMO and revenge urges, a mindset library, a vision board, a risk
  calculator and a weekly review.

No news, no stocks, no crypto, no sign-in.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No credentials are needed. With no provider keys the app runs in a clearly
labelled **demo data mode**. To get real prices, see **[DEPLOY.md](DEPLOY.md)** —
one OANDA token covers every tradable market in the app.

```bash
npm run build && npm start
npm run typecheck
```

---

## What changed from MD Market Direction

| | MD Market Direction | MD Trader OS |
|---|---|---|
| Markets | 51 — forex, stocks, ETFs, crypto, indices, commodities, bonds | 42 tradable — 28 FX pairs, index futures, metals, energy (+ DXY, VIX, US10Y as reference inputs) |
| News | News page, news score category, headlines | Removed everywhere. Its 15 points of score weight moved to trend, structure and momentum |
| Index names | SPX, NDX, DJI, DAX… | Platform names — NAS100, SPX500, US30, GER40… Searching NQ, US100, ES, YM, GOLD, USOIL etc. finds them |
| Wick Catcher | — | New: entry zones a pullback is likely to wick into |
| Journal | Basic log + win rate | Full journal: checklist, emotions, mistakes, R, pips, P/L, analytics, equity curve, P/L calendar |
| Becoming | — | Today, Trading Plan, Risk Calculator, Reset Room, Mindset Library, Vision Board, Weekly Review |

The economic calendar stays, because event risk is part of the MD score and the
pre-trade checklist asks about high-impact releases.

---

## The Wick Catcher

MD Momentum decides which way. The Wick Catcher decides where. For each market
it builds zones from:

| Level | What it is |
|---|---|
| Wick fill | The 50% of a long rejection wick (1D, 4H, 1H) price has not revisited |
| Previous day / week | The high or low a pullback sweeps for liquidity |
| Swing | Untaken 4H and 1H swing highs/lows, where stops rest |
| 50 EMA | Daily, 4H and 1H — the line the MD strategy is built on |
| Round number | Big and half figures, as confluence only |

Levels within 0.3× the 4H ATR merge into one zone. Buy zones sit below price,
sell zones above; the side that agrees with the weekly + daily bias is "with the
trend" and scores higher. Each zone gets an entry, a stop beyond the wick or
sweep, a 2R target and the nearest opposing liquidity as a second target. Every
number that shapes it is in `WICK_CATCHER` in `src/lib/config/scoring.ts`.

---

## Becoming

Everything here is stored in the visitor's browser (`localStorage`), under keys
prefixed `mdos.`, so it never collides with MD Market Direction on the same
origin. **Settings → Back up my journal & plan** exports it all as one JSON file
and restores it on another device.

- **Today** — morning check-in (mood, sleep, focus, stress, intention),
  pre-session routine, today's trade and loss limits, the tilt meter, your
  focus markets with their live MD score, today's lesson, end-of-day reflection.
- **Trade Journal** — log before you enter (levels, setup grade, checklist,
  emotion, confidence, reasons, screenshot link), close with the exit and/or
  broker P/L. R, pips and outcome are worked out for you. Analytics by plan
  adherence, mistake cost, emotion, setup grade, market, strategy, session, MD
  alignment, weekday and direction; equity curve in R; monthly P/L calendar.
- **Pre-trade guard** — logging a trade that breaks the plan (cool-down active,
  trade limit hit, checklist incomplete, R:R below minimum, no stop, red-flag
  emotion, market not in the plan) lists exactly what is wrong and makes you
  confirm a second time.
- **Trading Plan** — account size, risk per trade, daily loss limit, max
  trades, loss-streak limit, cool-down length, minimum R:R, sessions, markets,
  strategies, the pre-trade checklist, your rules, and why you trade.
- **Tilt meter** — 0–100 from loss streak, loss limit used, trade count, a
  recent loss inside the cool-down, red-flag emotions and the morning check-in.
  Every factor that raises it is named.
- **Reset Room** — cool-down timer, guided questions for FOMO, revenge,
  overtrading, fear and boredom, box breathing, your "why", vision board and
  rules, and a log of urges resisted.
- **Mindset Library** — 15 short lessons and ~70 quotes on FOMO, revenge
  trading, patience, discipline, journaling, risk, losing streaks, process and
  confidence. Almost all quotes are written for the app; the few attributed ones
  are widely published.
- **Risk Calculator** — lots for forex and CFDs (with live pip-value
  conversion into the account currency) and contracts for NQ/MNQ, ES/MES,
  YM/MYM, RTY/M2K, FDAX, NKD, GC/MGC, SI, CL/MCL, NG, HG. Plus an exact
  losing-streak calculator.
- **Vision Board** — images (uploads are downscaled to fit browser storage),
  goals with progress, affirmations.
- **Weekly Review** — the week's numbers from the journal and check-ins beside
  four questions and a discipline grade.

---

## Disclaimer

MD Trader OS provides market analysis and educational information. Directional
scores and wick zones are algorithmic assessments of available market data and
are not guarantees of future performance or investment advice. Forex and futures
are leveraged and can move unexpectedly; users are responsible for their own
trading decisions.
