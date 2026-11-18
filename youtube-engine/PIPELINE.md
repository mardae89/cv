# Pipeline

The pipeline has ten stages. Each one ends in a **gate**, a pass/fail check, and a video never moves past a gate it failed. Rule IDs like (C-21) point to `RULES.md`.

| # | Stage | Output | Claude Code command |
|---|---|---|---|
| 0 | Setup | `channel/profile.md`, `data/targets.json` | `/yt-setup` |
| 1 | Research | `research/outliers.csv`, `research/demand_map.md`, `library/formats.md` | `/yt-research` |
| 2 | Validate | `video.md` §2 | `/yt-produce` |
| 3 | Package | `video.md` §3 | `/yt-produce` |
| 4 | Hook | `video.md` §4 | `/yt-produce` |
| 5 | Structure | `video.md` §5 | `/yt-produce` |
| 6 | CTA | `video.md` §6 | `/yt-produce` |
| 7 | Preflight & bets | `video.md` §7, `data/videos.csv` | `/yt-produce` |
| none | Publish | `data/videos.csv` (publish date) | none |
| 8 | Review at D2, D7, D28 | `data/metrics.csv`, `video.md` §8 | `/yt-review` |
| 9 | Upgrade | `RULES.md`, `channel/playbook.md`, `library/formats.md`, `research/demand_map.md` | `/yt-upgrade` |

Once a month, run `/yt-monthly` for a review of the whole channel.

---

## 0 · Setup (once, then every quarter)

**Goal:** know exactly who every video is for and how a viewer becomes a customer.

1. Fill in `channel/profile.md`. It covers the niche, the core viewer, the outcome they want in their own words, our mechanism, the awareness level on YouTube, the offer, assets that can extend a lesson and the authority statement.
2. Draft the authority statement. Tighten it until it's one specific line that can be checked (C-31).
3. Set up tracking so every lead can be traced back to a video. Use one link per video (`?utm_source=youtube&utm_medium=video&utm_campaign=<slug>`) and add a "source video" field to the CRM.
4. If you know your funnel targets, put them in `data/targets.json`: leads per 1,000 views, lead → call rate and call → customer rate.
5. List the off-limits topics, meaning subjects that would attract viewers who aren't buyers (C-02).

**Gate:** the core viewer is defined in one sentence · the authority statement is drafted · tracking works end to end for each video.

## 1 · Research: map the demand

**Goal:** know what the core viewer already chooses to watch and which formats win their clicks.

1. **Root node:** start from the niche in `channel/profile.md`.
2. **Seed list:** generate a core list of search terms that covers the whole niche, in the market's own words (C-13). Include problems, desired outcomes, mechanisms, tools, mistakes, comparisons, "how to" phrasings and identity terms. Write it to `research/seeds.txt`.
3. **Depth-first search,** using the engine or a VA (both procedures are below):
   1. Push the seeds onto the stack and pop one.
   2. Search it and push the outliers it turns up.
   3. Explore the first outlier's channel and log every standout video on it.
   4. Go back to the outlier video and check its recommendations.
   5. When a branch stops producing new outliers, pop the next item.

   Repeat until the stack is empty.
4. **Recommendations:** the YouTube API no longer exposes them. For the top outliers, a person opens each video and logs the strong-looking videos in the sidebar, either with `yt.py add <url>` or in `research/manual.csv`.
5. **Demand map:** cluster the outliers by what the viewer *wants*, not by search term. For each cluster, note the outliers, channels, best examples, negative evidence, awareness level and the language viewers respond to. Write it to `research/demand_map.md`.
6. **Format scan:** any framing used by 3+ outliers is a format candidate. For each one:
   - measure its base rate with `yt.py pattern "<regex>"`
   - work out why it works
   - log it in `library/formats.md` with + and − evidence

   Look beyond the niche too. Formats that worked in nearby niches but that nobody here uses are gaps (C-17).
7. **Outside signals:** note the narratives catching on in short-form or in the market (C-18).

**Gate:** every seed has been explored · the demand map has at least 3 clusters with repeated evidence · formats are logged with negative evidence.

### Engine procedure (YouTube Data API)

