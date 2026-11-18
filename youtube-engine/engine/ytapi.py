"""Minimal YouTube Data API v3 client with quota accounting. Standard library only.

Quota cost per call: search 100 · videos 1 · channels 1 · playlistItems 1.
A Google Cloud project gets 10,000 units a day by default, reset at midnight Pacific time.

The API key is sent in the X-Goog-Api-Key header, never in the URL. If YOUTUBE_API_KEY is unset the
request goes out without a key, so a proxy that injects the header (Claude Code cloud network
secrets) still works.
"""

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://www.googleapis.com/youtube/v3/"
COST = {"search": 100, "videos": 1, "channels": 1, "playlistItems": 1}

KEY_HELP = """\
The YouTube API rejected the request because no valid API key was sent.
  1. Google Cloud console → create a project → enable "YouTube Data API v3"
     → Credentials → Create credentials → API key (restrict it to YouTube Data API v3).
  2. Local machine:  export YOUTUBE_API_KEY=<your key>
     Claude Code cloud: store it as a network secret for www.googleapis.com,
     header X-Goog-Api-Key (Claude can ask for it through a secure form).
Without a key, use the manual research procedure in PIPELINE.md (research/manual.csv)."""


class QuotaExhausted(Exception):
    """The run budget or the project's daily quota is used up."""


class ApiError(Exception):
    def __init__(self, message, status=None, reason=""):
        super().__init__(message)
        self.status = status
        self.reason = reason

    @property
    def is_auth(self):
        return self.status in (400, 401, 403) and any(
            r in self.reason for r in ("API_KEY", "forbidden", "ACCESS_DENIED", "keyInvalid", "PERMISSION_DENIED")
        )


def _error_details(body):
    try:
        error = json.loads(body).get("error", {})
    except ValueError:
        return "", body[:200]
    reasons = [e.get("reason", "") for e in error.get("errors", []) if isinstance(e, dict)]
    reasons += [d.get("reason", "") for d in error.get("details", []) if isinstance(d, dict)]
    reasons.append(error.get("status", ""))
    return ",".join(r for r in reasons if r), error.get("message", "")


def http_transport(api_key=None, timeout=30, retries=3, sleep=time.sleep):
    """Return call(endpoint, params) → parsed JSON, with retries on network and server errors."""
    headers = {"Accept": "application/json", "User-Agent": "youtube-growth-engine/1.0"}
    if api_key:
        headers["X-Goog-Api-Key"] = api_key

    def call(endpoint, params):
        url = API + endpoint + "?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, headers=headers)
        for attempt in range(retries + 1):
            try:
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    return json.load(response)
            except urllib.error.HTTPError as e:
                reason, message = _error_details(e.read().decode("utf-8", "replace"))
                if "quotaExceeded" in reason or "dailyLimitExceeded" in reason:
                    raise QuotaExhausted("the project's daily YouTube API quota is used up (resets at midnight Pacific)")
                if (e.code >= 500 or "rateLimitExceeded" in reason) and attempt < retries:
                    sleep(2 ** attempt)
                    continue
                raise ApiError(f"{endpoint}: HTTP {e.code} {reason}: {message}", e.code, reason)
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if attempt < retries:
                    sleep(2 ** attempt)
                    continue
                raise ApiError(f"{endpoint}: network error: {e}")
        raise ApiError(f"{endpoint}: gave up after {retries + 1} attempts")

    return call


class YouTube:
    """The four read-only endpoints the research crawl needs, with a per-run quota budget."""

    def __init__(self, transport, budget=9000, used=0):
        self.transport = transport
        self.budget = budget
        self.used = used

    def _call(self, endpoint, **params):
        cost = COST[endpoint]
        if self.used + cost > self.budget:
            raise QuotaExhausted(f"today's budget of {self.budget:,} units is reached")
        self.used += cost  # Google bills failed calls too…
        try:
            return self.transport(endpoint, {k: v for k, v in params.items() if v not in (None, "")})
        except ApiError as error:
            if error.is_auth:  # …except requests without a valid key, which no project is billed for
                self.used -= cost
            raise

    def search(self, query, published_after="", region="", language="", max_results=50):
        data = self._call(
            "search", part="snippet", q=query, type="video", maxResults=max_results,
            publishedAfter=published_after, regionCode=region, relevanceLanguage=language,
        )
        hits = []
        for item in data.get("items", []):
            video_id = (item.get("id") or {}).get("videoId")
            if video_id:
                hits.append({"video_id": video_id, "channel_id": item.get("snippet", {}).get("channelId", "")})
        return hits

    def videos(self, ids):
        ids = list(dict.fromkeys(i for i in ids if i))
        out = []
        for start in range(0, len(ids), 50):
            data = self._call(
                "videos", part="snippet,statistics,contentDetails,liveStreamingDetails",
                id=",".join(ids[start:start + 50]),
            )
            out.extend(parse_video(item) for item in data.get("items", []))
        return out

    def channels(self, ids):
        ids = list(dict.fromkeys(i for i in ids if i))
        out = {}
        for start in range(0, len(ids), 50):
            data = self._call("channels", part="snippet,statistics,contentDetails", id=",".join(ids[start:start + 50]))
            for item in data.get("items", []):
                stats = item.get("statistics", {})
                out[item["id"]] = {
                    "channel_id": item["id"],
                    "title": item.get("snippet", {}).get("title", ""),
                    "subs": None if stats.get("hiddenSubscriberCount") else _int(stats.get("subscriberCount")),
                    "uploads": item.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads", ""),
                }
        return out

    def playlist_page(self, playlist_id, page_token=""):
        data = self._call("playlistItems", part="contentDetails", playlistId=playlist_id, maxResults=50, pageToken=page_token)
        ids = [item.get("contentDetails", {}).get("videoId") for item in data.get("items", [])]
        return [i for i in ids if i], data.get("nextPageToken", "")


def parse_video(item):
    snippet = item.get("snippet", {})
    stats = item.get("statistics", {})
    return {
        "video_id": item.get("id", ""),
        "channel_id": snippet.get("channelId", ""),
        "channel_title": snippet.get("channelTitle", ""),
        "title": snippet.get("title", ""),
        "published_at": snippet.get("publishedAt", ""),
        "duration_s": iso_duration(item.get("contentDetails", {}).get("duration", "")),
        "views": _int(stats.get("viewCount")) or 0,
        "likes": _int(stats.get("likeCount")),
        "comments": _int(stats.get("commentCount")),
        "live": bool(item.get("liveStreamingDetails")) or snippet.get("liveBroadcastContent", "none") != "none",
    }


_DURATION = re.compile(r"^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$")


def iso_duration(text):
    """ISO 8601 duration → seconds ('PT1H2M3S' → 3723). Unparseable → 0."""
    match = _DURATION.match(text or "")
    if not match:
        return 0
    weeks, days, hours, minutes, seconds = (int(g) if g else 0 for g in match.groups())
    return (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds


_VIDEO_ID = re.compile(r"(?:[?&]v=|youtu\.be/|/shorts/|/live/|/embed/)([A-Za-z0-9_-]{11})")


def video_id_from(text):
    """A video ID from a URL or a bare 11-character ID; None if there isn't one."""
    text = (text or "").strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", text):
        return text
    match = _VIDEO_ID.search(text)
    return match.group(1) if match else None


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
