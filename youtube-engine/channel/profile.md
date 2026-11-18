# Channel profile

_Filled in during Stage 0 (`/yt-setup`) and reviewed every quarter. Every stage reads this file, so keep it specific._

_Lines marked **DRAFT** are proposals built from your offers and the code in `md-market-direction/`. Confirm or correct them. **[DATA]** means it was read from the repo._

**Stage 0 status:** interview round 1 of ~3 done · gate not passed yet (see *Still missing* at the end).

## Niche (the root node)

- **Forex and day trading**, taught through one rules-based price-action method, Wick Catching. The MD Market Direction app scans markets for it.

## Core viewer: the one person every video is for

- **Who they are:** DRAFT. A part-time retail trader with a day job, 6–24 months in, trading mostly forex (maybe gold and indices). They've tried strategies from YouTube, are inconsistent or losing, and can spend $197–$3,000 on education.
- **The outcome they want, in their words:** DRAFT, to be replaced with real member quotes: "stop guessing my entries", "be consistent", "know exactly where to get in and where my stop goes".
- **What they're stuck on or afraid of:** DRAFT. They enter too early or chase, get stopped out right before the move, overtrade, and are afraid of blowing an account or a prop-firm challenge.
- **How they describe the problem (search language):** `/yt-research` will confirm this. Seed candidates: "forex strategy", "day trading strategy", "how to find entries", "wick trading", "pullback entry strategy", "fibonacci retracement strategy", "prop firm challenge", "stop getting stopped out".
- **How they watch:** DRAFT. They come for education and will sit through 15–40 minute chart breakdowns. They're highly skeptical of P&L screenshots and hype, because this niche is full of both.

## Awareness level on YouTube (C-15)

These are Eugene Schwartz's levels. Pick the level most of the market is at, and give the evidence.

| Level | The viewer… |
|---|---|
| Unaware | doesn't recognize the problem yet |
| Problem-aware | feels the problem but doesn't know a solution exists |
| Solution-aware | knows the result they want but not that our mechanism or offer delivers it |
| Product-aware | knows our kind of offer but isn't sure it's right for them |
| Most aware | knows us and just needs the next step |

- **Level:** UNKNOWN, research will tell.
- **Hypothesis to test** [ASSUMPTION]: solution-aware. They know the result they want (consistent, rules-based entries) and are shopping for strategies, but they've never heard of Wick Catching. If research confirms this, lead with the result and make the weekly wick the new reason to care.
- **Sophistication** [INFERENCE]: forex YouTube is saturated with strategy claims and unverifiable P&L. Proof by mechanism, meaning rules the viewer can check on their own chart, should beat louder claims.

## Mechanism and angle

- **Our mechanism: Wick Catching** [DATA: `md-market-direction/src/lib/engine/wick.ts`, `src/lib/config/wick.ts`]. Setups are caught on the **weekly** chart and must pass five written rules:
  1. The previous weekly candle closed in the trade direction.
  2. Its body is at least 0.45 × ATR(14), so weak candles and dojis are out.
  3. Price is on the right side of the 50 EMA.
  4. The market is trending: the 50 EMA slopes the trade's way and ADX(14) is above 15.
  5. At least 3 of the last 5 closed candles closed in the trade direction.

  The pullback zone is 0.382–0.75 of the previous candle. A body close beyond 0.75 invalidates the setup. If price runs more than 0.25 of the candle's range past its extreme before pulling back, the setup is void. The pullback is read on the daily, and the entry is timed down the ladder: 4H → 1H → 15M → 5M.
- **The outcome it's presented through:** DRAFT. Knowing where and when to enter, with rules you can check instead of guessing.
- **Bridge for "day trading" searches** [INFERENCE, test in research]: day traders want intraday entries that work. Our mechanism is the weekly candle's pullback zone, timed down to the 15M/5M. One angle: "the weekly wick tells you where to day trade."
- **Why it's different from the outliers:** to fill after research. Candidates:
  - every rule is written down and can be verified on the chart
  - the app checks those rules on every market and shows pass/fail for each, never a buy or sell signal

## Authority statement: the Proof, nailed once and reused (C-31)

> **Recommended (B), pending your real numbers:** "I trade one setup — the weekly wick — with five written rules. I built a scanner that checks those rules on every market each week, and I've taught it to [N] traders over [X] years."

- **A · Results:** "I've traded forex for [X] years, [verified result: e.g. third-party-verified track record or prop-firm payouts], and taught [N] traders the Wick Catching method."
- **B · Builder + method:** as above.
- **C · Transparency:** "Every setup I show you passes five written rules you can check on your own chart. No signals, no hidden indicators, no P&L screenshots you can't verify."

## Offer and funnel

