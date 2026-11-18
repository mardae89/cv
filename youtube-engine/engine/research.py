"""Stage 1 research: depth-first search over YouTube for outlier videos.

    niche (root)
    └── search term ............. a seed, in the market's own words
        └── outlier video ....... beat its own channel's baseline
            ├── channel ......... every standout video on it is logged
            │   └── standout video
            └── recommendations . approximated by searching the video's title (the API dropped
                                  related videos in 2023); off unless --related

The stack holds nodes that have been found but not explored yet. Pop a node, explore it and push its
children so the first child is explored next. A branch that turns up nothing new simply ends and the next
node is popped. Progress is saved as it goes, so a run that hits the daily quota resumes exactly where it
stopped.

Scoring: every long-form upload of every channel the crawl touches is stored (research/videos.csv), with
views ÷ the median of its neighbouring uploads. That full set is the negative evidence `pattern` uses. Only
the ones at or above the threshold are outliers (research/outliers.csv).
"""

import datetime as dt
import os
import re
import statistics
from collections import defaultdict

import store
from ytapi import ApiError, video_id_from

VIDEO_FIELDS = [
    "video_id", "title", "channel_title", "views", "outlier_x", "baseline_views", "views_per_sub", "basis",
    "is_outlier", "published_at", "duration_s", "likes", "comments", "subs", "channel_id", "seed",
    "found_via", "path", "note", "fetched_at", "url",
]
CHANNEL_FIELDS = ["channel_id", "title", "subs", "longform_videos", "median_views", "outliers", "explored", "fetched_at"]
NUMERIC_FIELDS = ("views", "outlier_x", "baseline_views", "views_per_sub", "duration_s", "likes", "comments", "subs", "is_outlier")

DEFAULTS = {
    "outlier_threshold": 3.0,       # views ÷ channel baseline needed to count as an outlier
    "min_views": 10000,             # ignore tiny absolute numbers
    "min_seconds": 181,             # long-form only (Shorts run up to 3 minutes)
    "subs_fallback_ratio": 1.0,     # channels with too few uploads for a baseline: views ÷ subscribers
    "baseline_window": 10,          # neighbouring uploads on each side used for a video's baseline
    "baseline_min_videos": 5,       # fewer than this → no baseline
    "baseline_min_age_days": 14,    # younger uploads are still collecting views: kept out of baselines
    "score_min_age_days": 2,        # younger uploads aren't judged at all
    "channel_max_pages": 4,         # up to 200 recent uploads per channel
    "channel_target_longform": 40,  # stop paging once this many long-form uploads are in hand
    "channel_cache_days": 14,       # re-fetch a channel after this many days
    "max_depth": 4,                 # search 1 → video 2 → channel 3 → standout 4
    "related": False,               # approximate recommendations with title searches (100 units each)
    "related_per_search": 3,        # only for the top N outliers of each search or channel
    "daily_budget": 9000,           # quota units this engine may spend per Pacific day
    "region": "",                   # e.g. "US"
    "language": "",                 # e.g. "en"
    "published_after": "",          # RFC 3339; set by --since
}


def research_path(name):
    return store.path("research", name)


def load_config(overrides=None):
    cfg = dict(DEFAULTS)
    saved = store.read_json(research_path("config.json"), {})
    cfg.update({k: v for k, v in saved.items() if k in DEFAULTS})
    cfg.update({k: v for k, v in (overrides or {}).items() if k in DEFAULTS and v is not None})
    return cfg


def read_seeds():
    file = research_path("seeds.txt")
    if not os.path.exists(file):
        return []
    with open(file, encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]


def pacific_date():
    """The API quota resets at midnight Pacific time."""
    try:
        from zoneinfo import ZoneInfo
        return dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()
    except Exception:
        return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=8)).date().isoformat()


def quota_used_today():
    quota = store.read_json(research_path("state.json"), {}).get("quota", {})
    return quota.get("used", 0) if quota.get("date") == pacific_date() else 0


def since_date(text, now=None):
    """'90d' or 'YYYY-MM-DD' → 'YYYY-MM-DD'."""
    now = now or dt.datetime.now(dt.timezone.utc)
    match = re.fullmatch(r"(\d+)\s*d", text.strip().lower())
    if match:
        return (now - dt.timedelta(days=int(match.group(1)))).date().isoformat()
    return dt.date.fromisoformat(text.strip()).isoformat()


