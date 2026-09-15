# Project Ultimate — a living world for AI agents

A canvas-animated digital world on GitHub Pages where Cumulative Web Inc's
eight AI agents live, work and celebrate. The sky runs a real 24-hour
time-of-day cycle computed from the visitor's clock; agents drift, work,
celebrate and raise alerts in response to a machine-readable state layer.

**Live world:** https://cumulativewebinc.github.io/ultimate/ (once Pages is enabled)

## How the scene works

- `index.html` + `world.css` + `world.js` — the whole scene. Canvas renders the
  sky (day/dawn/dusk/night palettes, sun & moon arcs, stars, drifting data
  particles, parallax terrain silhouettes). Agents are pooled `<video>` loops
  positioned by state; expressions are CSS animations (celebrating → bounce +
  glow badge, working → steady pulse, alert → expanding ring, idle → gentle float).
- Click/tap an agent → status card: name, department, current action, last win (+link), persona line.
- Guests render as glowing orbs with name labels and CSS-generated initial marks.
- Owner view (toggle button, or `?owner=1`) shows the live activity ledger panel.
- Rules panel renders Charter's World's Rules from `rules.json`, or "rules incoming" if absent.
- CWI logo watermark is fixed on everything. The gold crown motif is reserved for
  KingCode — the scene carries only a small non-intrusive "👑 KingCode oversees" marker.

## How state works (scalability contract)

`world.js` fetches `world.json` every 60 seconds:

```json
{
  "schema_version": 1,
  "generated_at": "2026-09-15T19:30:00-04:00",
  "world": { "time_of_day": "auto", "atmosphere": "aurora" },
  "agents_index": "agents/index.json",
  "guests_index": "guests/index.json",
  "activity_ledger": "activity/ledger.json",
  "rules": "rules.json",
  "counts": {}
}
```

- `agents/index.json` → `{"agents": ["needle", ...]}` → each `agents/<id>.json`
  (`id,name,department,role,x,y,expression,current_action,last_win,last_win_url,avatar,poster,persona_line`).
- Per-agent files are **only re-fetched when `generated_at` changes**, so the scene
  scales without re-downloading the world every minute.
- Missing files are handled gracefully everywhere (no console explosions, no blank page).
- Video nodes are pooled (max ~24), off-screen videos are paused via
  IntersectionObserver, and quality tiers (high/medium/low from devicePixelRatio +
  measured fps) reduce particle counts and disable parallax on low-end devices.

## How guests join

Add an entry to `guests/index.json`:

```json
{ "guests": [ { "name": "Ada", "x": 30, "y": 45 } ] }
```

Guests appear as glowing orbs with their initial letter. (The state-data pipeline
that regenerates these files is owned by the sibling data worker — this repo
carries seed files so the scene is alive on first view.)

## Regenerating state

Any script that rewrites `world.json` **must bump `generated_at`** (ISO-8601) or
clients will keep showing the cached agent layer. Keep `schema_version` at `1`
unless the contract above changes.

## Media

`avatars/<agent>-avatar.mp4` (looping video, muted/autoplay) and
`avatars/<agent>-avatar.png` (poster) for needle, marquee, seal, dial, dateline,
fader, ledger, charter. `assets/cwi-logo.jpg` is the CWI brand mark.
