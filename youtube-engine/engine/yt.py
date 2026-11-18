#!/usr/bin/env python3
"""YouTube Growth Engine command line. Python 3.9+, standard library only.

Research (Stage 1)
  research              depth-first crawl of research/seeds.txt; run it again to continue
  add URL               log a video you found by hand (e.g. in the recommendations), scored against its channel
  summary               outliers per seed, dead branches, quota
  top                   the strongest outliers
  pattern REGEX         a title format's hit rate, with winners AND losers

Your videos (Stages 2–9)
  new TITLE             create videos/NNN-slug/video.md and a row in data/videos.csv
  log SLUG --at D7 …    record a checkpoint (views, leads, calls, customers, revenue …)
  diagnose [SLUG]       find the funnel bottleneck for one video, or show the channel overview
  status                where every video is in the pipeline
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import funnel  # noqa: E402
import pipeline  # noqa: E402
import research  # noqa: E402
import store  # noqa: E402
from research import fmt_int, fmt_x, short  # noqa: E402
from ytapi import KEY_HELP, ApiError, QuotaExhausted, YouTube, http_transport, video_id_from  # noqa: E402


def client(cfg):
    transport = http_transport(os.environ.get("YOUTUBE_API_KEY") or None)
    return YouTube(transport, budget=cfg["daily_budget"], used=research.quota_used_today())


def api_failure(error):
    print(f"\nStopped: {error}")
    if isinstance(error, ApiError) and error.is_auth:
        print(KEY_HELP)
    elif isinstance(error, QuotaExhausted):
        print("Progress is saved. Run the same command after the quota resets (midnight Pacific) to continue.")


def outlier_table(rows):
    print(f"{'#':>3}  {'×':>9}  {'views':>11}  {'published':<10}  {'channel':<24}  title")
    for i, row in enumerate(rows, 1):
        print(f"{i:>3}  {fmt_x(row):>9}  {fmt_int(row.get('views')):>11}  {str(row.get('published_at', ''))[:10]:<10}  "
              f"{short(row.get('channel_title'), 24):<24}  {short(row.get('title'), 80)}")


# ---------------------------------------------------------------- research commands

def cmd_research(args):
    overrides = {
        "outlier_threshold": args.threshold, "min_views": args.min_views, "max_depth": args.max_depth,
        "daily_budget": args.budget, "related": True if args.related else None,
        "published_after": research.since_date(args.since) + "T00:00:00Z" if args.since else None,
    }
    cfg = research.load_config(overrides)
    yt = client(cfg)
    session = research.Research(yt, cfg)
    if args.fresh:
        session.reset()
    added = session.push_seeds(args.query, shallow=args.shallow, front=True) if args.query else session.push_seeds(research.read_seeds())
    stack = session.state["stack"]
    if not stack:
        print("Nothing to explore. Add search terms to research/seeds.txt or pass --query \"…\".\n"
              "Terms already searched are skipped; --fresh forgets them (e.g. for a monthly refresh with --since 60d).")
        return 1
    print(f"Exploring {research.plural(len(stack), 'queued node')} ({added} new). "
          f"Quota used today: {yt.used:,}/{yt.budget:,} units.\n")
    status = 0
    try:
        session.run(max_nodes=args.max_nodes)
    except (QuotaExhausted, ApiError) as error:
        api_failure(error)
        status = 0 if isinstance(error, QuotaExhausted) else 2
    except KeyboardInterrupt:
        print("\nInterrupted. Progress is saved; run again to continue.")
        status = 130
    rows = research.database_rows()
    print(f"\nExplored {len(session.trace)} nodes. New outliers this run: {len(session.found)}.")
    if session.found:
        outlier_table(sorted(session.found, key=research.strength, reverse=True)[:10])
    print(f"Database: {len(rows):,} videos scored · {sum(research.is_hit(r) for r in rows):,} outliers · "
          f"{research.plural(len(stack), 'node')} waiting · quota used today {yt.used:,}/{yt.budget:,}")
    print("Next: yt.py summary · yt.py top · yt.py pattern \"<format>\"")
    return status


def cmd_add(args):
    video_id = video_id_from(args.url)
    if not video_id:
        print("No video ID found in that URL.")
        return 1
    cfg = research.load_config()
    session = research.Research(client(cfg), cfg)
    try:
        row, video = session.add(video_id, note=args.note or "", seed=args.seed or "")
    except (QuotaExhausted, ApiError) as error:
        api_failure(error)
        return 2
    except LookupError as error:
        print(error)
        return 1
    verdict = "OUTLIER" if research.is_hit(row) else "not an outlier"
    print(f"{short(row['title'], 80)} — {row.get('channel_title', '')}")
    print(f"{fmt_int(row['views'])} views · {fmt_x(row)} (basis: {row.get('basis') or 'none'}) · {verdict}")
    if not research.is_longform(video, cfg):
        print("Note: this looks like a Short or a live stream, so it isn't comparable with long-form baselines.")
    return 0


def cmd_summary(args):
    print(research.summary_text(research.load_config()))
    return 0


def cmd_top(args):
    rows = research.top_rows(research.load_config(), n=args.n, seed=args.seed, grep=args.grep, since=args.since)
    if not rows:
        print("No outliers match. Run `yt.py research` first, or loosen the filters.")
        return 1
    outlier_table(rows)
    return 0


def cmd_pattern(args):
    cfg = research.load_config()
    stats = research.pattern_stats(cfg, args.regex, examples=args.examples)
    if not stats["base_n"]:
        print("The research database is empty. Run `yt.py research` first.")
        return 1
    if not stats["n"]:
        print(f"No scored video titles match /{args.regex}/. Gather examples with:\n"
              f"  yt.py research --query \"<the format's key phrase>\" --shallow")
        return 1
    lift = stats["rate"] / stats["base_rate"] if stats["base_rate"] else None
    print(f"/{args.regex}/: {stats['n']:,} videos on {stats['channels']:,} channels")
    print(f"Hit rate: {stats['hits']}/{stats['n']} = {stats['rate']:.0%} (≥{cfg['outlier_threshold']:g}× baseline and "
          f"≥{cfg['min_views']:,} views) vs. {stats['base_rate']:.0%} across all {stats['base_n']:,} scored videos"
          + (f" → {lift:.1f}× lift" if lift else ""))
    if stats["median_x"] is not None:
        print(f"Median: {stats['median_x']:.2f}× baseline (all scored videos: {stats['base_median_x']:.2f}×)")
    for heading, rows in (("Winners:", stats["winners"]), ("Losers (study these: what did they do differently?):", stats["losers"])):
        print("\n" + heading)
        if rows:
            outlier_table(rows)
        else:
            print("  none")
    if stats["n"] < 10:
        print("\nSmall sample. Gather more examples with: yt.py research --query \"<phrase>\" --shallow")
    print("Caveat: the database leans toward channels that came up in your searches. Treat this as directional.")
    return 0


# ---------------------------------------------------------------- your videos

def cmd_new(args):
    slug, file = pipeline.new_video(args.title)
    print(f"Created {os.path.relpath(file, store.home())} and a row in data/videos.csv.\nNext stage: 2 Validate.")
    return 0


def cmd_log(args):
    try:
        slug = pipeline.resolve_slug(args.slug)
    except LookupError as error:
        print(error)
        return 1
    values = {
        "views": args.views, "impressions": args.impressions, "ctr_pct": args.ctr, "avg_pct_viewed": args.avg_viewed,
        "subs": args.subs, "leads": args.leads, "calls": args.calls, "customers": args.customers, "revenue": args.revenue,
    }
    values = {k: store.num(v) for k, v in values.items() if v is not None}
    try:
        row = funnel.log_checkpoint(slug, args.at, values, date=args.date)
    except ValueError as error:
        print(error)
        return 1
    print(f"Logged {slug} {row['checkpoint']}: " + ", ".join(f"{k}={row[k]}" for k in funnel.METRIC_FIELDS[3:] if row.get(k) not in (None, "")))
    videos, metrics, targets = funnel.load()
    print()
    print(funnel.render(funnel.diagnose(slug, row["checkpoint"], videos, metrics, targets)))
    return 0


def cmd_diagnose(args):
    videos, metrics, targets = funnel.load()
    if args.slug:
        try:
            slug = pipeline.resolve_slug(args.slug)
        except LookupError as error:
            print(error)
            return 1
        checkpoint = (args.at or funnel.latest_checkpoint(slug, metrics) or "").upper()
        result = funnel.diagnose(slug, checkpoint, videos, metrics, targets) if checkpoint else None
        if result is None:
            print(f"No metrics logged for {slug}{' at ' + checkpoint if checkpoint else ''}. Use: yt.py log {slug} --at D7 --views …")
            return 1
        print(funnel.render(result))
        return 0
    diagnoses = []
    for slug in funnel.order(videos, metrics):
        checkpoint = (args.at or funnel.latest_checkpoint(slug, metrics) or "").upper()
        if checkpoint and (slug, checkpoint) in metrics:
            diagnoses.append(funnel.diagnose(slug, checkpoint, videos, metrics, targets))
    print(funnel.render_overview(diagnoses, metrics, targets))
    return 0


def cmd_status(args):
    version, learned = pipeline.rules_info()
    rows = research.database_rows()
    state = store.read_json(research.research_path("state.json"), {})
    seeds = research.read_seeds()
    print(f"Rules v{version} · {learned} learned rules")
    print(f"Research: {research.plural(len(seeds), 'seed')} · {len(rows):,} videos scored · "
          f"{sum(research.is_hit(r) for r in rows):,} outliers · {research.plural(len(state.get('stack', [])), 'node')} waiting · "
          f"quota used today {research.quota_used_today():,}")
    statuses = pipeline.video_status()
    print("\nVideos:" if statuses else "\nVideos: none yet (yt.py new \"<idea>\" or /yt-produce)")
    for slug, step, due in statuses:
        print(f"  {slug:<44} next: {step}" + (f" (due {due})" if due else ""))
    return 0


# ---------------------------------------------------------------- parser

def build_parser():
    parser = argparse.ArgumentParser(prog="yt.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("research", help="depth-first crawl for outliers (run again to continue)")
    p.add_argument("--query", action="append", help="search this term next instead of seeds.txt (repeatable)")
    p.add_argument("--shallow", action="store_true", help="with --query: score the results only, don't branch (format tests)")
    p.add_argument("--fresh", action="store_true", help="forget the stack and searched terms (keeps the database)")
    p.add_argument("--since", help="only search videos published after this: 90d or YYYY-MM-DD")
    p.add_argument("--related", action="store_true", help="approximate recommendations with title searches (100 units each)")
    p.add_argument("--threshold", type=float, help="outlier multiple (default 3)")
    p.add_argument("--min-views", type=int, help="minimum views for an outlier (default 10000)")
    p.add_argument("--max-depth", type=int, help="maximum DFS depth (default 4)")
    p.add_argument("--budget", type=int, help="quota units this engine may use today (default 9000)")
    p.add_argument("--max-nodes", type=int, help="stop after exploring this many nodes")
    p.set_defaults(func=cmd_research)

    p = sub.add_parser("add", help="log a video by URL, scored against its own channel")
    p.add_argument("url")
    p.add_argument("--note", help="e.g. 'recommended next to <outlier>'")
    p.add_argument("--seed", help="the seed or topic it belongs to")
    p.set_defaults(func=cmd_add)

    p = sub.add_parser("summary", help="outliers per seed, dead branches")
    p.set_defaults(func=cmd_summary)

    p = sub.add_parser("top", help="the strongest outliers")
    p.add_argument("--n", type=int, default=30)
    p.add_argument("--seed")
    p.add_argument("--grep", help="regex on the title")
    p.add_argument("--since", help="published after: 90d or YYYY-MM-DD")
    p.set_defaults(func=cmd_top)

    p = sub.add_parser("pattern", help="hit rate of a title pattern, winners and losers")
    p.add_argument("regex")
    p.add_argument("--examples", type=int, default=5)
    p.set_defaults(func=cmd_pattern)

    p = sub.add_parser("new", help="start a video: videos/NNN-slug/video.md")
    p.add_argument("title")
    p.set_defaults(func=cmd_new)

    p = sub.add_parser("log", help="record checkpoint metrics for a video")
    p.add_argument("slug", help="full slug or its number, e.g. 003")
    p.add_argument("--at", required=True, help="checkpoint: D2, D7, D28, D90")
    p.add_argument("--date", help="YYYY-MM-DD (default today)")
    for flag, help_text in (("--views", None), ("--impressions", None), ("--ctr", "click-through rate, %"),
                            ("--avg-viewed", "average percentage viewed, %"), ("--subs", "subscribers gained"),
                            ("--leads", None), ("--calls", "qualified calls"), ("--customers", None), ("--revenue", None)):
        p.add_argument(flag, help=help_text)
    p.set_defaults(func=cmd_log)

    p = sub.add_parser("diagnose", help="funnel bottleneck for a video, or the channel overview")
    p.add_argument("slug", nargs="?")
    p.add_argument("--at", help="checkpoint (default: latest logged)")
    p.set_defaults(func=cmd_diagnose)

    p = sub.add_parser("status", help="pipeline status")
    p.set_defaults(func=cmd_status)
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
