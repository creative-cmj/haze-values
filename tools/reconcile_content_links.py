#!/usr/bin/env python3
"""Repair Trello guide categories and value-list links using current Haze Atlas data."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_PATH = ROOT / "content.json"
DATA_PATH = ROOT / "data.json"


def slug(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def main() -> int:
    content = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    values = {item["id"]: item for item in data["items"]}
    changed = []

    for entry in content["entries"]:
        before = {key: entry.get(key) for key in ("category", "tradable", "valueId", "notTradableReason")}

        # The Trello board calls the list "Devil Fruits"; Haze Atlas calls it "Fruits".
        if entry.get("category") == "Devil Fruits":
            entry["category"] = "Fruits"

        if entry.get("category") == "Fruits":
            value_id = f"fruits-{slug(entry.get('name', ''))}"
            if value_id in values:
                entry["valueId"] = value_id
                entry["tradable"] = True
                entry.pop("notTradableReason", None)
            else:
                entry["valueId"] = None
                entry["tradable"] = False
                entry["notTradableReason"] = "This transformed form is not a separate value-list item"

        # Avoid linking a boss guide to the identically named sword value entry.
        if entry.get("category") == "Bosses" and entry.get("name") == "Zenith":
            entry["valueId"] = None
            entry["tradable"] = False
            entry["notTradableReason"] = "Boss guide, not the Zenith sword item"

        # DarkBlade is a sword guide. The separately sold gamepass is a different listing.
        if entry.get("category") == "Swords" and slug(entry.get("name", "")) == "darkblade":
            entry["valueId"] = "swords-dark-blade"
            entry["tradable"] = False
            entry["notTradableReason"] = "The sword entry is currently unpriced; the Dark Blade gamepass is listed separately"

        after = {key: entry.get(key) for key in ("category", "tradable", "valueId", "notTradableReason")}
        if before != after:
            changed.append({"id": entry["id"], "name": entry["name"], "before": before, "after": after})

    linked_missing = [entry["id"] for entry in content["entries"] if entry.get("valueId") and entry["valueId"] not in values]
    if linked_missing:
        raise RuntimeError(f"Content entries link to missing value IDs: {linked_missing}")

    CONTENT_PATH.write_text(json.dumps(content, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"changed": len(changed), "entries": changed}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
