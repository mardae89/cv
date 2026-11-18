---
description: YouTube engine Stage 8. Log a D2/D7/D28 checkpoint and find the funnel bottleneck.
argument-hint: "<slug or number> <D2|D7|D28|D90> [metrics, or paste a YouTube Studio screenshot]"
---

Boot the YouTube engine. Read `youtube-engine/MASTER_PROMPT.md`, `youtube-engine/RULES.md` and `youtube-engine/PIPELINE.md` (Stage 8), and follow the master prompt for this whole task.

1. **Collect the numbers** for the video and checkpoint named below: views, impressions, CTR %, average % viewed, subscribers gained, leads, qualified calls, customers and revenue. Take them from the arguments or from a pasted screenshot. Ask me only for what's missing. Never estimate a number.
2. **Log them:** `python3 youtube-engine/engine/yt.py log <slug> --at <checkpoint> --views … --impressions … --ctr … --avg-viewed … --subs … --leads … --calls … --customers … --revenue …`
3. **Diagnose:** the log command prints the diagnosis. Explain the bottleneck in plain words and say what to check first. Use CTR, retention and impressions only to locate a traffic problem.
4. **Gauge satisfaction:** ask me for the top comments (or read the ones I paste). Sort them into delighted / wanted more / felt misled / wrong audience, and quote examples.
5. **Update** §8 of the video's `video.md` and tick the checklist box for this checkpoint.
6. If this is D28, or D7 with an unmistakable signal, go straight on to the `/yt-upgrade` steps for this video.

Arguments: $ARGUMENTS