```bash
python3 youtube-engine/engine/yt.py research                 # crawl seeds.txt depth-first; run again to continue
python3 youtube-engine/engine/yt.py summary                  # outliers per seed + dead branches
python3 youtube-engine/engine/yt.py top --n 50               # best outliers
python3 youtube-engine/engine/yt.py pattern "feels like cheating"   # a format's hit rate: winners AND losers
python3 youtube-engine/engine/yt.py research --query "the new era of" --shallow   # gather more examples of a format
python3 youtube-engine/engine/yt.py add <url> --note "recommended next to <outlier>"
```

### Manual procedure (VA, no API)

1. Use a logged-out or incognito browser so the results aren't personalized.
2. Search the top seed. For each result, open the channel's Videos tab and estimate its typical views, meaning the median of 10–20 recent videos.
3. A result is an outlier if it got at least 3× the channel's typical views and at least 10,000 views. Log it in `research/manual.csv`.
4. Open the first outlier's channel and log every video that got at least 3× its typical views.
5. Go back to the outlier video. Log the recommended videos that are outliers on their own channels, and add their channels to the list.
6. When a branch turns up nothing new, move to the next item. When the list is empty, take the next seed.

`manual.csv` has these columns: `url, title, channel_title, views, channel_typical_views, published, seed, found_via, note`. The engine merges them into `outliers.csv` and into the `pattern` stats.

## 2 · Validate the idea

**Goal:** prove that the core viewer already wants this before anyone writes a title.

1. State the idea as **desire + angle**: the outcome the viewer wants, in their words, plus our mechanism or unique take.
2. Pull demand evidence from `outliers.csv` and `demand_map.md`. List the outliers on this subject with title, channel, views, × and date.
3. Pull negative evidence: similar videos that did poorly, and why.
4. Set the awareness positioning (C-15). Lead with the outcome they already want, and make the mechanism the new reason to care.
5. Run the channel-fit test (C-02) and check the off-limits list in the profile.
6. Identify the business path: what natural next step will this video create? This previews Stage 6.
7. Work out how ours beats the existing outliers (C-04): a better mechanism, proof, completeness or format.
8. If demand is weak, change the subject or connect it to a desire that already has demand (C-16). Then run this stage again.

**Gate:** ≥ 3 outliers across ≥ 2 channels, with one from the last 12 months · core-viewer fit · a natural next step exists · a reason ours beats the existing winners.

## 3 · Package

**Goal:** one promise that the right viewer picks over everything else on their feed, at a single glance.

1. Shortlist 3–5 formats from `library/formats.md` and from research. Prefer formats with a high base rate that nobody in our niche has used yet.
2. For each format, write down:
   - the desire it serves
   - the lever: speed, unfair advantage, curiosity gap, fear of missing key knowledge, urgency of a shift, proof of volume, and so on
   - how well it fits the audience
   - its base rate, with negative evidence
   - the execution it demands (C-21, C-22, C-34)
3. Write 10+ titles across the shortlisted formats and pick the top 3.
4. Design the thumbnail as a single-glance read (C-23). Plan:
   - what the eye hits first
   - a few words of text at most
   - the "this is for me" signal
   - an authority cue
   - contrast

   The thumbnail shows and the title pins it down (C-20).
5. Run the breadth check (C-24). Keep broadening until the core viewer would start to doubt it's for them, then step back one notch.
6. Run the feed test (C-25). Put the mockup in a grid with 10–20 real videos it will compete with, taken from search results and the home feed for the topic. Ask 3+ people from the target market which one they'd click and why. Revise until it wins.

**Gate:** the feed test says yes to "At a single glance, does the right viewer get a clear reason to pick this over everything else on their feed?" · the format's negative evidence has been reviewed · the execution requirements are noted for Stage 5.

## 4 · Hook: Promise, Proof, Plan

**Goal:** by the end of the opening, the viewer knows they picked the right video, trusts you on the topic and commits to watching.

1. **Promise:** restate exactly what the title and thumbnail promised, with the same words and the same outcome.
2. **Proof:** the authority statement, tailored to this topic (C-31), with specific numbers, results or credentials.
3. **Plan:** where the video goes. For long videos, list everything it covers so viewers feel safe committing (C-32).
4. Write the exact words and read them out loud.

