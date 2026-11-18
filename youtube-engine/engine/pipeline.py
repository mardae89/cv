"""Video scaffolding and pipeline status."""

import datetime as dt
import os
import re

import funnel
import store

CHECKLIST_ITEM = re.compile(r"^- \[( |x|X)\] (.+?)\s*$")
VIDEO_DIR = re.compile(r"^\d{3}-")


def slugify(title, words=6):
    return "-".join(re.sub(r"[^a-z0-9]+", " ", title.lower()).split()[:words]) or "video"


def video_slugs():
    folder = store.path("videos")
    if not os.path.isdir(folder):
        return []
    return sorted(d for d in os.listdir(folder) if VIDEO_DIR.match(d) and os.path.isdir(os.path.join(folder, d)))


def new_video(title, today=None):
    """Create videos/NNN-slug/video.md from the template and add the video to data/videos.csv."""
    today = today or dt.date.today().isoformat()
    number = max((int(s[:3]) for s in video_slugs()), default=0) + 1
    slug = f"{number:03d}-{slugify(title)}"
    folder = store.path("videos", slug)
    os.makedirs(folder)
    with open(store.path("videos", "_TEMPLATE.md"), encoding="utf-8") as f:
        text = f.read().replace("{{SLUG}}", slug).replace("{{TITLE}}", title).replace("{{DATE}}", today)
    file = os.path.join(folder, "video.md")
    with open(file, "w", encoding="utf-8") as f:
        f.write(text)
    rows = store.read_csv(funnel.videos_path())
    rows.append({"slug": slug, "title": title})
    store.write_csv(funnel.videos_path(), rows, funnel.VIDEO_FIELDS)
    return slug, file


def resolve_slug(text):
    """'3', '003' or '003-lose-visceral' → the full slug. Raises LookupError if none or several match."""
    known = set(video_slugs())
    known |= {r["slug"] for r in store.read_csv(funnel.videos_path()) if r.get("slug")}
    known |= {r["slug"] for r in store.read_csv(funnel.metrics_path()) if r.get("slug")}
    text = text.strip()
    if text in known:
        return text
    if text.isdigit():
        text = f"{int(text):03d}"
    matches = sorted(s for s in known if s.startswith(text))
    if len(matches) == 1:
        return matches[0]
    raise LookupError(f"{'several videos match' if matches else 'no video matches'} {text!r}"
                      + (f": {', '.join(matches)}" if matches else ""))


def checklist(markdown):
    """[(done, label)] from the '## Checklist' section of a video.md."""
    items, inside = [], False
    for line in markdown.splitlines():
        if line.startswith("## "):
            inside = line.strip().lower() == "## checklist"
            continue
        match = CHECKLIST_ITEM.match(line.strip()) if inside else None
        if match:
            items.append((match.group(1).lower() == "x", match.group(2)))
    return items


def video_status():
    """[(slug, next step or 'done', due date or '')] for every video folder."""
    published = {v["slug"]: v.get("published", "") for v in store.read_csv(funnel.videos_path()) if v.get("slug")}
    out = []
    for slug in video_slugs():
        file = store.path("videos", slug, "video.md")
        if not os.path.exists(file):
            continue
        with open(file, encoding="utf-8") as f:
            items = checklist(f.read())
        step = next((label for done, label in items if not done), None)
        due = ""
        match = re.search(r"\bD(\d+)\b", step or "")
        if match and published.get(slug):
            try:
                due = (dt.date.fromisoformat(published[slug]) + dt.timedelta(days=int(match.group(1)))).isoformat()
            except ValueError:
                pass
        out.append((slug, step or "done", due))
    return out


def rules_info():
    """(version, number of learned rules) from RULES.md."""
    file = store.path("RULES.md")
    if not os.path.exists(file):
        return "?", 0
    with open(file, encoding="utf-8") as f:
        text = re.sub(r"```.*?```", "", f.read(), flags=re.S)
    version = re.search(r"\*\*Version:\*\*\s*([\d.]+)", text)
    return (version.group(1) if version else "?"), len(re.findall(r"^\*\*L-\d+", text, flags=re.M))
