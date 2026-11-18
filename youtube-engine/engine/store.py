"""Plain-file storage for the engine: CSV tables and JSON state. Standard library only."""

import csv
import json
import os

_DEFAULT_HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def home():
    """The youtube-engine folder. YT_ENGINE_HOME overrides it (the tests use this)."""
    return os.environ.get("YT_ENGINE_HOME") or _DEFAULT_HOME


def path(*parts):
    return os.path.join(home(), *parts)


def read_csv(file):
    if not os.path.exists(file):
        return []
    with open(file, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return [r for r in rows if any(isinstance(v, str) and v.strip() for v in r.values())]


def write_csv(file, rows, fields):
    os.makedirs(os.path.dirname(file), exist_ok=True)
    tmp = file + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: "" if row.get(k) is None else row.get(k) for k in fields})
    os.replace(tmp, file)


def read_json(file, default):
    if not os.path.exists(file):
        return default
    with open(file, encoding="utf-8") as f:
        return json.load(f)


def write_json(file, data):
    os.makedirs(os.path.dirname(file), exist_ok=True)
    tmp = file + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, file)


def num(value, default=None):
    """Read a number from a CSV cell: '1,200' → 1200, '4.5%' → 4.5, '' → default."""
    if value is None or isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip().replace(",", "").replace("$", "").replace("%", "")
    if not text:
        return default
    try:
        number = float(text)
    except ValueError:
        return default
    return int(number) if number.is_integer() else number
