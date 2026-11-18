"""Stages 7–8: your own uploads, checkpoint metrics and funnel bottleneck diagnosis.

The funnel is views → leads → qualified calls → customers → revenue. Each video is compared with the median of
your previous videos at the same checkpoint (up to 10, at least 3). Until that history exists, the conversion
stages are compared with data/targets.json. The stage furthest below its usual rate (under 0.8×) is the bottleneck.
"""

import datetime as dt
import re
import statistics

import store

VIDEO_FIELDS = ["slug", "title", "published", "topic", "title_format", "thumbnail_format", "execution_format",
                "cta_type", "predicted_x", "notes"]
METRIC_FIELDS = ["slug", "checkpoint", "date", "views", "impressions", "ctr_pct", "avg_pct_viewed", "subs",
                 "leads", "calls", "customers", "revenue"]
FLAG = 0.8
MIN_PEERS = 3
PEER_LIMIT = 10

STAGES = [
    ("traffic", "Traffic", "views"),
    ("capture", "Lead capture", "leads / 1k views"),
    ("booking", "Call booking", "calls / lead"),
    ("closing", "Closing", "customers / call"),
]
TARGET_KEYS = {"capture": ("leads_per_1k_views", 1), "booking": ("lead_to_call_pct", 100), "closing": ("call_to_customer_pct", 100)}

FIXES = {
    "traffic": (
        "Topic or packaging (C-10, C-20 to C-25). Low impressions mean YouTube found little demand, so re-check the "
        "Stage 2 evidence. A CTR below your norm means the packaging lost the click, so rerun the feed test. A low "
        "% viewed means the video didn't keep its promise (C-30, C-33)."
    ),
    "capture": (
        "The CTA (C-40 to C-44). Was it the viewer's most useful next step, placed where the need peaks, with one "
        "tracked link? A pitch that's too hard, a missing CTA or an asset nobody wanted all show up here."
    ),
    "booking": (
        "The funnel after the opt-in. The lead magnet may be attracting people who aren't buyers, or the email "
        "follow-up and booking step are weak. Compare the leads from this video that booked with those that didn't."
    ),
    "closing": (
        "Sales or audience quality. Calls from this video may be from off-target viewers (C-02, C-03), or the offer "
        "or sales process needs work. Compare these calls with the calls from your best-converting video."
    ),
}


def videos_path():
    return store.path("data", "videos.csv")


def metrics_path():
    return store.path("data", "metrics.csv")


def load():
    videos = store.read_csv(videos_path())
    metrics = {(r["slug"], r.get("checkpoint", "").upper()): r for r in store.read_csv(metrics_path()) if r.get("slug")}
    targets = store.read_json(store.path("data", "targets.json"), {})
    return videos, metrics, targets


def checkpoint_days(checkpoint):
    match = re.fullmatch(r"D(\d+)", str(checkpoint).strip().upper())
    return int(match.group(1)) if match else None


def log_checkpoint(slug, checkpoint, values, date=None):
    """Insert or update the (slug, checkpoint) row. Values that are None are left as they were."""
    checkpoint = checkpoint.strip().upper()
    if checkpoint_days(checkpoint) is None:
        raise ValueError(f"checkpoint must look like D2, D7, D28 or D90, not {checkpoint!r}")
    rows = store.read_csv(metrics_path())
    row = next((r for r in rows if r["slug"] == slug and r.get("checkpoint", "").upper() == checkpoint), None)
    if row is None:
        row = {"slug": slug, "checkpoint": checkpoint}
        rows.append(row)
    row["date"] = date or dt.date.today().isoformat()
    for key, value in values.items():
        if value is not None:
            row[key] = value
    rows.sort(key=lambda r: (r["slug"], checkpoint_days(r.get("checkpoint", "")) or 0))
    store.write_csv(metrics_path(), rows, METRIC_FIELDS)
    return row


def order(videos, metrics):
    """Slugs in publish order. Unpublished videos and unknown dates sort last, then by slug."""
    published = {v["slug"]: v.get("published", "") for v in videos if v.get("slug")}
    slugs = set(published) | {slug for slug, _ in metrics}
    return sorted(slugs, key=lambda s: (published.get(s) or "9999-99-99", s))


def latest_checkpoint(slug, metrics):
    checkpoints = [c for s, c in metrics if s == slug]
    return max(checkpoints, key=lambda c: checkpoint_days(c) or 0) if checkpoints else None