# ---------------------------------------------------------------- scoring

def parse_time(text):
    try:
        moment = dt.datetime.fromisoformat((text or "").replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=dt.timezone.utc)


def age_days(published_at, now):
    moment = parse_time(published_at)
    return (now - moment).total_seconds() / 86400 if moment else 0


def is_longform(video, cfg):
    return not video.get("live") and (video.get("duration_s") or 0) >= cfg["min_seconds"]


def qualifies(row, age, cfg):
    if age < cfg["score_min_age_days"] or (row.get("views") or 0) < cfg["min_views"]:
        return False
    if row.get("outlier_x") not in ("", None):
        return row["outlier_x"] >= cfg["outlier_threshold"]
    if row.get("views_per_sub") not in ("", None):
        return row["views_per_sub"] >= cfg["subs_fallback_ratio"]
    return False


def apply_score(video, baseline, subs, age, cfg):
    video["baseline_views"] = round(baseline) if baseline else ""
    video["outlier_x"] = round(video["views"] / baseline, 2) if baseline else ""
    video["views_per_sub"] = round(video["views"] / subs, 2) if subs else ""
    video["subs"] = "" if subs is None else subs
    video["basis"] = "channel" if baseline else ("subs" if subs else "")
    video["is_outlier"] = int(qualifies(video, age, cfg))


def score_channel_videos(videos, subs, cfg, now):
    """Score each upload against the median views of its neighbours on the same channel.

    Neighbours are up to `baseline_window` uploads on either side in publish order. They're drawn only from
    uploads at least `baseline_min_age_days` old, because younger ones haven't finished collecting views.
    Comparing a video with its own era keeps a channel's growth or decline from distorting the score.
    Returns the channel's median views (or None if there are too few uploads).
    """
    ordered = sorted(videos, key=lambda v: v.get("published_at", ""))
    ages = [age_days(v.get("published_at"), now) for v in ordered]
    pool = [i for i, age in enumerate(ages) if age >= cfg["baseline_min_age_days"]]
    window, need = cfg["baseline_window"], cfg["baseline_min_videos"]
    for i, video in enumerate(ordered):
        neighbours = [j for j in pool if j < i][-window:] + [j for j in pool if j > i][:window]
        if len(neighbours) < need:
            neighbours = [j for j in pool if j != i]
        baseline = statistics.median(ordered[j]["views"] for j in neighbours) if len(neighbours) >= need else None
        apply_score(video, baseline, subs, ages[i], cfg)
    pool_views = [ordered[j]["views"] for j in pool]
    return statistics.median(pool_views) if len(pool_views) >= need else None


def is_hit(row):
    return store.num(row.get("is_outlier"), 0) == 1


def strength(row):
    """Sort key: the outlier multiple, or views per subscriber when there was no channel baseline."""
    x = store.num(row.get("outlier_x"))
    if x is not None:
        return x
    return store.num(row.get("views_per_sub"), 0) or 0


def node_key(node):
    kind = node["type"]
    if kind in ("search", "related"):
        prefix = "qs:" if node.get("shallow") else "q:"
        return prefix + " ".join(node["q"].lower().split())
    return ("c:" if kind == "channel" else "v:") + node["id"]


def related_query(title):
    text = re.sub(r"#\w+", " ", title or "")
    text = re.sub(r"[^\w\s'$%-]", " ", text)
    return " ".join(text.split())[:80]


def short(text, limit=48):
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def plural(count, word):
    return f"{count:,} {word}{'' if count == 1 else 's'}"


def fmt_int(value):
    number = store.num(value)
    return f"{number:,.0f}" if number is not None else "?"


def fmt_x(row):
    x = store.num(row.get("outlier_x"))
    if x is not None:
        return f"{x:.1f}×"
    per_sub = store.num(row.get("views_per_sub"))
    return f"{per_sub:.1f} v/sub" if per_sub is not None else "?"


def _normalize(row):
    for key in NUMERIC_FIELDS:
        value = store.num(row.get(key))
        row[key] = "" if value is None else value
    return row


# ---------------------------------------------------------------- the crawl

