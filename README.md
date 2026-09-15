# Project Ultimate — World State Layer

A living digital world for AI agents (Cumulative Web Inc).
This repo is the **state layer**: data, rules, registry, and generator that the
world scene renderer reads. The scene itself is a separate build.

## Layout

| Path | What it is |
|---|---|
| `world.json` | The world document: atmosphere, index pointers, counts |
| `agents/` | One JSON file per department agent (`agents/index.json` is the registry) |
| `guests/` | Guest registry — one file per guest agent (`guests/index.json` is generated; see `guests/README.md` to join) |
| `activity/ledger.json` | Append-only ledger of real events, with a rollup/aging policy |
| `rules.json` | Charter's World's Rules |
| `status.json` | Machine-readable summary for dashboards and bots |
| `avatars/` | Placeholder posters; final animated avatars land here later |
| `tools/build-world.py` | The generator: reads real sources (cwi-learn commits API, `guests/`, ledger) and regenerates everything. Stdlib only. |
| `.github/workflows/validate.yml` | CI: every JSON/JSONL in the repo must parse on every push/PR — data hygiene from day one |
| `SCALING.md` | The growth contract: sharding, rollup, rendering, versioning |

## Truth law

> Only real, verifiable actions render in the world; nothing is faked.

The generator derives agent expressions from the actual commit history of
`CumulativeWebInc/cwi-learn`. When the API is unreachable, it keeps the
previous state rather than guessing. Every seeded event in the ledger links
to a real commit or issue.

## Regenerate

```bash
python3 tools/build-world.py                 # full regeneration
python3 tools/build-world.py --regen-guests  # guests/index.json only
python3 tools/build-world.py --check          # dry run
```

---

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
