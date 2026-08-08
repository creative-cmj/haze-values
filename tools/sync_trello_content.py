#!/usr/bin/env python3
"""Synchronize Haze Atlas with effectively-active official Trello cards."""
from __future__ import annotations

import argparse
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_PATH = ROOT / "content.json"
CONFIG_PATH = ROOT / "functions" / "checker-config.json"
BOARD_URL = "https://trello.com/b/nn8bpTB0.json"
CATEGORY_MAP = {"Devil Fruits": "Fruits", "Misc NPCS": "NPCs", "Super Bosses": "Bosses"}


def request(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "HazeAtlasTrelloSync/3.0"})
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read()


def fetch_json(url: str) -> dict:
    return json.loads(request(url).decode("utf-8"))


def attach_art(card: dict, entry: dict, *, skip_download: bool = False) -> None:
    if entry.get("image") and (ROOT / entry["image"]).exists():
        return
    if skip_download:
        return
    details = fetch_json(
        f"https://trello.com/1/cards/{card['id']}?attachments=true&attachment_fields=name,url,mimeType"
    )
    art = next(
        (item for item in details.get("attachments", []) if item.get("mimeType") in {"image/png", "image/jpeg", "image/webp"}),
        None,
    )
    if not art:
        return
    suffix = {"image/jpeg": ".jpg", "image/webp": ".webp"}.get(art.get("mimeType"), ".png")
    relative = f"trello-content-images/trello-{card['id']}-0{suffix}"
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(request(art["url"]))
    entry["image"] = relative
    entry["images"] = [relative]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-media",
        action="store_true",
        help="Update card text only; do not download new Trello images (faster CI).",
    )
    args = parser.parse_args()
    board = fetch_json(BOARD_URL)
    content = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
    # The static Pages build may not include the optional Functions checker config.
    # No config means no deliberate card exclusions.
    ignored = set()
    if CONFIG_PATH.exists():
        ignored = set(json.loads(CONFIG_PATH.read_text(encoding="utf-8")).get("ignoredTrelloCardIds", []))
    list_rows = {item["id"]: item for item in board["lists"]}
    entries = {entry["id"].removeprefix("trello-"): entry for entry in content["entries"]}
    checked_at = datetime.now(timezone.utc).isoformat()
    changes, added = [], []

    for card in board["cards"]:
        list_row = list_rows.get(card["idList"], {})
        effectively_archived = bool(card.get("closed") or list_row.get("closed"))
        existing = entries.get(card["id"])
        if existing:
            if effectively_archived:
                existing["archived"] = True
            else:
                existing.pop("archived", None)
        if effectively_archived or card["id"] in ignored:
            continue

        list_name = list_row.get("name", "Other")
        category = CATEGORY_MAP.get(list_name, list_name)
        released = not bool(re.search(r"\b(unreleased|wip)\b", card["name"], re.I))
        entry = existing
        if not entry:
            entry = {
                "id": f"trello-{card['id']}",
                "name": card["name"],
                "category": category,
                "description": card.get("desc", ""),
                "source": f"https://trello.com/c/{card['shortLink']}",
                "lastChecked": checked_at,
                "tradable": False,
                "released": released,
                "notTradableReason": "Official guide record; not a separate value-list item.",
            }
            attach_art(card, entry, skip_download=args.skip_media)
            content["entries"].append(entry)
            entries[card["id"]] = entry
            added.append({"id": card["id"], "name": card["name"], "category": category, "image": entry.get("image")})

        expected = {
            "name": card["name"], "category": category, "description": card.get("desc", ""),
            "source": entry.get("source") or f"https://trello.com/c/{card['shortLink']}",
            # An active card renamed to remove “Unreleased” must update the visible
            # release state too; otherwise a stale false flag survives a content sync.
            "released": released,
        }
        changed_fields = {}
        for field, value in expected.items():
            if field != "lastChecked" and entry.get(field) != value:
                changed_fields[field] = {"before": entry.get(field), "after": value}
            entry[field] = value
        attach_art(card, entry, skip_download=args.skip_media)
        if changed_fields:
            entry["lastChecked"] = checked_at
            changes.append({"id": entry["id"], "name": card["name"], "changed": changed_fields})

    active_ids = {
        card["id"] for card in board["cards"]
        if not card.get("closed") and not list_rows.get(card["idList"], {}).get("closed") and card["id"] not in ignored
    }
    missing = sorted(active_ids - entries.keys())
    if missing:
        raise RuntimeError(f"Active Trello cards still missing: {missing}")
    content["lastChecked"] = checked_at
    CONTENT_PATH.write_text(json.dumps(content, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "checkedAt": checked_at, "effectiveActiveCards": len(active_ids), "atlasEntries": len(entries),
        "missing": 0, "added": added, "changedEntries": len(changes), "archivedEntries": sum(bool(x.get("archived")) for x in content["entries"]),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