| Step | Offer | Price | Role |
|---|---|---|---|
| Lead | Free Skool community | Free | The CTA from most videos; counts as a *lead* in `data/metrics.csv` |
| Front end | Wick Catching course | $197 one-time | First purchase |
| Core | Mentorship | $1,500 / 6 weeks | High-ticket |
| Upsell | Extended mentorship | $3,000 / 3 months | High-ticket |
| Bundle | MD Market Direction app | Included with the paid community | ⚠ Conflicts with the free community above; see *Open decisions* |

**Open decisions on the offer:**
- The table says the app comes with the *paid* community, but the community listed is free. Is there a paid Skool tier, or does "paid" mean course or mentorship buyers?
- The app is currently open to anyone with the link, with full Elite access and no sign-in [DATA: `md-market-direction/src/lib/auth/public.ts`]. It is either a free top-of-funnel tool, which makes it a strong CTA (C-42, C-43), or a paid perk, which means adding access control.
- Pro ($19.99/mo) and Elite ($49.99/mo) tiers exist in the code [DATA: `src/lib/config/tiers.ts`]. Are they sold separately?

**Lesson-extension assets (C-43):** DRAFT
- **Wick Catching checklist:** the five rules on one page, to run before every trade. An opt-in delivered inside the free community.
- **This week's setups:** the markets currently passing the rules, from the app, posted in the community every week.
- **The app itself,** if it stays free (see the open decisions above).

**Product inside a story (C-42):** the app's Wick Catching scanner. It removes a real constraint: checking five rules across dozens of markets every week by hand. Because it shows pass/fail for each rule, it teaches the method instead of replacing it.

**Funnel mapping in `data/metrics.csv`** (proposed, pending how the mentorship is sold):
- **leads:** new free Skool members from the video
- **calls:** mentorship calls or applications
- **customers:** mentorship clients
- **revenue:** everything that video's members bought (course + mentorship)

Note course buyers in the video's `video.md`.

**Funnel targets:** not set yet (`data/targets.json`).

### Per-video tracking (proposed)

1. **Short link per video** on a domain you control, such as `<your-domain>/yt/<NNN>`. It redirects to the Skool invite with `?utm_source=youtube&utm_medium=video&utm_campaign=<slug>`. The redirect counts clicks per video even if Skool doesn't keep the UTM tags.
2. **Join question in Skool,** if your group uses membership questions: "Which YouTube video sent you here?" The answer is self-reported, but it attributes members to videos.
3. **Course checkout and mentorship booking or application:** carry the same `utm_campaign=<slug>` and add a "Which video?" field.
4. **CRM field:** "Source video" holds the video's slug (e.g. `003`), set at first touch and never overwritten.
5. **Optional:** the app could record `?ref=yt-<NNN>` on first visit. That's a small change in `md-market-direction/`.

## Execution team (C-54)

- **Editor:** unknown (round 2)
- **Thumbnail designer:** unknown (round 2)
- **Research (VA or AI):** the engine (`yt.py research`) once there's an API key; otherwise a VA following the manual procedure in `PIPELINE.md`

## Off-limits topics (C-02)

DRAFT. Each of these attracts a viewer who won't buy a method course or mentorship:
- Get-rich-quick and lifestyle content: "$100 to $10K", "how much I made this week", cars
- Signals, copy trading, "what I'm buying this week"
- Trading bots, EAs, "set and forget"
- Memecoin and crypto pump picks
- Stock picks, long-term investing, options income
- Broker bonuses and affiliate promos

## Guardrails: hard limits that override every rule and format

- **No income, return or win-rate promises** in titles, thumbnails or hooks ("make $500 a day", "never lose", "guaranteed"). Promise skills and process instead ("know exactly where to enter"). TF-01 works for a skill ("spot the weekly wick so fast it feels like cheating") but never for money.
- **Never show P&L, account screenshots or student results you can't verify.** Show losing trades too.
- **Every video** carries "educational, not financial advice, trading involves risk" in the description, and says it out loud whenever results are shown.
- **Testimonials** are used only with permission, and with a note that results vary.
- **Setups are "setups matching the method,"** never buy or sell signals. This is the same wording the app uses.
- **This isn't legal advice.** Rules on paid trading education, signals and mentorship differ by country (e.g. CFTC/NFA in the US, the FCA in the UK). Check with a professional, especially for anything that tells members what to trade.

## Still missing (Stage 0 gate)

- [ ] Core viewer confirmed in one sentence, plus 3–5 real member quotes for their words
- [ ] Offer conflicts resolved: paid community, app access, app tiers
- [ ] How the course and the mentorship are sold (checkout, call, DM or application), which fixes the funnel mapping
- [ ] Authority statement chosen, with real numbers
- [ ] Per-video tracking working end to end (short link → Skool → purchase)
- [ ] Funnel numbers for `data/targets.json`, if known
- [ ] Execution team: editor and thumbnail designer
