# MD MARKET DIRECTION

**Know the Direction. Understand the Why.**

An AI-powered multi-market analysis platform. It reads price structure, momentum,
news, macro conditions, cross-market relationships and event risk across forex,
gold, silver, stocks, ETFs, US and international indices, crypto, commodities and
rates — and produces one transparent directional bias per market, with the
evidence that produced it.

The product is **not** a prediction engine. It never states a probability, never
says a market "will" do anything, and never hides why a score is what it is.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No credentials are required. With no provider keys the app starts in **DEMO DATA
MODE** — clearly labelled synthetic data, never presented as live prices. Copy
`.env.example` to `.env.local` to connect real providers.

### Deploy it with real prices

**[DEPLOY.md](DEPLOY.md)** walks through a Vercel deploy with live market data —
about ten minutes, no terminal. One key (`TWELVE_DATA_API_KEY`) turns real prices
on; the app is engineered around a free tier's 800-requests-per-day limit by
fetching two series per asset and deriving the other four timeframes.

The first account created becomes the instance **admin** and is given Elite
access, so you can see every feature immediately.

```bash
npm run build && npm start   # production build
npm run typecheck            # strict TypeScript, zero errors
```

---

## The MD Direction Score

Seven evidence categories, each producing a signed strength in −1..+1:

| Category | Weight | What it reads |
|---|---|---|
| Technical Trend | 20 | Price vs 50/200 MA, MA slopes, extension, volatility |
| Market Structure | 20 | HH/HL/LH/LL, break of structure, change of character, consolidation |
| Momentum | 15 | RSI, MACD histogram, rate of change, relative volume |
| News | 15 | Theme-classified stories mapped onto this asset's news betas |
| Macro | 15 | Dollar, real yields, risk appetite, inflation, growth, rate expectations |
| Cross-Market | 10 | Directional confirmation from related markets |
| Event Risk | 5 | Scheduled releases this asset is actually exposed to |

```
score = 50 + (Σ strength × weight) / 2
```

so a market with **no** directional evidence sits at 50 ("Mixed / Neutral") and
perfect alignment reaches 0 or 100. Weights live in `src/lib/config/scoring.ts`
and are fully configurable.

Three details that make the number trustworthy:

- **Event risk pulls toward neutral**, not bearish. A binary event can resolve
  either way, so it removes conviction from whichever direction the rest of the
  evidence points.
- **Conflict detection.** If higher and lower timeframes disagree — or if the
  higher timeframes disagree *with each other* — the market is reported `MIXED`,
  the score is pulled toward neutral, and the disagreement is named in plain
  English.
- **Evidence quality is separate from the score.** A score of 84 backed by 4/7
  categories is not the same claim as 84 backed by 7/7, and the UI says so.

### Calibration

The categories do not naturally share a scale: trend and structure swing near ±1
when a market trends, while news, macro and cross-market are weighted *averages*
of signed inputs and rarely exceed ~0.4 raw. Each is therefore passed through a
signed power curve, `sign(s)·|s|^p`, which is monotonic and fixes 0→0 and ±1→±1,
so it can never change a category's direction or manufacture conviction at the
extremes. See `CATEGORY_CALIBRATION`.

---

## Architecture

```
src/lib/
  config/      weights, score bands, trading modes, MD Momentum rules, tiers
  data/        asset universe (macro betas, news betas, relationships) + demo generators
  providers/   MarketData / News / Calendar / Fundamentals / Macro interfaces
               demo/  deterministic, always flagged demo:true
               live/  Twelve Data, NewsAPI, FMP adapters
  engine/      indicators → structure → technical → news → macro → crossMarket
               → eventRisk → score → narrative → analyze
               plus market (global direction + regime), mdMomentum, backtest,
               alerts, brief, journal
  ai/          vendor-agnostic LLM abstraction, news classification, the analyst
  db/          store interface + JSON implementation (Prisma schema = prod target)
  auth/        scrypt + JWT sessions, feature gates, rate limiting
  billing/     Stripe checkout + webhook entitlements
```

Nothing above the provider layer knows where data comes from. Adding a licensed
vendor means implementing an interface and registering it — no engine or UI
change. Every live call is wrapped so a provider failure **degrades to demo data
and says so** rather than taking the dashboard down.

### API

`/api/` — `assets`, `quotes`, `candles`, `market-analysis`, `market-score`,
`scanner`, `news`, `news/sentiment`, `economic-calendar`, `cross-market`,
`momentum`, `brief`, `alerts`, `watchlists`, `journal`, `backtest`, `ai`,
`subscription` (+ `subscription/webhook`), `user`, `auth/*`, `admin/overview`,
`status`.

---

## Pages

Landing · Onboarding · Dashboard · Markets · Market Detail · Scanner ·
News Intelligence · Economic Calendar · Alerts · Watchlists · AI Analyst ·
MD Momentum · Cross-Market Map · Backtesting · Journal · Settings ·
Subscription · Admin.

Mobile-first throughout: bottom navigation on phones, a fixed rail on desktop.

---

## Things that are deliberately honest

- **Demo data is never dressed up as live data.** The banner reports live
  coverage per market, counting only symbols that have *actually returned* live
  data — not symbols merely configured for it — and every card carries its own
  `Live` or `Demo` label.
- **A metered plan degrades honestly.** A request budget refuses calls before
  making them, so an exhausted quota falls back to demo data with an explanation
  instead of a wall of rate-limit errors.
- **Missing data is reported as missing.** The engine marks a category
  unavailable rather than inventing a reading — including when live news arrives
  with no LLM configured to classify it.
- **The AI Analyst answers only from the structured analysis** the engine
  produced, handed to the model as a context block with strict house rules. With
  no LLM key the same facts are rendered by a deterministic explainer, so the
  feature still works and still invents nothing.
- **Backtests state their own limits.** Historical scores replay only the
  price-derived categories (news, macro and event history are not stored), and
  the UI says so beside every result.
- **Entitlements are always resolved server-side.** Client-reported subscription
  state is never trusted; Stripe entitlements are written by the signed webhook.

---

## Not yet built (architected for)

Broker integrations, TradingView embedding, automated journal import, portfolio
and options analysis, COT and futures data, social sentiment, scheduled AI daily
reports, Telegram/Discord/SMS alert delivery, native mobile, public API,
white-label. The provider, notification and store abstractions are where these
attach.

---

## Disclaimer

MD Market Direction provides market analysis and educational information.
Directional scores are algorithmic assessments of available market data and are
not guarantees of future performance or investment advice. Markets can move
unexpectedly, and users are responsible for their own trading and investment
decisions.
