#!/usr/bin/env python3
"""Stage the static Haze Atlas site for Capacitor without copying native/build files."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist"
SKIP = {
    ".git", "android", "dist", "node_modules", "tools", "__pycache__",
    # Large optional encyclopedia media stays on the web site. The Android bundle
    # retains value-list art and core offline data rather than shipping a 500+ MB APK.
    "power-media", "power-posters", "trello-images", "trello-content-images",
}
SKIP_FILES = {"package.json", "package-lock.json", "capacitor.config.ts", ".gitignore"}

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()
for entry in ROOT.iterdir():
    if entry.name in SKIP or entry.name in SKIP_FILES or entry.name.startswith("."):
        continue
    target = OUT / entry.name
    if entry.is_dir():
        shutil.copytree(entry, target)
    elif entry.is_file():
        shutil.copy2(entry, target)

if not (OUT / "index.html").is_file():
    raise SystemExit("Android web staging failed: index.html was not copied")
print(f"Staged Haze Atlas web assets in {OUT}")
