#!/usr/bin/env python3
"""Sync Haze Atlas trade values and produce auditable market history artifacts.

Google Sheet values are the canonical Atlas values. Vaulted Values X is preserved
per item as a cross-check and never replaces the primary value. Every changed,
source-backed value state is appended to value-history.json; no values are
invented or interpolated.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data.json"
AUDIT_PATH = ROOT / "source-audit.json"
HISTORY_PATH = ROOT / "value-history.json"
CHANGES_PATH = ROOT / "value-changes.json"
SHEET_BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR13VPAyegTk7IIY7bjc22p0MjeCclNdbK4TsEiAPcoSfObTfZcWZAXxOq3eeIrGd2zHDeTddApGark/pub"
VAULTED_URL = "https://haze-seas.vaultedvaluesx.com/value-list"
VAULTED_API = "https://valuevaultx.com/_functions/api/haze-seas"
HISTORY_SCHEMA_VERSION = 1
HISTORY_RETENTION = 180
SHEETS = {
    "Overview": "1077085569", "Tutorial": "1764732080", "Fruits": "1700828745",
    "Accessories": "383264331", "Swords": "1926500499", "Misc Items": "1829965652",
    "Gamepasses": "1675626398", "Perm Fruits (Robux)": "1519254710",
    "Tier List (PvE) [Fruit]": "1408297219", "Tier List (PvP) [Fruit]": "752112998",
    "Tier List (PvE) [Sword]": "342268962", "Tier List (PvP) [Sword]": "1251714687",
}
ITEM_SHEETS = {"Fruits", "Accessories", "Swords", "Misc Items", "Gamepasses", "Perm Fruits (Robux)"}


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "HazeAtlasSourceSync/3.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def slug(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def numeric_value(value: Any) -> int | None:
    clean = re.sub(r"[^0-9.-]", "", str(value or ""))
    if not clean or clean in {"-", ".", "-."}:
        return None
    try:
        return int(float(clean))
    except ValueError:
        return None


def display_value(value: int | None, fallback: str = "???") -> str:
    return f"{value:,}" if value is not None else fallback


def parse_sheet_rows(category: str, rows: list[list[str]]) -> list[dict[str, Any]]:
    first_column_names = {"fruit", "accessories", "sword", "items", "gamepasses"}
    header_index = next(index for index, row in enumerate(rows)
                        if any(normalize_header(cell) in {"value", "demand"} for cell in row)
                        and any(normalize_header(cell) in first_column_names for cell in row))
    headers = [normalize_header(cell) for cell in rows[header_index]]
    positions = {header: index for index, header in enumerate(headers) if header}

    def field(row: list[str], *names: str) -> str:
        for name in names:
            index = positions.get(name)
            if index is not None and index < len(row):
                return row[index].strip()
        return ""

    parsed = []
    for row in rows[header_index + 1:]:
        name = field(row, "fruit", "accessories", "sword", "items", "gamepasses")
        rarity = field(row, "rarity")
        if not name or name == "???" or rarity == "-----" or re.match(r"^(top|[a-fs]) tier$", name, re.I):
            continue
        value_text = field(row, "value") or "???"
        parsed.append({
            "id": f"{slug(category)}-{slug(name)}", "name": name, "category": category,
            "rarity": rarity, "valueText": value_text, "value": numeric_value(value_text),
            "demand": field(row, "demand") or "???", "dragons": field(row, "valueindragons"),
            "pvp": field(row, "pvp"), "pve": field(row, "pve"),
            "sourceLabel": field(row, "links"), "robux": field(row, "robuxcost", "robux"),
        })
    return parsed


def canonicalize_sheet(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for item in rows:
        score = (item["value"] is not None, sum(str(item.get(field, "")).strip() not in {"", "???", "-----"}
                                                    for field in ("demand", "dragons", "pvp", "pve", "sourceLabel")))
        if item["id"] not in result or score > result[item["id"]]["_score"]:
            result[item["id"]] = {**item, "_score": score}
    for item in result.values():
        item.pop("_score", None)
    return result


def normalized_text(value: Any) -> str:
    return str(value or "").strip().upper()


def cross_check(sheet_item: dict[str, Any], vaulted_item: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    vaulted_value = numeric_value(vaulted_item.get("value"))
    sheet_source = {"value": sheet_item["value"], "valueText": sheet_item["valueText"],
                    "demand": sheet_item["demand"], "rarity": sheet_item["rarity"]}
    vaulted_source = {"value": vaulted_value, "valueText": display_value(vaulted_value),
                      "demand": normalized_text(vaulted_item.get("demand")),
                      "rarity": normalized_text(vaulted_item.get("rarity"))}
    conflicts = []
    for field in ("value", "demand", "rarity"):
        primary, comparison = sheet_source[field], vaulted_source[field]
        if primary is None or comparison in {None, ""}:
            continue
        if normalized_text(primary) != normalized_text(comparison):
            conflicts.append({"field": field, "googleSheet": primary, "vaultedValuesX": comparison})
    numeric_delta = None if sheet_source["value"] is None or vaulted_value is None else vaulted_value - sheet_source["value"]
    return ({"googleSheet": sheet_source, "vaultedValuesX": vaulted_source,
             "matched": not conflicts, "conflictFields": [entry["field"] for entry in conflicts],
             "vaultedValueDelta": numeric_delta}, conflicts)


def build_items(sheet: dict[str, dict[str, Any]], vaulted: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    missing_in_sheet, missing_in_vaulted = sorted(set(vaulted) - set(sheet)), sorted(set(sheet) - set(vaulted))
    if missing_in_sheet or missing_in_vaulted:
        raise RuntimeError(f"Source ID mismatch: missingInSheet={missing_in_sheet}, missingInVaulted={missing_in_vaulted}")
    conflicts, items = [], []
    for item_id in sorted(sheet, key=lambda key: list(SHEETS).index(sheet[key]["category"])):
        primary = dict(sheet[item_id])
        comparison, item_conflicts = cross_check(primary, vaulted[item_id])
        # Deliberately retain Google Sheet values/demand/rarity as Atlas canonical fields.
        primary["sourceValues"] = comparison
        primary["sourceConflict"] = not comparison["matched"]
        items.append(primary)
        conflicts.extend({"id": item_id, "name": primary["name"], **entry} for entry in item_conflicts)
    return items, conflicts


def history_item(item: dict[str, Any]) -> dict[str, Any]:
    return {key: item.get(key) for key in ("id", "name", "category", "value", "valueText", "demand", "rarity", "sourceValues", "sourceConflict")}


def item_fingerprint(items: list[dict[str, Any]]) -> str:
    canonical = [history_item(item) for item in sorted(items, key=lambda entry: entry["id"])]
    return hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def make_changes(previous: list[dict[str, Any]], current: list[dict[str, Any]]) -> list[dict[str, Any]]:
    before = {item["id"]: item for item in previous}
    changes = []
    for item in sorted(current, key=lambda entry: entry["id"]):
        old = before.get(item["id"])
        if old is None:
            changes.append({"id": item["id"], "name": item["name"], "category": item["category"], "kind": "added"})
            continue
        fields = {field: {"from": old.get(field), "to": item.get(field)} for field in ("value", "valueText", "demand", "rarity", "sourceConflict") if old.get(field) != item.get(field)}
        if fields:
            direction = "same"
            if item.get("value") is not None and old.get("value") is not None:
                direction = "up" if item["value"] > old["value"] else "down" if item["value"] < old["value"] else "same"
            changes.append({"id": item["id"], "name": item["name"], "category": item["category"], "kind": "changed", "direction": direction, "fields": fields})
    for item_id in sorted(set(before) - {item["id"] for item in current}):
        old = before[item_id]
        changes.append({"id": item_id, "name": old.get("name", item_id), "category": old.get("category"), "kind": "removed"})
    return changes


def update_history(existing: dict[str, Any] | None, observed_at: str, items: list[dict[str, Any]], sources: dict[str, str]) -> tuple[dict[str, Any], dict[str, Any]]:
    snapshots = existing.get("snapshots", []) if isinstance(existing, dict) and existing.get("schemaVersion") == HISTORY_SCHEMA_VERSION else []
    current = [history_item(item) for item in sorted(items, key=lambda entry: entry["id"])]
    fingerprint = item_fingerprint(current)
    previous = snapshots[-1] if snapshots else None
    if previous and previous.get("fingerprint") == fingerprint:
        changes = {"schemaVersion": HISTORY_SCHEMA_VERSION, "generatedAt": observed_at, "observedAt": previous["observedAt"], "previousObservedAt": previous["observedAt"], "changed": False, "summary": {"total": 0, "up": 0, "down": 0, "same": 0, "added": 0, "removed": 0}, "changes": []}
        return {"schemaVersion": HISTORY_SCHEMA_VERSION, "generatedAt": observed_at, "retention": HISTORY_RETENTION, "sources": sources, "snapshots": snapshots}, changes
    records = make_changes(previous.get("items", []), current) if previous else []
    snapshot = {"observedAt": observed_at, "itemCount": len(current), "fingerprint": fingerprint, "items": current}
    snapshots = (snapshots + [snapshot])[-HISTORY_RETENTION:]
    summary = {"total": len(records), "up": sum(x.get("direction") == "up" for x in records), "down": sum(x.get("direction") == "down" for x in records), "same": sum(x.get("direction") == "same" for x in records), "added": sum(x["kind"] == "added" for x in records), "removed": sum(x["kind"] == "removed" for x in records)}
    changes = {"schemaVersion": HISTORY_SCHEMA_VERSION, "generatedAt": observed_at, "observedAt": observed_at, "previousObservedAt": previous.get("observedAt") if previous else None, "changed": True, "summary": summary, "changes": records}
    return {"schemaVersion": HISTORY_SCHEMA_VERSION, "generatedAt": observed_at, "retention": HISTORY_RETENTION, "sources": sources, "snapshots": snapshots}, changes


def load_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return fallback


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="replace data, audit, history, changes, and sync metadata")
    args = parser.parse_args()
    checked_at = datetime.now(timezone.utc).isoformat()
    raw_sheets, sheet_items = {}, []
    for category, gid in SHEETS.items():
        rows = list(csv.reader(io.StringIO(fetch(f"{SHEET_BASE}?gid={gid}&single=true&output=csv").decode("utf-8-sig"))))
        raw_sheets[category] = rows
        if category in ITEM_SHEETS:
            sheet_items.extend(parse_sheet_rows(category, rows))
    sheet = canonicalize_sheet(sheet_items)
    vaulted_rows = json.loads(fetch(VAULTED_API).decode("utf-8"))
    vaulted = {f"{slug(item['category'])}-{slug(item['title'])}": item for item in vaulted_rows}
    items, conflicts = build_items(sheet, vaulted)
    value_conflicts = [entry for entry in conflicts if entry["field"] == "value"]
    via = "github-actions" if os.environ.get("GITHUB_ACTIONS") == "true" else "local"
    run_url = None
    if via and os.environ.get("GITHUB_REPOSITORY") and os.environ.get("GITHUB_RUN_ID"):
        run_url = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    sources = {"primary": "googleSheet", "googleSheet": SHEET_BASE, "vaultedValuesX": VAULTED_URL, "vaultedApi": VAULTED_API}
    history, changes = update_history(load_json(HISTORY_PATH, {}), checked_at, items, sources)
    output = {"source": SHEET_BASE, "valueSource": SHEET_BASE, "crossCheckSource": VAULTED_URL, "updatedAt": checked_at,
              "sync": {"status": "Ready", "lastChecked": checked_at, "lastUpdated": checked_at, "via": via, "itemCount": len(items), "valueConflicts": len(value_conflicts), "sourceConflicts": len(conflicts), "historySnapshots": len(history["snapshots"]), "runUrl": run_url}, "sheets": raw_sheets, "items": items}
    audit = {"checkedAt": checked_at, "via": via, "runUrl": run_url, "sources": sources,
             "googleSheet": {"rawRows": len(sheet_items), "canonicalItems": len(sheet)}, "vaultedValuesX": {"items": len(vaulted)},
             "result": {"items": len(items), "valueConflicts": len(value_conflicts), "sourceConflicts": len(conflicts), "conflicts": conflicts},
             "history": {"snapshots": len(history["snapshots"]), "latestObservedAt": history["snapshots"][-1]["observedAt"] if history["snapshots"] else None, "latestChangeSummary": changes["summary"]}}
    print(json.dumps(audit, indent=2))
    if args.write:
        write_json(DATA_PATH, output); write_json(AUDIT_PATH, audit); write_json(HISTORY_PATH, history); write_json(CHANGES_PATH, changes)
        write_json(ROOT / "sync-meta.json", {"checkedAt": checked_at, "via": via, "runUrl": run_url, "values": {"items": len(items), "updatedAt": checked_at, "valueConflicts": len(value_conflicts), "sourceConflicts": len(conflicts), "historySnapshots": len(history["snapshots"]), "latestChangeSummary": changes["summary"]}})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