class Research:
    """One research session: the research database, the DFS stack and the API client."""

    def __init__(self, yt, cfg, now=None, echo=print):
        self.yt = yt
        self.cfg = cfg
        self.now = now or dt.datetime.now(dt.timezone.utc)
        self.today = self.now.date().isoformat()
        self.echo = echo
        self.db = {r["video_id"]: _normalize(r) for r in store.read_csv(research_path("videos.csv")) if r.get("video_id")}
        self.channels = {r["channel_id"]: r for r in store.read_csv(research_path("channels.csv")) if r.get("channel_id")}
        self.state = store.read_json(research_path("state.json"), {})
        for key, default in (("stack", []), ("visited", []), ("search_cache", {}), ("seed_stats", {})):
            self.state.setdefault(key, default)
        self.visited = set(self.state["visited"])
        self.trace = []  # node keys in exploration order
        self.found = []  # outliers first logged in this session

    # -- persistence

    def reset(self):
        """Forget the stack and what was searched; keep the database (for --fresh refreshes)."""
        self.state.update(stack=[], visited=[], search_cache={}, seed_stats={})
        self.visited = set()

    def save(self):
        self.state["visited"] = sorted(self.visited)
        if self.yt is not None:
            self.state["quota"] = {"date": pacific_date(), "used": self.yt.used}
        store.write_json(research_path("state.json"), self.state)
        rows = sorted(self.db.values(), key=lambda r: (r.get("channel_id", ""), r.get("published_at", "")))
        store.write_csv(research_path("videos.csv"), rows, VIDEO_FIELDS)
        channels = sorted(self.channels.values(), key=lambda c: str(c.get("title", "")).lower())
        store.write_csv(research_path("channels.csv"), channels, CHANNEL_FIELDS)
        write_outliers(self.cfg, self.db)

    # -- the stack

    def push_seeds(self, queries, shallow=False, front=False):
        """Queue search terms in order. By default they go under unfinished branches, since DFS finishes a
        branch before starting the next one. front=True explores them next."""
        queued = {node_key(n) for n in self.state["stack"]}
        nodes = []
        for query in queries:
            query = " ".join(query.split())
            if not query:
                continue
            node = {"type": "search", "q": query, "seed": query, "depth": 1, "path": "search: " + query}
            if shallow:
                node["shallow"] = True
            key = node_key(node)
            if key in self.visited or key in queued:
                continue
            queued.add(key)
            nodes.append(node)
        if front:
            self.state["stack"].extend(reversed(nodes))
        else:
            self.state["stack"][0:0] = list(reversed(nodes))
        return len(nodes)

    def run(self, max_nodes=None):
        """Explore depth-first until the stack is empty, max_nodes is reached or the quota runs out.

        QuotaExhausted, ApiError and KeyboardInterrupt put the current node back and propagate after saving.
        """
        stack = self.state["stack"]
        explored = 0
        try:
            while stack and (max_nodes is None or explored < max_nodes):
                node = stack.pop()
                key = node_key(node)
                if key in self.visited:
                    continue
                try:
                    children = getattr(self, "_explore_" + node["type"])(node)
                except BaseException:
                    stack.append(node)
                    raise
                self.visited.add(key)
                self.trace.append(key)
                for child in reversed(children):
                    if node_key(child) not in self.visited:
                        stack.append(child)
                explored += 1
                if explored % 5 == 0:
                    self.save()
        finally:
            self.save()
        return explored

    # -- node types

    def _explore_search(self, node):
        query = node["q"]
        cache = self.state["search_cache"]
        if query not in cache:
            cache[query] = self.yt.search(query, self.cfg["published_after"], self.cfg["region"], self.cfg["language"])
            self.save()  # a quota stop below must not waste these 100 units
        hits = [h for h in cache[query] if h["video_id"] != node.get("exclude")]
        fetched = [v for v in self.yt.videos([h["video_id"] for h in hits]) if is_longform(v, self.cfg)]
        candidates = [v for v in fetched if v["views"] >= self.cfg["min_views"]]
        self.load_channels([v["channel_id"] for v in candidates])
        via = ("related: " if node["type"] == "related" else "search: ") + query
        rows = []
        for video in candidates:
            row = self.db.get(video["video_id"]) or self._score_with_channel_median(video)
            self._claim(row, via, node)
            rows.append(row)
        outliers = sorted((r for r in rows if is_hit(r)), key=strength, reverse=True)
        if node["type"] == "search":
            self.state["seed_stats"][query] = {"results": len(fetched), "candidates": len(candidates),
                                               "outliers": len(outliers), "top": [r["video_id"] for r in outliers[:5]]}
        cache.pop(query, None)
        self._say(node, f"{plural(len(fetched), 'long-form result')}, {plural(len(outliers), 'outlier')}", outliers[:3])
        if node.get("shallow") or node["depth"] + 1 > self.cfg["max_depth"]:
            return []
        limit = self.cfg["related_per_search"]
        return [self._video_node(r, node, related=i < limit) for i, r in enumerate(outliers)]

    _explore_related = _explore_search

    def _explore_video(self, node):
        if node["depth"] + 1 > self.cfg["max_depth"]:
            return []
        children = [{
            "type": "channel", "id": node["channel_id"], "title": node.get("channel_title", ""),
            "seed": node.get("seed", ""), "depth": node["depth"] + 1,
            "path": node["path"] + " › channel: " + node.get("channel_title", ""),
        }]
        if self.cfg["related"] and node.get("related"):
            children.append({
                "type": "related", "id": node["id"], "q": related_query(node.get("title", "")), "exclude": node["id"],
                "seed": node.get("seed", ""), "depth": node["depth"] + 1, "path": node["path"] + " › recommendations",
            })
        return children

    def _explore_channel(self, node):
        channel_id = node["id"]
        self.load_channels([channel_id])
        title = self.channels.get(channel_id, {}).get("title") or node.get("title", "")
        standouts = sorted(
            (r for r in self.db.values() if r.get("channel_id") == channel_id and is_hit(r)), key=strength, reverse=True
        )
        for row in standouts:
            self._claim(row, "channel: " + title, node)
        if channel_id in self.channels:
            self.channels[channel_id]["explored"] = 1
        self._say(node, plural(len(standouts), "standout video"), standouts[:3])
        if not self.cfg["related"] or node["depth"] + 1 > self.cfg["max_depth"]:
            return []
        limit = self.cfg["related_per_search"]
        return [self._video_node(r, node, related=i < limit) for i, r in enumerate(standouts)]

    def _video_node(self, row, parent, related=False):
        return {
            "type": "video", "id": row["video_id"], "title": row.get("title", ""),
            "channel_id": row.get("channel_id", ""), "channel_title": row.get("channel_title", ""),
            "seed": parent.get("seed", ""), "depth": parent["depth"] + 1,
            "path": parent["path"] + " › " + short(row.get("title", "")), "related": related,
        }

    # -- channels and rows

    def load_channels(self, channel_ids):
        """Fetch and score the recent long-form uploads of every channel not fetched within the cache window."""
        todo = [c for c in dict.fromkeys(channel_ids) if c and not self._fresh(c)]
        if not todo:
            return
        metas = self.yt.channels(todo)
        for channel_id in todo:
            meta = metas.get(channel_id)
            uploads = self._fetch_uploads(meta["uploads"]) if meta and meta["uploads"] else []
            subs = meta["subs"] if meta else None
            median = score_channel_videos(uploads, subs, self.cfg, self.now)
            for video in uploads:
                self._store(video)
            self.channels[channel_id] = {
                "channel_id": channel_id,
                "title": meta["title"] if meta else "",
                "subs": "" if subs is None else subs,
                "longform_videos": len(uploads),
                "median_views": "" if median is None else round(median),
                "outliers": sum(1 for v in uploads if v["is_outlier"]),
                "explored": self.channels.get(channel_id, {}).get("explored", ""),
                "fetched_at": self.today,
            }

    def _fresh(self, channel_id):
        try:
            fetched = dt.date.fromisoformat(str(self.channels.get(channel_id, {}).get("fetched_at", "")))
        except ValueError:
            return False
        return (self.now.date() - fetched).days < self.cfg["channel_cache_days"]

    def _fetch_uploads(self, playlist_id):
        longform, token = [], ""
        for _ in range(self.cfg["channel_max_pages"]):
            try:
                ids, token = self.yt.playlist_page(playlist_id, token)
            except ApiError as e:
                if e.status == 404:  # channel without public uploads
                    break
                raise
            longform += [v for v in self.yt.videos(ids) if is_longform(v, self.cfg)]
            if not token or len(longform) >= self.cfg["channel_target_longform"]:
                break
        return longform

    def _store(self, video):
        old = self.db.get(video["video_id"], {})
        row = {k: video.get(k, "") for k in VIDEO_FIELDS}
        for keep in ("seed", "found_via", "path", "note"):
            row[keep] = old.get(keep) or video.get(keep, "")
        row["url"] = "https://www.youtube.com/watch?v=" + video["video_id"]
        row["fetched_at"] = self.today
        self.db[video["video_id"]] = row
        return row

    def _score_with_channel_median(self, video):
        """For a video older than the uploads fetched: compare it with the channel's current median."""
        channel = self.channels.get(video["channel_id"], {})
        baseline = store.num(channel.get("median_views"))
        subs = store.num(channel.get("subs"))
        apply_score(video, baseline, subs, age_days(video.get("published_at"), self.now), self.cfg)
        if baseline:
            video["basis"] = "channel-median"
        return self._store(video)

    def _claim(self, row, via, node):
        if row.get("found_via"):
            return
        row["found_via"], row["seed"], row["path"] = via, node.get("seed", ""), node.get("path", "")
        if is_hit(row):
            self.found.append(row)

    def _say(self, node, message, examples=()):
        indent = "  " * max(node.get("depth", 1) - 1, 0)
        label = {"search": "search", "related": "recs", "video": "video", "channel": "channel"}[node["type"]]
        self.echo(f"{indent}[{label}] {short(node.get('q') or node.get('title') or node.get('id'), 60)}: {message}")
        for row in examples:
            self.echo(f"{indent}    {fmt_x(row):>9}  {fmt_int(row.get('views')):>11} views  {short(row.get('title'), 70)}")

    # -- manual additions

    def add(self, video_id, note="", seed=""):
        """Log one video found by hand (e.g. in the recommendations sidebar), scored against its own channel."""
        videos = self.yt.videos([video_id])
        if not videos:
            raise LookupError(f"no public video found for {video_id}")
        video = videos[0]
        self.load_channels([video["channel_id"]])
        row = self.db.get(video_id) or self._score_with_channel_median(video)
        row["found_via"] = "manual" + (f": {note}" if note else "")
        row["note"] = note or row.get("note", "")
        row["seed"] = seed or row.get("seed", "")
        self.save()
        return row, video