**Gate:** the promise mirrors the packaging · the proof is specific and relevant · the plan gives a reason to watch to the end.

## 5 · Structure and delivery

**Goal:** a video that delivers more than exactly what it promised.

1. **Execution format:** what did the outliers behind this idea actually do? Look at the number of points and whether they were raw or polished, used a whiteboard, a screen recording or a challenge (C-34). Match it, or explain why not.
2. **Script mode** (C-35): choose a full script or a beat structure that leaves room to think, and say why.
3. **Beats:** each section pays off part of the promise. Use open loops only where they serve the viewer.
4. **Over-delivery:** list three specific ways the video beats the expectation the packaging set (C-01).
5. **Visuals:** each one must clarify, prove or help the viewer follow (C-36).
6. **Editor brief:** say what to remove (friction, dead air, repetition) and what not to add (decoration).

**Gate:** the execution matches the expectation the packaging set · there's a plan for over-delivering · the editor brief is written.

## 6 · CTA: the most useful next step

**Goal:** turn satisfied viewers into leads without making them any less satisfied.

1. Ask what the viewer needs next after this lesson.
2. Pick the type of CTA:
   - **Product in the story** (C-42): the product removes a real constraint that the video itself runs into.
   - **Lesson extension** (C-43): an asset that helps them act on the lesson, such as a template, library, scorecard or checklist, in exchange for their email.
   - **None:** if nothing passes the test, go without. A satisfied viewer is still worth it.
3. Run the unbiased-expert test (C-41).
4. Place the CTA where the need peaks, usually right after the lesson creates it, and give one clear next step (C-44).
5. Create the tracked link for this video.

**Gate:** it passes the unbiased-expert test · there's one clear next step · the tracked link works.

## 7 · Preflight and bets

**Goal:** turn the video into a measurable experiment.

1. Re-check every gate from 2 to 6.
2. Write the bets in `video.md` §7 for the topic, title format, thumbnail, hook/structure and CTA. Give each one its evidence and a prediction.
3. Predict the outcome: D28 views as a multiple of our baseline, and leads.
4. Fill in the formats used and the prediction in `data/videos.csv`. `yt.py new` creates the row.

**Gate:** all earlier gates pass · the bets and predictions are written down.

## Publish

Upload with the tested title, the tested thumbnail and the tracked link. Record the publish date in `data/videos.csv`, because the review due dates count from it.

## 8 · Review at D2, D7 and D28

**Goal:** measure what happened and find where the funnel leaked.

1. At each checkpoint, log the numbers from YouTube Studio and your CRM:
   `yt.py log <slug> --at D7 --views … --impressions … --ctr … --avg-viewed … --subs … --leads … --calls … --customers … --revenue …`
2. Run `yt.py diagnose <slug> --at D7`. It compares the video with your own baseline and with its peers at each funnel stage, and names the bottleneck.
3. Use CTR, retention and impressions only to locate a traffic problem:
   - low impressions point to the topic or distribution
   - CTR that's low for you points to the packaging
   - a low percentage viewed means the video didn't keep its promise
4. Read the comments for satisfaction. Sort them into delighted, wanted more, felt misled and wrong audience, and quote examples.

**Gate:** D28 is logged, so move on to Stage 9.

## 9 · Upgrade the system

Run the **self-upgrade protocol** in `MASTER_PROMPT.md`, then fill in §9 of `video.md`.

**Gate:** every bet is scored · each format used has new + or − evidence · the playbook and demand map are updated · the rules version is bumped · the changes are committed.

---

## Monthly review

1. Run `yt.py diagnose` across all videos to find the channel's bottleneck against its targets, and the trend.
2. Check audience coherence: are the hits bringing in the same viewer? Compare lead quality for each video (C-02, C-03).
3. Promote or retire learned rules whose evidence has changed, and re-check the engine defaults.
4. Refresh research to see what's working *now*: `yt.py research --fresh --since 60d`.
5. Write a short memo under "Monthly reviews" in `channel/playbook.md` and recommend next month's lineup of videos.
