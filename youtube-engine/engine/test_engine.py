"""Engine tests against an in-memory fake of the YouTube Data API.

Run from the repo root:  python3 -m unittest discover -s youtube-engine/engine -p "test_*.py"
"""

import csv
import datetime as dt
import io
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import funnel  # noqa: E402
import pipeline  # noqa: E402
import research  # noqa: E402
import store  # noqa: E402
import yt  # noqa: E402
from ytapi import ApiError, QuotaExhausted, YouTube, _error_details, iso_duration, video_id_from  # noqa: E402

NOW = dt.datetime(2026, 11, 18, 12, tzinfo=dt.timezone.utc)


class FakeAPI:
    """Stand-in for the YouTube Data API: same parameters in, same response shapes out."""

    def __init__(self):
        self.channels, self.videos, self.searches, self.calls = {}, {}, {}, []

    def add_channel(self, channel_id, title, subs, base_views, count=30, specials=None, days_ago=400, every=7):
        ids = []
        for i in range(count):
            video_id = f"{channel_id}-{i:03d}"
            views, video_title = base_views + (i % 5 - 2) * base_views // 20, f"{title} video {i}"
            if specials and i in specials:
                views, video_title = specials[i]
            published = NOW - dt.timedelta(days=days_ago - i * every)
            self.videos[video_id] = {"channel": channel_id, "channel_title": title, "title": video_title,
                                     "published": published.strftime("%Y-%m-%dT%H:%M:%SZ"), "views": views}
            ids.append(video_id)
        self.channels[channel_id] = {"title": title, "subs": subs, "uploads": ids[::-1]}  # newest first

    def __call__(self, endpoint, params):
        self.calls.append((endpoint, dict(params)))
        if endpoint == "search":
            return {"items": [{"id": {"kind": "youtube#video", "videoId": v},
                               "snippet": {"channelId": self.videos[v]["channel"]}}
                              for v in self.searches.get(params["q"], [])]}
        if endpoint == "videos":
            return {"items": [{
                "id": v,
                "snippet": {"channelId": d["channel"], "channelTitle": d["channel_title"], "title": d["title"],
                            "publishedAt": d["published"], "liveBroadcastContent": "none"},
                "statistics": {"viewCount": str(d["views"])},
                "contentDetails": {"duration": "PT12M30S"},
            } for v in params["id"].split(",") for d in [self.videos.get(v)] if d]}
        if endpoint == "channels":
            return {"items": [{
                "id": c, "snippet": {"title": d["title"]},
                "statistics": {"subscriberCount": str(d["subs"]), "hiddenSubscriberCount": False},
                "contentDetails": {"relatedPlaylists": {"uploads": "UU" + c[2:]}},
            } for c in params["id"].split(",") for d in [self.channels.get(c)] if d]}
        if endpoint == "playlistItems":
            uploads = self.channels["UC" + params["playlistId"][2:]]["uploads"]
            start = int(params.get("pageToken") or 0)
            page = {"items": [{"contentDetails": {"videoId": v}} for v in uploads[start:start + 50]]}
            if start + 50 < len(uploads):
                page["nextPageToken"] = str(start + 50)
            return page
        raise AssertionError(f"unexpected endpoint {endpoint}")

    def count(self, endpoint, **match):
        return sum(1 for e, p in self.calls if e == endpoint and all(p.get(k) == v for k, v in match.items()))


def niche(api):
    """A small visceral-fat niche: one standout per channel, plus a big channel whose big video is ordinary for it."""
    api.add_channel("UCA", "Channel A", 20000, 1000, specials={
        10: (50000, "How to lose visceral fat so fast it feels like cheating"),
        20: (20000, "Visceral fat mistakes nobody talks about"),
    })
    api.add_channel("UCB", "Channel B", 90000, 5000, specials={
        5: (40000, "If you don't understand insulin, you don't understand fat loss"),
    })
    api.add_channel("UCC", "Channel C", 2000000, 100000, specials={3: (150000, "Visceral fat explained")})
    api.searches["lose visceral fat"] = ["UCC-003", "UCA-010", "UCB-005"]
    api.searches["insulin resistance"] = ["UCB-005"]


class EngineTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.home = os.path.join(self.tmp, "youtube-engine")
        shutil.copytree(os.path.dirname(HERE), self.home, ignore=shutil.ignore_patterns("engine", "__pycache__"))
        for name in ("videos.csv", "outliers.csv", "channels.csv", "state.json"):
            path = os.path.join(self.home, "research", name)
            if os.path.exists(path):
                os.remove(path)
        for folder in os.listdir(os.path.join(self.home, "videos")):
            if re.match(r"^\d{3}-", folder):
                shutil.rmtree(os.path.join(self.home, "videos", folder))
        os.environ["YT_ENGINE_HOME"] = self.home
        store.write_csv(funnel.videos_path(), [], funnel.VIDEO_FIELDS)
        store.write_csv(funnel.metrics_path(), [], funnel.METRIC_FIELDS)
        store.write_csv(research.research_path("manual.csv"), [], research_manual_fields())
        self.cfg = research.load_config()
        self.api = FakeAPI()
        niche(self.api)

    def tearDown(self):
        os.environ.pop("YT_ENGINE_HOME", None)
        shutil.rmtree(self.tmp)

    def session(self, budget=10000, **cfg):
        config = dict(self.cfg, **cfg)
        return research.Research(YouTube(self.api, budget=budget), config, now=NOW, echo=lambda *_: None)


def research_manual_fields():
    return ["url", "title", "channel_title", "views", "channel_typical_views", "published", "seed", "found_via", "note"]


