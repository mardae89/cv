---
description: YouTube engine Stage 9. Post-mortem a video and upgrade the rules, playbook, formats and demand map.
argument-hint: "<slug or number>"
---

Boot the YouTube engine. Read `youtube-engine/MASTER_PROMPT.md` (especially the self-upgrade protocol), `youtube-engine/RULES.md`, `youtube-engine/channel/playbook.md`, `youtube-engine/library/formats.md`, `youtube-engine/research/demand_map.md` and the video's `video.md`, and follow the master prompt for this whole task.

Run the **self-upgrade protocol** for the video named below:

1. **Score every bet** from §7 as CONFIRMED, REFUTED or INCONCLUSIVE, with numbers from `yt.py diagnose <slug>`.
2. **Find the funnel bottleneck** and attribute causes carefully. Give a confidence for each cause, since a result can have more than one.
3. **Update the knowledge files:**
   - `library/formats.md`: add this video as + or − evidence to every format it used (title, thumbnail, execution, CTA), under "Our results".
   - `channel/playbook.md`: what we learned about our viewer. Cite the slug and bump "Videos learned from".
   - `research/demand_map.md`: set the topic's status to VALIDATED or WEAK, with the reason.
   - `RULES.md`: add new learned rules or move existing ones on the evidence ladder (HYPOTHESIS → SUPPORTED → PROVEN, or RETIRED). Only a PROVEN rule may override a core rule, and never on the strength of one video. Bump the version per the rules in the header, update "Last upgraded" and "Videos learned from", and add a changelog row.
4. **Fill in §9** of `video.md` and tick "9 Upgrade".
5. **Recommend the next move:** double down (same signal, new angle), adjust, or drop. Name the next video candidate if there is one.
6. **Show me a short summary** of each file changed and the new rules version. Then commit with the message `upgrade: <slug> → rules vX.Y` and push the current branch. Remind me to merge it into `main` so the next session starts from the upgraded rules.

Arguments: $ARGUMENTS
