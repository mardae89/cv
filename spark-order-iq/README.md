# Spark Order IQ

Decision support for Walmart Spark drivers. Screenshot an offer, get **TAKE**,
**CONSIDER** or **SKIP** against your own rules, and watch the day's goal move.

The whole loop is meant to take a few seconds:

```
see offer → screenshot → analyze → TAKE / CONSIDER / SKIP → run it → log it → goal moves
```

## What it is not

It is not an order grabber. It does not connect to Walmart Spark, log in,
scrape anything, or accept or decline an offer for you. It reads only the
screenshot you hand it, and every accept-or-decline stays yours. It is not
affiliated with Walmart.

Every figure it shows — $/mile, hourly, vehicle cost, profit, projected finish —
is an **estimate** built from numbers you supplied plus thresholds you set.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # scoring, parsing and stats
npm run typecheck
npm run build
npm run deploy     # build into ../docs/spark-order-iq for GitHub Pages
```

It installs as a PWA: open it on your phone and use "Add to Home Screen".

## How a decision is made

`src/lib/scoring.ts` holds the whole engine, with no React or storage in it:

```ts
evaluateOrder(input, settings, dailyProgress) → {
  decision, score, economics, components, checks, goalImpact, reasons, warnings, unknowns
}
```

1. **Total miles** = offer miles + your drive to the store. The deadhead leg is
   never ignored, and it is labelled an estimate, not GPS mileage.
2. **Economics** — $/total mile, estimated hourly (with the drive to the store
   folded into the time, if you want it there), vehicle cost at your own cost
   per mile, and estimated profit.
3. **Your rules** — seven thresholds, each switchable. A rule you switch off
   never blocks a decision, though its value still acts as a benchmark for the
   score.
4. **Score** out of 100 across pay, distance, hourly, complexity and goal
   progress, with weights you control.
5. **Decision**: two or more broken rules is a SKIP. One broken rule is a SKIP
   unless it misses by a hair and the rest of the offer is strong. No broken
   rules and a high score is a TAKE — unless a rule couldn't be checked at all,
   which holds it at CONSIDER rather than overpromising on data it never saw.

Goal progress is one factor among five, and it can never promote a rules-failing
offer to TAKE. A mediocre $15 order stays mediocre when you're $15 from your
goal; the goal card just tells you what it would do to the day.

## Reading a screenshot

`analyzeOfferScreenshot(image, providerId, options)` in `src/lib/vision/` is the
only entry point the UI knows about. Three providers sit behind it:

| Provider | What it does |
|---|---|
| `local-ocr` (default) | tesseract.js on the device. No key, nothing uploaded. The engine is fetched from a CDN on first use, then cached. |
| `claude-vision` | Claude reads the image, using an API key you supply. More accurate; the screenshot does leave the device. |
| `manual` | No reading at all — straight to the form. |

Adding a fourth provider is a file in `src/lib/vision/providers/` and a line in
the registry. No screen changes.

A field that wasn't clearly visible comes back `null` with no confidence score,
and the UI marks it **needs confirmation**. Nothing is ever guessed. If reading
fails outright you land on the same form with the same fields, and the analysis
still works.

## Privacy

Screenshots are held in memory and dropped as soon as they've been read (there
is a setting to keep the preview around during the session; either way nothing
is written to storage). What persists is the structured numbers, in
`localStorage` on your device. No account, no server, no sync. Settings has
export, import and delete-everything.

## Layout

```
src/
  lib/
    scoring.ts     evaluateOrder — decisions, score, economics
    stats.ts       daily progress, pace projection, history aggregations
    settings.ts    defaults and rule metadata
    storage.ts     localStorage persistence, export/import
    geo.ts         haversine + the browser geolocation wrapper
    demo.ts        sample offers and sample history
    vision/        analyzeOfferScreenshot + pluggable providers + OCR parsing
  state/store.tsx  settings and orders, persisted
  components/      primitives, nav, result view, pickup distance, earnings sheet
  screens/         Home, Analyze, History, Stats, Settings
```

Tests cover the parts where being wrong would cost the driver money: the
economics, the decision boundaries, the goal maths, the OCR parser, and the
history aggregations.
