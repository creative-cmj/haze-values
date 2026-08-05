#!/usr/bin/env python3
"""Refresh value-item Trello metadata and repair exact card matches."""
from __future__ import annotations

import json
import re
import shutil
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOARD_URL = "https://api.trello.com/1/boards/nn8bpTB0?cards=all&card_attachments=true&lists=all"
LIST_BY_CATEGORY = {
    "Fruits": "Devil Fruits", "Perm Fruits (Robux)": "Devil Fruits",
    "Accessories": "Accessories", "Swords": "Swords", "Misc Items": "Misc Items",
    "Gamepasses": "Gamepasses",
}


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "HazeAtlasDetailSync/2.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def norm(value: str) -> str:
    value = re.sub(r"\s*\((?:unreleased|wip)\)\s*", "", value or "", flags=re.I)
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def short_link(url: str) -> str:
    match = re.search(r"/c/([^/]+)", url or "")
    return match.group(1) if match else ""


def main() -> int:
    board = fetch_json(BOARD_URL)
    details_path = ROOT / "trello-details.json"
    details = json.loads(details_path.read_text(encoding="utf-8"))
    data = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
    content = json.loads((ROOT / "content.json").read_text(encoding="utf-8"))
    values = {item["id"]: item for item in data["items"]}
    content_by_card = {entry["id"].removeprefix("trello-"): entry for entry in content["entries"]}
    list_rows = {item["id"]: item for item in board["lists"]}
    lists = {item["id"]: item["name"] for item in board["lists"]}
    all_cards = board["cards"]
    cards = [card for card in all_cards if not card.get("closed") and not list_rows.get(card["idList"], {}).get("closed")]
    by_short = {card["shortLink"]: card for card in all_cards}
    checked_at = datetime.now(timezone.utc).isoformat()
    changed = []
    rematched = []

    for item_id, record in details["items"].items():
        item = values.get(item_id)
        if not item:
            continue
        expected_list = LIST_BY_CATEGORY.get(item["category"])
        current = by_short.get(short_link(record.get("url", "")))
        candidates = [
            card for card in cards
            if lists.get(card["idList"]) == expected_list and norm(card["name"]) == norm(item["name"])
        ]
        card = candidates[0] if candidates else current
        if not card:
            continue
        # A transformed form is not an exact match for the base value item.
        if candidates and current and current["id"] != card["id"]:
            rematched.append({"item": item_id, "from": current["id"], "to": card["id"]})
            art = content_by_card.get(card["id"], {}).get("image")
            if art and record.get("image"):
                source, target = ROOT / art, ROOT / record["image"]
                if source.exists():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
        expected = {
            "title": card["name"], "description": card.get("desc", ""),
            "list": lists.get(card["idList"], record.get("list", "")),
            "url": record.get("url") or f"https://trello.com/c/{card['shortLink']}",
        }
        fields = []
        for field, value in expected.items():
            if record.get(field) != value:
                fields.append(field)
            record[field] = value
        if fields:
            record["lastChecked"] = checked_at
            changed.append({"item": item_id, "card": card["id"], "fields": fields})

    represented = {
        by_short[short_link(record.get("url", ""))]["id"]
        for record in details["items"].values()
        if short_link(record.get("url", "")) in by_short
    }
    unmatched_by_id = {record["id"]: record for record in details["unmatched"]}
    added_unmatched = []
    for card in all_cards:
        active = not card.get("closed") and not list_rows.get(card["idList"], {}).get("closed")
        record = unmatched_by_id.get(card["id"])
        is_new = False
        if not record and active and card["id"] not in represented:
            record = {"id": card["id"]}
            is_new = True
            details["unmatched"].append(record)
            unmatched_by_id[card["id"]] = record
            added_unmatched.append({"id": card["id"], "name": card["name"]})
        if not record:
            continue
        expected = {
            "title": card["name"], "description": card.get("desc", ""),
            "list": lists.get(card["idList"], ""), "url": record.get("url") or f"https://trello.com/c/{card['shortLink']}",
        }
        if is_new:
            expected["attachments"] = [{
                "id": item["id"], "name": item.get("name", ""), "url": item.get("url", ""),
                "preview": next((preview.get("url", "") for preview in reversed(item.get("previews", [])) if preview.get("url")), ""),
                "mime": item.get("mimeType", ""),
            } for item in card.get("attachments", [])]
        if active:
            record.pop("archived", None)
        else:
            expected["archived"] = True
        if any(record.get(field) != value for field, value in expected.items()):
            record["checkedAt"] = checked_at
        record.update(expected)

    details["checkedAt"] = checked_at
    details_path.write_text(json.dumps(details, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"checkedAt": checked_at, "items": len(details["items"]), "unmatched": len(details["unmatched"]), "changed": len(changed), "rematched": rematched, "addedUnmatched": added_unmatched, "changes": changed}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
