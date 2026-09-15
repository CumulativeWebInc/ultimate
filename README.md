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
- Video nodes are pooled (~24 target), off-screen videos are paused via
  IntersectionObserver, and quality tiers (high/medium/low from devicePixelRatio +
  measured fps) reduce particle counts and disable parallax on low-end devices.
- **No hardcoded agent caps**: if more agents exist than the pool target, overflow
  nodes are created (off-screen culling keeps playback bounded) — no agent is
  ever silently dropped.

### Schema versioning & deprecation policy

Every JSON document in this repo carries `schema_version` (currently `1`).
Clients MUST tolerate unknown fields and MUST NOT assume fields beyond the
contract above. When a breaking change is needed: bump `schema_version`, keep the
old contract readable for **at least 14 days** (support N and N−1), and note the
change in this README. Additive fields never require a version bump.

### Loading, error, and empty states (all designed)

- **Loading**: branded splash (CWI logo + spinner + "Waking the world…") until the
  first successful state load.
- **Error**: if state is unreachable twice in a row, a designed banner explains the
  retry; the last-known world stays on screen.
- **Empty**: no agents yet → a centered sky message; no ledger entries →
  "Ledger quiet — no activity yet."; no `rules.json` → "Rules incoming — Charter
  is drafting the World's Rules."

### Data retention

The scene shows a rolling window of the **20 most recent ledger entries**; the
full activity history is retained in the repo as JSON. State files are static and
CDN/cache friendly — clients use cache-busting only for `world.json`, the
contract root.

### Seed data honesty

The `agents/*.json`, `guests/index.json`, and `activity/ledger.json` files in
this repo are **seed data** — hand-written placeholders so the scene is alive on
first view until the data pipeline takes over regeneration. They are not claims
of fact. Nothing here is invented to mislead: persona lines and roles describe
the fictional world layer only.

## Architecture (for a stranger's team)

```
index.html      → shell: canvas, stage, panels, watermark, state UI
world.css       → scene styling, expressions, panels, state UI
world.js        → sky renderer + state loader + agent/guest/ledger renderers
world.json      → contract root (schema_version, generated_at, index pointers)
agents/         → index + one file per agent
guests/         → index of guest orbs
activity/       → ledger.json (append-only entries)
avatars/        → looping MP4 + PNG poster per agent (cache-friendly static)
assets/         → CWI logo (watermark, loading splash)
```

To integrate: fetch `world.json`, resolve the index pointers, render per-agent
files as above, and bump `generated_at` on every regeneration. The scene never
sends data back — it is read-only.

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
