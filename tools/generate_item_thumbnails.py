#!/usr/bin/env python3
"""Generate lightweight, static item-card thumbnails from official cached artwork."""
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "item-thumbnails"
SIZE = (360, 270)
BACKGROUND = (7, 17, 27, 255)


def main() -> None:
    details = json.loads((ROOT / "trello-details.json").read_text(encoding="utf-8"))["items"]
    OUT.mkdir(exist_ok=True)
    generated = skipped = failed = 0
    for item_id, item in details.items():
        source = ROOT / item.get("image", "")
        target = OUT / f"{item_id}.webp"
        if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
            skipped += 1
            continue
        try:
            command = [
                "ffmpeg", "-loglevel", "error", "-y", "-i", str(source),
                "-frames:v", "1", "-vf",
                "scale=360:270:force_original_aspect_ratio=decrease,pad=360:270:(ow-iw)/2:(oh-ih)/2:color=0x07111b",
                "-c:v", "libwebp", "-quality", "80", str(target),
            ]
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            generated += 1
        except Exception as exc:
            failed += 1
            print(f"FAILED {item_id}: {exc}")
    print(json.dumps({"ready": generated + skipped, "generated": generated, "skipped": skipped, "failed": failed}))
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
