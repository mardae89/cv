---
description: YouTube engine monthly review. Channel bottleneck, audience coherence, rule promotions and a research refresh.
---

Boot the YouTube engine. Read `youtube-engine/MASTER_PROMPT.md`, `youtube-engine/RULES.md`, `youtube-engine/PIPELINE.md` (Monthly review), `youtube-engine/channel/profile.md` and `youtube-engine/channel/playbook.md`, and follow the master prompt for this whole task.

1. **Funnel.** Run `python3 youtube-engine/engine/yt.py diagnose` and name the channel-level bottleneck against the targets, plus the trend across recent videos.
2. **Audience coherence (C-02, C-03).** Are the recent hits bringing in the same viewer? Compare lead and call quality for each video, and flag any off-topic hits.
3. **Evidence ladder.** Promote or retire learned rules whose evidence changed this month. Check whether the engine defaults still fit (outlier threshold, min views, the repeated-evidence bar), and propose changes with reasons.
4. **Refresh research.** Run `yt.py research --fresh --since 60d` (with an API key) to catch what's working *now*. Then update `research/demand_map.md` and `library/formats.md`.
5. **Write a memo** under "Monthly reviews" in `channel/playbook.md` covering what worked, what didn't, the bottleneck and the biggest open question.
6. **Recommend next month's slate:** 4–8 videos in a ranked table with their evidence. Commit, push and remind me to merge into `main`.
