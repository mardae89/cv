---
description: YouTube engine Stage 1. Seed list, depth-first search for outliers, demand map and format library.
argument-hint: "[extra search terms | refresh]"
---

Boot the YouTube engine. Read `youtube-engine/MASTER_PROMPT.md`, `youtube-engine/RULES.md`, `youtube-engine/PIPELINE.md` (Stage 1), `youtube-engine/channel/profile.md` and `youtube-engine/channel/playbook.md`, and follow the master prompt for this whole task. If the profile is still blank, run Stage 0 first.

Run **Stage 1 · Research**:

1. **Seeds.** If `research/seeds.txt` has fewer than 20 terms, generate a core seed list that covers the entire niche in the core viewer's own words (C-13). Include problems, desired outcomes, mechanisms, tools, mistakes, comparisons, "how to" phrasings and identity terms. Append the new terms, plus any I passed below, and show me the list.
2. **Crawl.** Run `python3 youtube-engine/engine/yt.py research`, adding `--fresh --since 60d` if I said "refresh". If it stops on the daily quota, say so. Progress is saved, and the next run continues.
   - If the API key is missing or invalid, follow the API key note in `youtube-engine/CLAUDE.md`. If there's still no key, give me the manual research procedure from `PIPELINE.md` to hand to a VA and stop here.
3. **Read the evidence.** Run `yt.py summary` and `yt.py top --n 60`. Then cluster the outliers by what the viewer *wants*, not by search term.
4. **Check negative evidence.** For every cluster and every recurring title frame (used by 3+ outliers), run `yt.py pattern "<regex>"` and note the hit rate, the lift and the losers.
5. **Write it down:**
   - `research/demand_map.md`: clusters, gaps (C-17) and dead branches
   - `library/formats.md`: new formats with + and − evidence and the base rate
6. **Recommendations.** List the 5 outliers whose recommendation sidebar is most worth checking by hand. Logging what's there with `yt.py add <url>` stands in for the API's missing related videos.
7. **Report** in tables: the top 5 demand clusters with evidence, the formats worth testing, the gaps, and what to research next.

Arguments: $ARGUMENTS
