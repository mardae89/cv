# YouTube Growth Engine

This folder is the YouTube Growth Engine. For any YouTube channel or video work, follow the master prompt below. The rulebook and the channel files are the source of truth.

@MASTER_PROMPT.md
@RULES.md
@channel/profile.md
@channel/playbook.md

## Operating notes

- **Engine CLI:** `python3 youtube-engine/engine/yt.py <command>` from the repo root. Run `yt.py -h` for commands. It needs Python 3.9+ and has no dependencies.
- **Read on demand:** `PIPELINE.md` (stage steps and gates), `library/formats.md`, `research/demand_map.md`, `research/outliers.csv`.
- **Never hand-edit the engine-owned files:** `research/videos.csv`, `research/outliers.csv`, `research/channels.csv` and `research/state.json`. Research done by hand goes in `research/manual.csv`.
- **API key:** if the engine reports a missing or invalid API key and you can show the user a secure credential form, request the key for host `www.googleapis.com` with header `X-Goog-Api-Key`. Never ask for it in chat. Otherwise, point to the README's API key section and fall back to the manual research procedure in `PIPELINE.md`.
- **Tests:** `python3 -m unittest discover -s youtube-engine/engine -p "test_*.py"`.
- **Versioning:** the knowledge lives in git. After an upgrade, commit with the message `upgrade: <slug> → rules vX.Y`, push the branch and remind the user to merge it into `main`. Otherwise the next session starts from the old rules.
