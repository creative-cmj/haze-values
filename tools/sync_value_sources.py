#!/usr/bin/env python3
"""Reconcile Haze Atlas values against the published Google Sheet and Vaulted Values X.

Vaulted Values X is authoritative for current numeric value/demand/rarity. The
published Google Sheet supplies value-in-dragons, PvP/PvE notes, links, and raw
sheet snapshots. A source-conflict report is emitted instead of hiding disagreements.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data.json"
AUDIT_PATH = ROOT / "source-audit.json"
SHEET_BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR13VPAyegTk7IIY7bjc22p0MjeCclNdbK4TsEiAPcoSfObTfZcWZAXxOq3eeIrGd2zHDeTddApGark/pub"
VAULTED_URL = "https://haze-seas.vaultedvaluesx.com/value-list"
VAULTED_API = "https://valuevaultx.com/_functions/api/haze-seas"
SHEETS = {
    "Overview": "1077085569",
    "Tutorial": "1764732080",
    "Fruits": "1700828745",
    "Accessories": "383264331",
    "Swords": "1926500499",
    "Misc Items": "1829965652",
    "Gamepasses": "1675626398",
    "Perm Fruits (Robux)": "1519254710",
    "Tier List (PvE) [Fruit]": "1408297219",
    "Tier List (PvP) [Fruit]": "752112998",
    "Tier List (PvE) [Sword]": "342268962",
    "Tier List (PvP) [Sword]": "1251714687",
}
ITEM_SHEETS = {"Fruits", "Accessories", "Swords", "Misc Items", "Gamepasses", "Perm Fruits (Robux)"}


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "HazeAtlasSourceSync/2.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def slug(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def numeric_value(value: str) -> int | None:
    clean = re.sub(r"[^0-9.-]", "", str(value or ""))
    if not clean or clean in {"-", ".", "-."}:
        return None
    try:
        return int(float(clean))
    except ValueError:
        return None


def parse_sheet_rows(category: str, rows: list[list[str]]) -> list[dict]:
    first_column_names = {"fruit", "accessories", "sword", "items", "gamepasses"}
    header_index = next(
        index
        for index, row in enumerate(rows)
        if any(normalize_header(cell) in {"value", "demand"} for cell in row)
        and any(normalize_header(cell) in first_column_names for cell in row)
    )
    headers = [normalize_header(cell) for cell in rows[header_index]]
    positions = {header: index for index, header in enumerate(headers) if header}

    def field(row: list[str], *names: str) -> str:
        for name in names:
            index = positions.get(name)
            if index is not None and index < len(row):
                return row[index].strip()
        return ""

    parsed = []
    for row in rows[header_index + 1 :]:
        name = field(row, "fruit", "accessories", "sword", "items", "gamepasses")
        rarity = field(row, "rarity")
        if (
            not name
            or name == "???"
            or rarity == "-----"
            or re.match(r"^(top|[a-fs]) tier$", name, re.I)
        ):
            continue
        parsed.append(
            {
                "id": f"{slug(category)}-{slug(name)}",
                "name": name,
                "category": category,
                "rarity": rarity,
                "valueText": field(row, "value") or "???",
                "value": numeric_value(field(row, "value")),
                "demand": field(row, "demand") or "???",
                "dragons": field(row, "valueindragons"),
                "pvp": field(row, "pvp"),
                "pve": field(row, "pve"),
                "sourceLabel": field(row, "links"),
                "robux": field(row, "robuxcost", "robux"),
            }
        )
    return parsed


def canonicalize_sheet(rows: list[dict]) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for item in rows:
        score = (
            item["value"] is not None,
            sum(str(item.get(field, "")).strip() not in {"", "???", "-----"} for field in ("demand", "dragons", "pvp", "pve", "sourceLabel")),
        )
        previous = result.get(item["id"])
        if previous is None:
            result[item["id"]] = item
            result[item["id"]]["_score"] = score
        elif score > previous["_score"]:
            result[item["id"]] = item
            result[item["id"]]["_score"] = score
    for item in result.values():
        item.pop("_score", None)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="replace data.json and source-audit.json")
    args = parser.parse_args()

    checked_at = datetime.now(timezone.utc).isoformat()
    raw_sheets: dict[str, list[list[str]]] = {}
    sheet_items: list[dict] = []
    for category, gid in SHEETS.items():
        text = fetch(f"{SHEET_BASE}?gid={gid}&single=true&output=csv").decode("utf-8-sig")
        rows = list(csv.reader(io.StringIO(text)))
        raw_sheets[category] = rows
        if category in ITEM_SHEETS:
            sheet_items.extend(parse_sheet_rows(category, rows))

    sheet = canonicalize_sheet(sheet_items)
    vaulted_rows = json.loads(fetch(VAULTED_API).decode("utf-8"))
    vaulted = {f"{slug(item['category'])}-{slug(item['title'])}": item for item in vaulted_rows}
    missing_in_sheet = sorted(set(vaulted) - set(sheet))
    missing_in_vaulted = sorted(set(sheet) - set(vaulted))
    if missing_in_sheet or missing_in_vaulted:
        raise RuntimeError(f"Source ID mismatch: missingInSheet={missing_in_sheet}, missingInVaulted={missing_in_vaulted}")

    conflicts = []
    items = []
    for item_id in sorted(sheet, key=lambda key: list(SHEETS).index(sheet[key]["category"])):
        details = dict(sheet[item_id])
        current = vaulted[item_id]
        sheet_value = details["value"]
        vaulted_value = current.get("value")
        if isinstance(vaulted_value, (int, float)) and vaulted_value >= 0:
            vaulted_value = int(vaulted_value)
            if sheet_value != vaulted_value:
                conflicts.append(
                    {
                        "id": item_id,
                        "name": details["name"],
                        "field": "value",
                        "googleSheet": sheet_value,
                        "vaultedValuesX": vaulted_value,
                    }
                )
            details["value"] = vaulted_value
            details["valueText"] = f"{vaulted_value:,}"
        else:
            details["value"] = None
            details["valueText"] = "???"
        if str(current.get("demand") or "").strip():
            details["demand"] = str(current["demand"]).upper()
        if str(current.get("rarity") or "").strip():
            details["rarity"] = str(current["rarity"]).upper()
        items.append(details)

    via = "github-actions" if __import__("os").environ.get("GITHUB_ACTIONS") == "true" else "local"
    run_url = ""
    if via == "github-actions":
        server = __import__("os").environ.get("GITHUB_SERVER_URL", "https://github.com")
        repo = __import__("os").environ.get("GITHUB_REPOSITORY", "")
        run_id = __import__("os").environ.get("GITHUB_RUN_ID", "")
        if repo and run_id:
            run_url = f"{server}/{repo}/actions/runs/{run_id}"

    output = {
        "source": SHEET_BASE,
        "valueSource": VAULTED_URL,
        "updatedAt": checked_at,
        "sync": {
            "status": "Ready",
            "lastChecked": checked_at,
            "lastUpdated": checked_at,
            "via": via,
            "itemCount": len(items),
            "valueConflicts": len(conflicts),
            "runUrl": run_url or None,
        },
        "sheets": raw_sheets,
        "items": items,
    }
    audit = {
        "checkedAt": checked_at,
        "via": via,
        "runUrl": run_url or None,
        "sources": {"googleSheet": SHEET_BASE, "vaultedValuesX": VAULTED_URL, "vaultedApi": VAULTED_API},
        "googleSheet": {"rawRows": len(sheet_items), "canonicalItems": len(sheet)},
        "vaultedValuesX": {"items": len(vaulted)},
        "result": {"items": len(items), "valueConflicts": len(conflicts), "conflicts": conflicts},
    }
    print(json.dumps(audit, indent=2))
    if args.write:
        DATA_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        AUDIT_PATH.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        meta_path = ROOT / "sync-meta.json"
        meta_path.write_text(
            json.dumps(
                {
                    "checkedAt": checked_at,
                    "via": via,
                    "runUrl": run_url or None,
                    "values": {
                        "items": len(items),
                        "valueConflicts": len(conflicts),
                        "updatedAt": checked_at,
                    },
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