class ParsingTests(unittest.TestCase):
    def test_durations(self):
        self.assertEqual(iso_duration("PT1H2M3S"), 3723)
        self.assertEqual(iso_duration("PT15M"), 900)
        self.assertEqual(iso_duration("P1DT1S"), 86401)
        self.assertEqual(iso_duration("P0D"), 0)
        self.assertEqual(iso_duration(""), 0)

    def test_video_ids(self):
        self.assertEqual(video_id_from("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12"), "dQw4w9WgXcQ")
        self.assertEqual(video_id_from("https://youtu.be/dQw4w9WgXcQ?si=x"), "dQw4w9WgXcQ")
        self.assertEqual(video_id_from("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertEqual(video_id_from("dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertIsNone(video_id_from("https://www.youtube.com/@channel"))

    def test_api_error_shapes(self):
        # Bodies as returned by the live API (captured with a dummy key / no key / exhausted quota).
        invalid = {"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.",
                             "errors": [{"reason": "badRequest"}], "status": "INVALID_ARGUMENT",
                             "details": [{"reason": "API_KEY_INVALID"}]}}
        missing = {"error": {"code": 403, "message": "Permission denied on the service.",
                             "errors": [{"reason": "forbidden"}], "status": "PERMISSION_DENIED",
                             "details": [{"reason": "ACCESS_DENIED"}]}}
        reason, message = _error_details(json.dumps(invalid))
        self.assertIn("API_KEY_INVALID", reason)
        self.assertTrue(ApiError(message, 400, reason).is_auth)
        reason, _ = _error_details(json.dumps(missing))
        self.assertTrue(ApiError("", 403, reason).is_auth)
        self.assertFalse(ApiError("", 404, "playlistNotFound").is_auth)

    def test_rejected_key_is_not_charged(self):
        def reject(endpoint, params):
            raise ApiError("no key", 403, "forbidden,ACCESS_DENIED")
        client = YouTube(reject, budget=1000)
        with self.assertRaises(ApiError):
            client.search("anything")
        self.assertEqual(client.used, 0)

    def test_budget_is_enforced_before_the_call(self):
        api = FakeAPI()
        client = YouTube(api, budget=150, used=60)
        with self.assertRaises(QuotaExhausted):
            client.search("anything")
        self.assertEqual(api.calls, [])


class ScoringTests(unittest.TestCase):
    cfg = research.DEFAULTS

    def videos(self, views, newest_days_ago=30, every=7):
        count = len(views)
        return [{"video_id": f"v{i}", "views": v, "published_at":
                 (NOW - dt.timedelta(days=newest_days_ago + (count - 1 - i) * every)).isoformat()} for i, v in enumerate(views)]

    def test_outlier_is_relative_to_its_own_channel(self):
        small = self.videos([1000] * 15 + [50000] + [1000] * 14)
        research.score_channel_videos(small, 20000, self.cfg, NOW)
        hit = small[15]
        self.assertEqual(hit["outlier_x"], 50.0)
        self.assertEqual(hit["is_outlier"], 1)
        self.assertEqual(sum(v["is_outlier"] for v in small), 1)

        big = self.videos([100000] * 15 + [150000] + [100000] * 14)
        research.score_channel_videos(big, 2000000, self.cfg, NOW)
        self.assertEqual(big[15]["outlier_x"], 1.5)
        self.assertEqual(big[15]["is_outlier"], 0)

    def test_young_videos_are_judged_late_and_kept_out_of_baselines(self):
        views = [1000] * 20 + [40000, 40000]
        videos = self.videos(views, newest_days_ago=1, every=3)  # last two are 1 and 4 days old
        research.score_channel_videos(videos, None, self.cfg, NOW)
        self.assertEqual(videos[-1]["is_outlier"], 0, "a 1-day-old video is too young to judge")
        self.assertEqual(videos[-2]["is_outlier"], 1, "a 4-day-old video at 40× is an outlier")
        self.assertEqual(videos[-2]["baseline_views"], 1000, "young videos stay out of the baseline")

    def test_channel_with_too_few_uploads_falls_back_to_subscribers(self):
        videos = self.videos([30000, 2000, 1500])
        research.score_channel_videos(videos, 10000, self.cfg, NOW)
        self.assertEqual(videos[0]["basis"], "subs")
        self.assertEqual(videos[0]["is_outlier"], 1)  # 3 views per subscriber
        self.assertEqual(videos[1]["is_outlier"], 0)  # under min_views


class CrawlTests(EngineTest):
    def test_depth_first_order_and_records(self):
        s = self.session()
        s.push_seeds(["lose visceral fat", "insulin resistance"])
        s.run()
        self.assertEqual(s.trace, ["q:lose visceral fat", "v:UCA-010", "c:UCA", "v:UCB-005", "c:UCB", "q:insulin resistance"])

        db = s.db
        self.assertEqual(db["UCA-010"]["found_via"], "search: lose visceral fat")
        self.assertEqual(db["UCA-020"]["found_via"], "channel: Channel A")
        self.assertEqual(db["UCA-020"]["seed"], "lose visceral fat")
        self.assertEqual(db["UCC-003"]["is_outlier"], 0, "150K on a 100K channel is not an outlier")
        self.assertEqual(s.state["seed_stats"]["insulin resistance"]["outliers"], 1)

        with open(research.research_path("outliers.csv"), newline="", encoding="utf-8") as f:
            outliers = list(csv.DictReader(f))
        self.assertEqual([r["video_id"] for r in outliers], ["UCA-010", "UCA-020", "UCB-005"])
        self.assertEqual(len(research.database_rows()), 90)
        self.assertEqual(self.api.count("search"), 2)

        summary = research.summary_text(self.cfg)
        self.assertIn("| insulin resistance | 1 | 1 | 0 | If you don't understand insulin", summary,
                      "a seed gets credit for outliers an earlier seed logged first")

    def test_quota_stop_resumes_without_paying_for_the_search_twice(self):
        s = self.session(budget=105)
        s.push_seeds(["lose visceral fat"])
        with self.assertRaises(QuotaExhausted):
            s.run()
        state = store.read_json(research.research_path("state.json"), {})
        self.assertEqual(state["stack"][-1]["q"], "lose visceral fat")
        self.assertIn("lose visceral fat", state["search_cache"])

        resumed = self.session()
        resumed.run()
        self.assertEqual(self.api.count("search", q="lose visceral fat"), 1)
        self.assertEqual(self.api.count("channels"), 2, "the channel finished before the stop is not fetched again")
        self.assertTrue(research.is_hit(resumed.db["UCA-010"]))
        self.assertEqual(resumed.state["search_cache"], {})

    def test_seeds_are_not_repeated_and_new_seeds_wait_for_open_branches(self):
        s = self.session()
        s.push_seeds(["lose visceral fat"])
        s.run(max_nodes=2)  # search + first video explored; its channel is still on the stack
        s.push_seeds(["lose visceral fat", "insulin resistance"])
        self.assertEqual([n["type"] for n in s.state["stack"]][-1], "channel", "open branch stays on top")
        self.assertEqual(s.state["stack"][0]["q"], "insulin resistance")
        self.assertEqual(sum(1 for n in s.state["stack"] if n.get("q") == "lose visceral fat"), 0)

    def test_related_search_stands_in_for_recommendations(self):
        self.api.add_channel("UCD", "Channel D", 5000, 2000, specials={4: (30000, "Visceral fat after 40")})
        title = self.api.videos["UCA-010"]["title"]
        self.api.searches[research.related_query(title)] = ["UCA-010", "UCD-004"]
        s = self.session(related=True)
        s.push_seeds(["lose visceral fat"])
        s.run()
        self.assertLess(s.trace.index("c:UCA"), s.trace.index("q:" + research.related_query(title).lower()))
        self.assertEqual(s.db["UCD-004"]["found_via"], "related: " + research.related_query(title))
        self.assertEqual(s.db["UCD-004"]["is_outlier"], 1)

    def test_pattern_reports_winners_and_losers(self):
        s = self.session()
        s.push_seeds(["lose visceral fat"])
        s.run()
        stats = research.pattern_stats(self.cfg, r"visceral fat")
        self.assertEqual((stats["n"], stats["hits"]), (3, 2))
        self.assertEqual(stats["winners"][0]["video_id"], "UCA-010")
        self.assertEqual(stats["losers"][0]["video_id"], "UCC-003")
        self.assertEqual(stats["base_n"], 90)

    def test_manual_rows_join_outliers_and_patterns(self):
        rows = [
            {"url": "https://youtu.be/abcdefghijk", "title": "Visceral fat: the 3 foods", "channel_title": "VA find",
             "views": "60,000", "channel_typical_views": "10000", "seed": "visceral fat foods"},
            {"url": "https://youtu.be/bcdefghijkl", "title": "Visceral fat myths", "channel_title": "VA find",
             "views": "20000", "channel_typical_views": "15000"},
        ]
        store.write_csv(research.research_path("manual.csv"), rows, research_manual_fields())
        research.write_outliers(self.cfg, {})
        outliers = store.read_csv(research.research_path("outliers.csv"))
        self.assertEqual([r["video_id"] for r in outliers], ["abcdefghijk"])
        self.assertEqual(outliers[0]["outlier_x"], "6.0")
        stats = research.pattern_stats(self.cfg, "visceral")
        self.assertEqual((stats["n"], stats["hits"]), (2, 1))

    def test_add_scores_a_hand_found_video(self):
        s = self.session()
        row, _ = s.add("UCA-020", note="recommended next to UCA-010")
        self.assertEqual(row["found_via"], "manual: recommended next to UCA-010")
        self.assertTrue(research.is_hit(row))


class FunnelTests(EngineTest):
    def write(self, rows):
        store.write_csv(funnel.videos_path(), [{"slug": s, "published": f"2026-0{i + 1}-01"} for i, (s, _) in enumerate(rows)],
                        funnel.VIDEO_FIELDS)
        for slug, (views, leads, calls, customers) in rows:
            funnel.log_checkpoint(slug, "D28", {"views": views, "leads": leads, "calls": calls, "customers": customers,
                                                "revenue": customers * 2000}, date="2026-06-01")
        return funnel.load()

    def test_names_the_weakest_stage_against_your_own_history(self):
        history = [(f"00{i}-v", (10000, 50, 10, 3)) for i in range(1, 5)]
        videos, metrics, targets = self.write(history + [("005-v", (12000, 60, 3, 1))])
        d = funnel.diagnose("005-v", "D28", videos, metrics, targets)
        self.assertEqual(d["bottleneck"]["stage"], "booking")
        self.assertAlmostEqual(d["stages"][0]["ratio"], 1.2)
        self.assertIn("Call booking", funnel.render(d))

    def test_flags_an_off_topic_hit(self):
        history = [(f"00{i}-v", (10000, 50, 10, 3)) for i in range(1, 5)]
        videos, metrics, targets = self.write(history + [("005-v", (40000, 20, 4, 1))])
        d = funnel.diagnose("005-v", "D28", videos, metrics, targets)
        self.assertEqual(d["bottleneck"]["stage"], "capture")
        self.assertTrue(any("off-topic" in n for n in d["notes"]))

    def test_uses_targets_until_there_is_history(self):
        store.write_json(store.path("data", "targets.json"),
                         {"leads_per_1k_views": 5, "lead_to_call_pct": 20, "call_to_customer_pct": 30})
        videos, metrics, targets = self.write([("001-v", (10000, 50, 2, 1))])
        d = funnel.diagnose("001-v", "D28", videos, metrics, targets)
        self.assertIsNone(d["stages"][0]["ratio"], "no traffic baseline from one video")
        self.assertEqual(d["bottleneck"]["stage"], "booking")
        self.assertEqual(d["bottleneck"]["source"], "target")


class CliTests(EngineTest):
    def run_cli(self, *argv):
        out = io.StringIO()
        with redirect_stdout(out):
            code = yt.main(list(argv))
        return code, out.getvalue()

    def test_new_status_log_flow(self):
        code, _ = self.run_cli("new", "How to lose visceral fat so fast it feels like cheating")
        self.assertEqual(code, 0)
        slug = "001-how-to-lose-visceral-fat-so"
        md = store.path("videos", slug, "video.md")
        self.assertTrue(os.path.exists(md))
        self.assertEqual(store.read_csv(funnel.videos_path())[0]["slug"], slug)
        self.assertIn("next: 2 Validate", self.run_cli("status")[1])

        with open(md, encoding="utf-8") as f:
            text = f.read()
        for label in ("2 Validate", "3 Package", "4 Hook", "5 Structure", "6 CTA", "7 Preflight & bets", "Published"):
            text = text.replace(f"- [ ] {label}\n", f"- [x] {label}\n", 1)
        with open(md, "w", encoding="utf-8") as f:
            f.write(text)
        rows = store.read_csv(funnel.videos_path())
        rows[0]["published"] = "2026-11-10"
        store.write_csv(funnel.videos_path(), rows, funnel.VIDEO_FIELDS)
        self.assertIn("next: 8 Review D2 (due 2026-11-12)", self.run_cli("status")[1])

        code, out = self.run_cli("log", "1", "--at", "d7", "--views", "1,200", "--leads", "3", "--ctr", "5.5%")
        self.assertEqual(code, 0)
        row = store.read_csv(funnel.metrics_path())[0]
        self.assertEqual((row["checkpoint"], row["views"], row["ctr_pct"]), ("D7", "1200", "5.5"))

    def test_rules_version_ignores_the_template_example(self):
        self.assertEqual(pipeline.rules_info(), ("1.0.0", 0))

    def test_research_without_seeds_makes_no_api_calls(self):
        code, out = self.run_cli("research")
        self.assertEqual(code, 1)
        self.assertIn("Nothing to explore", out)

    def test_diagnose_without_data(self):
        code, out = self.run_cli("diagnose")
        self.assertEqual(code, 0)
        self.assertIn("No checkpoints logged yet", out)


if __name__ == "__main__":
    unittest.main()
