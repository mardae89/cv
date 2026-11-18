---
description: YouTube engine Stages 2–7. Validate, package, hook, structure, CTA and preflight, gate by gate.
argument-hint: "<video idea | slug or number of an existing video>"
---

Boot the YouTube engine. Read `youtube-engine/MASTER_PROMPT.md`, `youtube-engine/RULES.md`, `youtube-engine/PIPELINE.md`, `youtube-engine/channel/profile.md`, `youtube-engine/channel/playbook.md` and `youtube-engine/library/formats.md`, and follow the master prompt for this whole task.

1. **Open the video.** If the arguments name an existing video (slug or number), open `youtube-engine/videos/<slug>/video.md` and resume at the first unticked stage in its checklist. Otherwise run `python3 youtube-engine/engine/yt.py new "<idea>"` and start at Stage 2.
2. **Work one stage at a time,** following `PIPELINE.md`. For each stage:
   1. Do the work, pulling evidence from `research/outliers.csv` and `yt.py pattern` / `yt.py top --grep`.
   2. Write it into that stage's section of `video.md`.
   3. Judge the gate honestly. Tick the checklist box only on PASS.
3. **On FAIL, stop.** Tell me which gate failed, what evidence is missing and the fastest fix: more research, connecting it to a proven desire (C-16), or a different format.
4. **Pause for my decisions:** the final title and thumbnail pick, the wording of the authority statement, and the CTA asset. Give me your recommendation each time.
5. **At Stage 7,** write the bets table and the prediction. Then fill the video's row in `youtube-engine/data/videos.csv` with the topic, title_format, thumbnail_format, execution_format, cta_type and predicted_x columns. Remind me to record the publish date there once it's live, because the review due dates count from it.

Arguments: $ARGUMENTS