# ---------------------------------------------------------------- reading the database

def manual_rows(cfg, known=()):
    """Rows a VA logged by hand in research/manual.csv, in the research-database shape."""
    out = []
    known = set(known)
    for r in store.read_csv(research_path("manual.csv")):
        video_id = video_id_from(r.get("url", "")) or ""
        if video_id and video_id in known:
            continue
        views = store.num(r.get("views"))
        typical = store.num(r.get("channel_typical_views"))
        x = round(views / typical, 2) if views and typical else ""
        hit = (x == "" or x >= cfg["outlier_threshold"]) and (views or 0) >= cfg["min_views"]
        out.append({
            "video_id": video_id, "title": r.get("title", ""), "channel_title": r.get("channel_title", ""),
            "views": "" if views is None else views, "outlier_x": x, "baseline_views": typical or "",
            "views_per_sub": "", "basis": "manual" if x != "" else "manual-unscored", "is_outlier": int(hit),
            "published_at": r.get("published", ""), "seed": r.get("seed", ""),
            "found_via": r.get("found_via") or "manual", "note": r.get("note", ""), "url": r.get("url", ""),
        })
    return out


def database_rows():
    return [_normalize(r) for r in store.read_csv(research_path("videos.csv")) if r.get("video_id")]


def all_rows(cfg):
    rows = database_rows()
    return rows + manual_rows(cfg, known={r["video_id"] for r in rows})


