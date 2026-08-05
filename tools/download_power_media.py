#!/usr/bin/env python3
"""Download official Haze Seas power GIFs from the public Trello board and transcode to lazy-loadable WebM."""
from __future__ import annotations
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "power-media"
MANIFEST = OUT / "manifest.json"
BOARD_URL = "https://trello.com/b/nn8bpTB0.json"
UA = "Mozilla/5.0 (Haze Atlas media sync)"
URL_RE = re.compile(r"https?://\S+?\.gif(?:\?\S*)?", re.I)


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read()


def slug(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def main() -> int:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required")
    OUT.mkdir(exist_ok=True)
    board = json.loads(fetch(BOARD_URL).decode("utf-8"))
    sources: dict[str, dict] = {}
    for card in board["cards"]:
        if card.get("closed"):
            continue
        for raw in URL_RE.findall(card.get("desc", "")):
            url = raw.rstrip(").,]\"")
            item = sources.setdefault(url, {"url": url, "cards": []})
            if card["name"] not in item["cards"]:
                item["cards"].append(card["name"])
    ordered = list(sources.values())
    results = []
    for index, source in enumerate(ordered, 1):
        digest = hashlib.sha1(source["url"].encode()).hexdigest()[:12]
        stem = f"{slug(source['cards'][0])}-{digest}"
        target = OUT / f"{stem}.webm"
        record = {**source, "file": target.name, "status": ""}
        if target.exists() and target.stat().st_size > 1024:
            record.update(status="existing", bytes=target.stat().st_size)
            results.append(record)
            print(f"{index}/{len(ordered)} existing {target.name}", flush=True)
            continue
        gif = OUT / f".{stem}.gif"
        try:
            gif.write_bytes(fetch(source["url"]))
            subprocess.run([
                ffmpeg, "-y", "-i", str(gif),
                "-an", "-vf", "fps=18,scale=min(720\\,iw):-2:flags=lanczos,format=yuv420p",
                "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0",
                "-deadline", "good", "-row-mt", "1", str(target),
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
            record.update(status="ok", bytes=target.stat().st_size)
            print(f"{index}/{len(ordered)} ok {target.name} {record['bytes']}", flush=True)
        except Exception as exc:
            target.unlink(missing_ok=True)
            record.update(status="error", error=str(exc))
            print(f"{index}/{len(ordered)} ERROR {source['url']} {exc}", flush=True)
        finally:
            gif.unlink(missing_ok=True)
        results.append(record)
        MANIFEST.write_text(json.dumps({"updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "items": results}, indent=2) + "\n", encoding="utf-8")
    MANIFEST.write_text(json.dumps({"updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "items": results}, indent=2) + "\n", encoding="utf-8")
    ok = sum(r["status"] in {"ok", "existing"} for r in results)
    print(f"DONE total={len(results)} ok={ok} failed={len(results)-ok}", flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
