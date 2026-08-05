#!/usr/bin/env python3
"""Generate cached WebP poster frames for the official Haze Atlas WebM previews."""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="regenerate existing posters")
    args = parser.parse_args()

    web = Path(__file__).resolve().parents[1]
    manifest = json.loads((web / "power-media" / "manifest.json").read_text(encoding="utf-8"))
    source_dir = web / "power-media"
    output_dir = web / "power-posters"
    output_dir.mkdir(exist_ok=True)

    ready = [item for item in manifest["items"] if item.get("status") != "error"]
    generated = skipped = failed = 0
    for index, item in enumerate(ready, 1):
        source = source_dir / item["file"]
        target = output_dir / f"{source.stem}.webp"
        if target.exists() and not args.force:
            skipped += 1
            continue
        command = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", "0.08", "-i", str(source), "-frames:v", "1",
            "-vf", "scale=640:-2:flags=lanczos", "-c:v", "libwebp",
            "-quality", "76", str(target),
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode:
            failed += 1
            print(f"[{index}/{len(ready)}] FAILED {source.name}: {result.stderr.strip()}")
            target.unlink(missing_ok=True)
        else:
            generated += 1
    print(json.dumps({"ready": len(ready), "generated": generated, "skipped": skipped, "failed": failed}))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
