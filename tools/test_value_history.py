#!/usr/bin/env python3
"""Regression checks for the source-backed value history pipeline."""
import importlib.util
from pathlib import Path

MODULE = Path(__file__).with_name("sync_value_sources.py")
spec = importlib.util.spec_from_file_location("sync_value_sources", MODULE)
sync = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(sync)


def item(value, demand="HIGH", conflict=False):
    return {
        "id": "fruits-dragon", "name": "Dragon", "category": "Fruits", "value": value,
        "valueText": f"{value:,}", "demand": demand, "rarity": "MYTHICAL",
        "sourceValues": {"googleSheet": {"value": value}, "vaultedValuesX": {"value": value}},
        "sourceConflict": conflict,
    }


sources = {"primary": "googleSheet"}
history, baseline = sync.update_history({}, "2026-08-01T00:00:00+00:00", [item(100)], sources)
assert len(history["snapshots"]) == 1
assert baseline["changes"] == []  # A first real observation is a baseline, not fabricated change data.
assert baseline["changed"] is True

unchanged_history, unchanged = sync.update_history(history, "2026-08-01T02:00:00+00:00", [item(100)], sources)
assert len(unchanged_history["snapshots"]) == 1
assert unchanged["changed"] is False

changed_history, changed = sync.update_history(unchanged_history, "2026-08-02T00:00:00+00:00", [item(125, "MEDIUM", True)], sources)
assert len(changed_history["snapshots"]) == 2
assert changed["summary"] == {"total": 1, "up": 1, "down": 0, "same": 0, "added": 0, "removed": 0}
record = changed["changes"][0]
assert record["id"] == "fruits-dragon" and record["direction"] == "up"
assert set(record["fields"]) == {"value", "valueText", "demand", "sourceConflict"}

sheet = {"fruits-dragon": {**item(100), "valueText": "100"}}
vaulted = {"fruits-dragon": {"value": 90, "demand": "LOW", "rarity": "MYTHICAL"}}
items, conflicts = sync.build_items(sheet, vaulted)
assert items[0]["value"] == 100  # Sheet remains canonical despite Vaulted disagreement.
assert {entry["field"] for entry in conflicts} == {"value", "demand"}
print("value history pipeline checks passed")
