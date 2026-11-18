---
description: YouTube engine. Propose the next videos to make, ranked by evidence.
argument-hint: "[how many | theme]"
---

Boot the YouTube engine. Read `youtube-engine/MASTER_PROMPT.md`, `youtube-engine/RULES.md`, `youtube-engine/channel/profile.md`, `youtube-engine/channel/playbook.md`, `youtube-engine/research/demand_map.md` and `youtube-engine/library/formats.md`, and follow the master prompt for this whole task.

Propose the next videos (5 by default, or what I asked for below). For each candidate, give:

- **Idea:** what the viewer wants (their words) + our angle or mechanism (C-15)
- **Demand evidence:** 3+ outliers from `research/outliers.csv`, with title, channel, views, × and date
- **Negative evidence and risk**
- **Best-fit title format** with its base rate, plus one example title
- **Channel fit (C-02)** and **natural CTA (C-42/C-43)**
- **Type:** new topic, or a double-down on a signal from our playbook. A double-down must use a genuinely new angle (C-52).

Rank them on evidence strength × core-viewer fit × business path × our unfair edge, and show the ranking as a table. Recommend one. Don't create any files until I pick. Then I'll run `/yt-produce <idea>`.

Arguments: $ARGUMENTS