def write_outliers(cfg, db):
    rows = [dict(r) for r in db.values() if is_hit(r)]
    for row in rows:
        if not row.get("found_via"):
            row["found_via"] = "channel scan: " + str(row.get("channel_title") or "")
    rows += [r for r in manual_rows(cfg, known=db.keys()) if is_hit(r)]
    rows.sort(key=strength, reverse=True)
    store.write_csv(research_path("outliers.csv"), rows, VIDEO_FIELDS)


def top_rows(cfg, n=30, seed=None, grep=None, since=None):
    rows = [r for r in all_rows(cfg) if is_hit(r)]
    if seed:
        rows = [r for r in rows if str(r.get("seed", "")).lower() == seed.lower()]
    if grep:
        pattern = re.compile(grep, re.I)
        rows = [r for r in rows if pattern.search(str(r.get("title", "")))]
    if since:
        cutoff = since_date(since)
        rows = [r for r in rows if str(r.get("published_at", "")) >= cutoff]
    return sorted(rows, key=strength, reverse=True)[:n]


def pattern_stats(cfg, regex, examples=5):
    """Positive AND negative evidence for a title pattern across every scored video in the database."""
    pattern = re.compile(regex, re.I)
    scored = [r for r in all_rows(cfg) if r.get("basis") and r.get("basis") != "manual-unscored"]
    matches = [r for r in scored if pattern.search(str(r.get("title", "")))]

    def rate(rows):
        return sum(is_hit(r) for r in rows) / len(rows) if rows else None

    def median_x(rows):
        xs = [store.num(r.get("outlier_x")) for r in rows]
        xs = [x for x in xs if x is not None]
        return statistics.median(xs) if xs else None

    ranked = sorted(matches, key=strength, reverse=True)
    return {
        "n": len(matches),
        "hits": sum(is_hit(r) for r in matches),
        "rate": rate(matches),
        "base_n": len(scored),
        "base_rate": rate(scored),
        "median_x": median_x(matches),
        "base_median_x": median_x(scored),
        "channels": len({r.get("channel_id") or r.get("channel_title") for r in matches}),
        "winners": [r for r in ranked if is_hit(r)][:examples],
        "losers": [r for r in reversed(ranked) if not is_hit(r)][:examples],
    }


