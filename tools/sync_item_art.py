#!/usr/bin/env python3
"""Download verified source artwork for value-list items not mapped by Trello details."""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SOURCES_PATH = ROOT / "item-art-sources.json"
OUTPUT_DIR = ROOT / "item-thumbnails"


def request(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "HazeAtlasArtworkSync/1.0"})
    with urllib.request.urlopen(req, timeout=90) as response:
        if response.status != 200:
            raise RuntimeError(f"Artwork request failed: HTTP {response.status} for {url}")
        return response.read()


def image_suffix(url: str) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix not in {".png", ".webp", ".jpg", ".jpeg"}:
        raise ValueError(f"Unsupported verified artwork format for {url}")
    return ".jpg" if suffix == ".jpeg" else suffix


def validate_image(payload: bytes, suffix: str) -> None:
    valid = ((suffix == ".png" and payload.startswith(b"\x89PNG\r\n\x1a\n"))
             or (suffix == ".webp" and payload.startswith(b"RIFF") and payload[8:12] == b"WEBP")
             or (suffix == ".jpg" and payload.startswith(b"\xff\xd8\xff")))
    if not valid:
        raise RuntimeError(f"Downloaded artwork is not a valid {suffix} image")


def main() -> int:
    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))["items"]
    results = []
    for item_id, entry in sources.items():
        suffix = image_suffix(entry["source"])
        target = OUTPUT_DIR / f"{item_id}{suffix}"
        payload = request(entry["source"])
        validate_image(payload, suffix)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        results.append({"id": item_id, "label": entry["label"], "file": str(target.relative_to(ROOT)), "bytes": len(payload), "sourcePage": entry["sourcePage"]})
    print(json.dumps({"downloaded": len(results), "items": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