def stage_values(row):
    views, leads, calls, customers = (store.num(row.get(k)) for k in ("views", "leads", "calls", "customers"))
    return {
        "traffic": views,
        "capture": leads / views * 1000 if views and leads is not None else None,
        "booking": calls / leads if leads and calls is not None else None,
        "closing": customers / calls if calls and customers is not None else None,
    }


def target(stage, targets):
    if stage not in TARGET_KEYS:
        return None
    key, scale = TARGET_KEYS[stage]
    value = store.num(targets.get(key))
    return value / scale if value else None


def _median(values):
    values = [v for v in values if v is not None]
    return statistics.median(values) if len(values) >= MIN_PEERS else None


def diagnose(slug, checkpoint, videos, metrics, targets):
    """Compare one video's funnel with your own history (or targets). Returns None if that checkpoint isn't logged."""
    row = metrics.get((slug, checkpoint))
    if row is None:
        return None
    slugs = order(videos, metrics)
    prior = slugs[: slugs.index(slug)] if slug in slugs else []
    peers = [metrics[(s, checkpoint)] for s in prior if (s, checkpoint) in metrics][-PEER_LIMIT:]
    actual = stage_values(row)
    peer_values = [stage_values(p) for p in peers]

    stages = []
    for stage, label, unit in STAGES:
        reference = _median(p[stage] for p in peer_values)
        source = f"median of your last {len(peers)}" if reference is not None else None
        if reference is None and target(stage, targets):
            reference, source = target(stage, targets), "target"
        value = actual[stage]
        ratio = value / reference if value is not None and reference else None
        stages.append({"stage": stage, "label": label, "unit": unit, "actual": value,
                       "reference": reference, "source": source, "ratio": ratio})

    flagged = [s for s in stages if s["ratio"] is not None and s["ratio"] < FLAG]
    bottleneck = min(flagged, key=lambda s: s["ratio"]) if flagged else None

    traffic_detail = []
    for key, label in (("impressions", "Impressions"), ("ctr_pct", "CTR %"), ("avg_pct_viewed", "Avg % viewed")):
        value = store.num(row.get(key))
        if value is not None:
            traffic_detail.append((label, value, _median(store.num(p.get(key)) for p in peers)))

    notes = []
    traffic_ratio, capture_ratio = stages[0]["ratio"], stages[1]["ratio"]
    if traffic_ratio and traffic_ratio >= 2 and capture_ratio is not None and capture_ratio <= 0.5:
        notes.append("High views but a low lead rate. This may be an off-topic hit that brought in the wrong viewer, "
                     "or a CTA problem (C-03). Check whether the comments come from your core viewer.")
    views, leads = store.num(row.get("views"), 0), store.num(row.get("leads"))
    if views >= 1000 and leads == 0:
        notes.append("No leads from 1,000+ views. Check that the video has a CTA and that its tracked link works.")
    if all(s["ratio"] is None for s in stages):
        notes.append("Not enough history to compare against yet. Log 3+ videos at this checkpoint, or set targets in "
                     "data/targets.json.")

    return {
        "slug": slug, "checkpoint": checkpoint, "views": views, "revenue": store.num(row.get("revenue")),
        "stages": stages, "bottleneck": bottleneck, "traffic_detail": traffic_detail, "notes": notes,
    }


def channel_totals(diagnoses, metrics, targets):
    """Totals across videos, each at the checkpoint used in its diagnosis."""
    totals = {k: 0 for k in ("views", "leads", "calls", "customers", "revenue")}
    for d in diagnoses:
        row = metrics[(d["slug"], d["checkpoint"])]
        for key in totals:
            totals[key] += store.num(row.get(key), 0) or 0
    rates = stage_values(totals)
    comparison = []
    for stage, label, unit in STAGES[1:]:
        goal = target(stage, targets)
        value = rates[stage]
        comparison.append({"stage": stage, "label": label, "unit": unit, "actual": value, "target": goal,
                           "ratio": value / goal if value is not None and goal else None})
    return totals, comparison


def _plain(value):
    return f"{value:,.0f}" if float(value).is_integer() else f"{value:,.1f}"


def fmt_stage(stage, value):
    if value is None:
        return "–"
    if stage == "traffic":
        return f"{value:,.0f}"
    if stage == "capture":
        return f"{value:.1f}"
    return f"{value * 100:.0f}%"