def summary_text(cfg):
    state = store.read_json(research_path("state.json"), {})
    rows = all_rows(cfg)
    hits = [r for r in rows if is_hit(r)]
    seed_stats = state.get("seed_stats", {})
    channels = store.read_csv(research_path("channels.csv"))

    by_id = {r.get("video_id"): r for r in rows if r.get("video_id")}
    direct, via_channels = defaultdict(list), defaultdict(list)
    for row in hits:
        seed = row.get("seed") or ""
        if not seed:
            continue
        (direct if str(row.get("found_via", "")).startswith("search: ") else via_channels)[seed].append(row)

    def direct_count(seed):
        # A search's outliers count for it even if an earlier seed logged them first.
        return seed_stats.get(seed, {}).get("outliers", len(direct.get(seed, [])))

    lines = [
        f"Research database: {len(rows):,} long-form videos scored · {len(hits):,} outliers · {len(channels):,} channels",
        "",
        "| Seed | Long-form results | Outliers in results | Via their channels | Best outlier in results |",
        "|---|---|---|---|---|",
    ]
    seeds = sorted(set(seed_stats) | set(direct) | set(via_channels),
                   key=lambda s: (-direct_count(s), -len(via_channels.get(s, [])), s))
    for seed in seeds:
        found = [by_id[i] for i in seed_stats.get(seed, {}).get("top", []) if i in by_id] or direct.get(seed, [])
        best = max(found, key=strength, default=None)
        best_text = f"{short(best.get('title'), 60)} ({fmt_x(best)}, {fmt_int(best.get('views'))})" if best else "none"
        results = seed_stats.get(seed, {}).get("results", "")
        lines.append(f"| {seed} | {results} | {direct_count(seed)} | {len(via_channels.get(seed, []))} | {best_text} |")

    dead = sorted(s for s, stats in seed_stats.items() if not stats.get("outliers"))
    other = sum(1 for r in hits if not r.get("seed"))
    lines += [
        "",
        "Dead branches (searched, no outliers): " + (", ".join(dead) if dead else "none"),
        f"Other outliers (channel scans, manual, recommendations without a seed): {other}",
        f"Stack: {plural(len(state.get('stack', [])), 'node')} waiting · quota used today: {quota_used_today():,} units",
    ]
    return "\n".join(lines)
