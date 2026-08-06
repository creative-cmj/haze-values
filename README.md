# Haze Atlas — Haze Seas companion

![Haze Seas Banner](./haze-seas-art.png)

Static browser version of the Haze Seas companion.

**Not affiliated with Roblox or Haze Studios.**

## Live site

GitHub Pages: `https://creative-cmj.github.io/haze-values/`

## What it includes

| Area | Source |
|------|--------|
| Item values, demand, PvP/PvE | Published Haze Seas value spreadsheet (+ Vaulted Values X cross-check) |
| Codes, bosses, races, systems | [Official Haze Seas Trello](https://trello.com/b/nn8bpTB0/haze-seas-official-trello) |
| Power videos / posters | Official Trello media attachments |
| Mastery XP table | Exact 0–500 UI XP table (aligned with official Mastery System ratios) |

### Companion features

- Value browser (grid + table), favorites, compare, trade calculator
- Official **codes** with one-tap copy
- **Game systems** encyclopedia (mastery, materials, bounty, chests, controls…)
- Power gallery with lazy-loaded official videos
- Build planner, collection tracker (local-only)
- Mastery XP calculator (M1 / skill / NPC / boss / superboss estimates)
- Release tracker & “What’s New” with owner-confirmed overrides

## Local development

Serve the repo root over HTTP (fetch needs a server):

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## How Refresh works

The in-app **Refresh** control does **not** scrape Trello or Google Sheets in the browser.

1. **GitHub Actions** (`.github/workflows/sync-data.yml`) runs every **2 hours** (and on demand via *Actions → Sync Haze data → Run workflow*).
2. It executes the Python sync tools, writes updated `data.json` / `content.json` / `trello-details.json` / `sync-meta.json`, and commits to the branch when something changed.
3. GitHub Pages deploys the new static files.
4. The browser Refresh button re-fetches those deployed JSON files with a cache-busting query string (`cache: 'no-store'`).

So Refresh = “reload the latest deployed snapshot,” and Actions = “produce a new snapshot from official sources.”

### Manual sync (local)

```bash
python3 tools/sync_value_sources.py --write
python3 tools/sync_trello_content.py --skip-media
python3 tools/sync_trello_details.py
```

## Data sync tools

Python utilities under `tools/` refresh bundled snapshots:

| Script | Purpose |
|--------|---------|
| `sync_value_sources.py` | Pull value spreadsheet into `data.json` |
| `sync_trello_content.py` | Encyclopedia entries → `content.json` |
| `sync_trello_details.py` | Per-item Trello metadata / images |
| `download_power_media.py` | Official power videos |
| `generate_power_posters.py` / `generate_item_thumbnails.py` | Web-optimized art |

### GitHub Actions workflow

| Trigger | Behavior |
|---------|----------|
| `schedule` every 2h | Sync values + Trello text (skip new media downloads) |
| `workflow_dispatch` | Manual run; optional full media download |

Requires `contents: write` (default `GITHUB_TOKEN` is enough on this repo).

Firebase source checker lives in `functions/` (optional scheduled drift detection against Trello + sheet).

## Source policy

See `source-policy.json`:

- **Trello** = authoritative for gameplay facts
- **Google Sheet** = primary trade values
- **Vaulted Values X** = secondary market cross-check only

## GitHub Pages

1. Push to a public `haze-values` repository
2. **Settings → Pages** → Deploy from `main` / `/(root)`
3. Optional: submit the live URL to Google Search Console

## Disclaimer

Values are community estimates, not official prices. Always verify codes and drop rates on the official Trello before trading or grinding.
