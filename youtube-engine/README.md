# YouTube Growth Engine

The YouTube Growth Engine is a master prompt, a rulebook, a 10-stage pipeline and a research crawler, built from Jake Trinder's playbook for business YouTube channels. Each video you publish is logged as a bet, scored against what actually happened and fed back into the rules, so the system gets sharper with every upload.

```
                    ┌──────────────────────── every video ────────────────────────┐
                    ▼                                                             │
 0 Setup → 1 Research → 2 Validate → 3 Package → 4 Hook → 5 Structure → 6 CTA → 7 Bets → publish
            (DFS for     (≥3 outliers,  (one promise,  (Promise   (execution   (most     │
             outliers)    2+ channels)   feed test)     Proof      the promise  useful    ▼
                                                        Plan)      implied)     next   8 Review D2/D7/D28
                                                                                step)  (funnel bottleneck)
                                                                                          │
                     RULES.md · playbook.md · formats.md · demand_map.md  ◀── 9 Upgrade ┘
```

## What's in here

| Path | What it is | How often it changes |
|---|---|---|
| `MASTER_PROMPT.md` | Role, constitution, operating protocol, self-upgrade protocol | Only when you decide |
| `RULES.md` | Core rules from the playbook + rules learned from your videos, versioned | When the evidence calls for it |
| `PIPELINE.md` | Stages 0–9: steps, outputs and a pass/fail gate for each | Rarely |
| `channel/profile.md` | Niche, core viewer, awareness level, mechanism, offer, authority statement | Quarterly |
| `channel/playbook.md` | What works and fails on *your* channel | After every video |
| `library/formats.md` | Title, thumbnail, execution and CTA formats with + and − evidence | After every video and research run |
| `research/` | Seeds, crawl output, manual finds, demand map | After every research run |
| `videos/NNN-slug/video.md` | One file per video, holding every stage from validation to post-mortem | As the video moves |
| `data/` | Your uploads, checkpoint metrics and funnel targets | At every checkpoint |
| `engine/yt.py` | Research crawler, video scaffolding, logging, funnel diagnosis | Never needs editing |

## How to use it

### In Claude Code (recommended: the engine reads and writes its own files)

| Step | Command |
|---|---|
| Fill in the channel profile: niche, core viewer, offer, authority statement, tracking | `/yt-setup` |
| Seed list → depth-first search → demand map + formats | `/yt-research` |
| Get ranked video candidates with their evidence | `/yt-ideas` |
| Take one idea through validate → package → hook → structure → CTA → bets | `/yt-produce <idea>` |
| Publish, then record the date in `data/videos.csv` | none |
| Log a checkpoint and find the bottleneck | `/yt-review <slug> D7` |
| Post-mortem: upgrade the rules, playbook and formats | `/yt-upgrade <slug>` |
| Run a channel-level review and plan next month | `/yt-monthly` |

The knowledge lives in git. After any session that changes the engine, merge its branch into `main` so the next session starts from the upgraded rules.

### In a Claude Project or Custom GPT

1. Paste `MASTER_PROMPT.md` (everything below the line) into the instructions.
2. Upload `RULES.md`, `PIPELINE.md`, `channel/profile.md`, `channel/playbook.md`, `library/formats.md`, `research/demand_map.md` and `research/outliers.csv` as knowledge.
3. A chat can't write files back. After each post-mortem, ask it for the full updated files, then replace the uploads.

## The research engine

It needs Python 3.9+ and has no dependencies. Run it from the repo root:

```bash
python3 youtube-engine/engine/yt.py research                 # crawl research/seeds.txt depth-first
python3 youtube-engine/engine/yt.py research                 # …run again: it continues where it stopped
python3 youtube-engine/engine/yt.py summary                  # outliers per seed, dead branches
python3 youtube-engine/engine/yt.py top --n 50 --since 365d  # strongest outliers from the last year
python3 youtube-engine/engine/yt.py pattern "new rules of"   # a format's hit rate: winners AND losers
python3 youtube-engine/engine/yt.py research --query "the new era of" --shallow   # gather examples of a format
python3 youtube-engine/engine/yt.py add <url> --note "in the sidebar of <outlier>"
python3 youtube-engine/engine/yt.py new "How to lose visceral fat so fast it feels like cheating"
python3 youtube-engine/engine/yt.py log 001 --at D7 --views 12000 --leads 40 --calls 6 --customers 2 --revenue 6000
python3 youtube-engine/engine/yt.py diagnose 001             # or with no slug: the channel overview
python3 youtube-engine/engine/yt.py status
```

### How the crawl works

It runs depth-first search over YouTube, as described in the talk:

```
niche (root)
└── search term ............. a seed from research/seeds.txt
    └── outlier video ....... beat its own channel's baseline
        ├── channel ......... every standout video on it is logged
        │   └── standout video
        └── recommendations . see below
```

- **Outlier score:** a video's views ÷ the median views of its neighbouring uploads on the same channel (up to 10 on each side). Comparing a video with its own era keeps channel growth from distorting the score. Uploads younger than 14 days are kept out of baselines, and videos younger than 2 days aren't judged. Channels with fewer than 5 uploads fall back to views ÷ subscribers. The defaults (≥ 3×, ≥ 10,000 views, long-form ≥ 181 s) live in `research/config.json`.
- **Negative evidence:** every long-form upload of every channel the crawl touches is stored in `research/videos.csv`. That full set is what lets `pattern` report a format's hit rate and its losers, not just its winners.
- **Recommendations:** the API stopped exposing related videos in 2023. `--related` approximates them by searching each top outlier's title, which costs 100 quota units each. For the real sidebar, open the outlier and log what you see with `yt.py add <url>`.
- **Resumable:** the stack, the visited set and a cached copy of any half-processed search are saved in `research/state.json`. A run that hits the quota picks up exactly where it stopped, without paying for the same search twice.
- **Manual mode:** a VA can follow the manual procedure in `PIPELINE.md` and log finds in `research/manual.csv`. They're merged into `outliers.csv` and `pattern`.

### YouTube API key

1. Go to the Google Cloud console and create a project. Enable **YouTube Data API v3**, then go to **Credentials → Create credentials → API key** and restrict the key to YouTube Data API v3.
2. Make the key available to the engine:
   - **Local:** `export YOUTUBE_API_KEY=<key>`
   - **Claude Code cloud:** ask Claude to run research. It will ask for the key through a secure form and store it as a network secret for `www.googleapis.com` (header `X-Goog-Api-Key`). You can also add it yourself in the environment settings under Network secrets. No variable is needed either way.
3. **Quota:** the default is 10,000 units a day, reset at midnight Pacific. A search costs 100 units, and the channel lookups behind it cost about 1–2 units per page of 50 uploads. Expect about 150–300 units per seed term, or roughly 30–60 seeds a day. The engine stops at 9,000 (`daily_budget`) and saves its place.

## Tests

```bash
python3 -m unittest discover -s youtube-engine/engine -p "test_*.py"
```

The tests run the crawler against an in-memory fake of the API that uses the same request parameters and response shapes. They cover DFS order, outlier scoring, quota stop and resume, recommendations, `pattern`, manual rows, funnel diagnosis and the CLI.

## Where the content comes from

The core rules (`C-`) and the seeded formats come from Jake Trinder's talk on building $100K+/month YouTube channels. The case-study numbers in `library/formats.md` are as he reported them and haven't been verified. The engine's thresholds are its own starting assumptions, and `RULES.md` labels them as such.