def render(d):
    lines = [f"{d['slug']} · {d['checkpoint']}"]
    traffic = d["stages"][0]
    if traffic["reference"]:
        lines.append(f"Views {d['views']:,.0f}: {traffic['ratio']:.2f}× your baseline of {traffic['reference']:,.0f} "
                     f"({traffic['source']})")
    else:
        lines.append(f"Views {d['views']:,.0f} (no baseline yet: needs 3+ earlier videos logged at {d['checkpoint']})")
    lines += ["", f"{'Stage':<14}{'Measure':<18}{'This video':>12}{'Usual':>12}{'Ratio':>8}"]
    for s in d["stages"]:
        marker = "  ◀ bottleneck" if d["bottleneck"] is s else ""
        ratio = f"{s['ratio']:.2f}×" if s["ratio"] is not None else "–"
        lines.append(f"{s['label']:<14}{s['unit']:<18}{fmt_stage(s['stage'], s['actual']):>12}"
                     f"{fmt_stage(s['stage'], s['reference']):>12}{ratio:>8}{marker}")
    if d["revenue"] is not None:
        lines.append(f"{'Revenue':<14}{'':<18}{'$' + format(d['revenue'], ',.0f'):>12}")
    if d["traffic_detail"]:
        lines += ["", "Traffic diagnostics (for locating a traffic problem; never targets):"]
        for label, value, reference in d["traffic_detail"]:
            usual = f" vs. your usual {_plain(reference)}" if reference is not None else ""
            lines.append(f"  {label}: {_plain(value)}{usual}")
    lines.append("")
    if d["bottleneck"]:
        b = d["bottleneck"]
        lines.append(f"Bottleneck: {b['label'].upper()} at {b['ratio']:.2f}× its usual rate.")
        lines.append("Where to look: " + FIXES[b["stage"]])
    elif any(s["ratio"] is not None for s in d["stages"]):
        lines.append("No bottleneck: every measured stage is at or above 0.8× its usual rate.")
    for note in d["notes"]:
        lines.append("Note: " + note)
    return "\n".join(lines)


def render_overview(diagnoses, metrics, targets):
    if not diagnoses:
        return "No checkpoints logged yet. Use: yt.py log <slug> --at D7 --views … --leads …"
    head = f"{'Video':<34}{'Ckpt':<6}{'Views':>10}{'×base':>8}{'Leads/1k':>10}{'Call%':>7}{'Close%':>8}{'Revenue':>11}  Bottleneck"
    lines = [head, "-" * len(head)]
    for d in diagnoses:
        s = {x["stage"]: x for x in d["stages"]}
        ratio = f"{s['traffic']['ratio']:.1f}×" if s["traffic"]["ratio"] else "–"
        revenue = f"${d['revenue']:,.0f}" if d["revenue"] is not None else "–"
        lines.append(
            f"{d['slug'][:33]:<34}{d['checkpoint']:<6}{d['views']:>10,.0f}{ratio:>8}"
            f"{fmt_stage('capture', s['capture']['actual']):>10}{fmt_stage('booking', s['booking']['actual']):>7}"
            f"{fmt_stage('closing', s['closing']['actual']):>8}{revenue:>11}  "
            f"{d['bottleneck']['label'].lower() if d['bottleneck'] else ''}"
        )
    totals, comparison = channel_totals(diagnoses, metrics, targets)
    lines += [
        "",
        "Channel funnel: {views:,.0f} views → {leads:,.0f} leads → {calls:,.0f} calls → {customers:,.0f} customers → "
        "${revenue:,.0f}".format(**totals),
    ]
    for c in comparison:
        goal = f" (target {fmt_stage(c['stage'], c['target'])}: {c['ratio']:.2f}×)" if c["ratio"] is not None else ""
        lines.append(f"  {c['label']:<14}{fmt_stage(c['stage'], c['actual']):>8} {c['unit']}{goal}")
    flagged = [c for c in comparison if c["ratio"] is not None and c["ratio"] < FLAG]
    if flagged:
        worst = min(flagged, key=lambda c: c["ratio"])
        lines.append(f"Channel bottleneck vs. targets: {worst['label'].upper()}. {FIXES[worst['stage']]}")
    elif not any(c["target"] for c in comparison):
        lines.append("Set targets in data/targets.json to get a channel-level bottleneck.")
    return "\n".join(lines)
