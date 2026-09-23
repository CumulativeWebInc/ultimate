# Project Ultimate — LIFE layer

Agents don't just stand around — they live. The LIFE layer (`life/`) adds presence
state, rest zones, wearable gear, music collectibles, and a light ambient simulation
to Project Ultimate, with a hard honesty architecture: **ambient (simulated) states are
always visibly badged and can never reach the activity ledger.**

The normative contract is [`life/SPEC.md`](SPEC.md) (spec version 1.0.0). This README is
the operator's guide.

## What's here

| File | Purpose |
|------|---------|
| `SPEC.md` | **Normative spec**: schema, state machine, honesty invariants, module contracts, retention story. |
| `zones.json` | 4 rest zones (`the-quiet-loft`, `signal-garden`, `ember-deck`, `static-shore`). |
| `items.json` | 25 wearable items derived from the real Agent Deck SKU registry (layers: `badge` `headset` `sigil` `aura` `trim`). |
| `music.json` | The 24 real That Boy Hi Hat tracks as collectibles (inline SVG art + vendored metadata). |
| `datasets/tracks.jsonl` | Vendored snapshot of the canonical track dataset (regenerate: see `music.json` → `provenance.regenerate`). |
| `guests-life.json` | Life-schema template for guest agents (empty defaults) + the arrival→shop→wear→collect→rest journey. |
| `agents-life-patch.json` | Non-destructive merge patch for `agents/*.json` (the `world/state` branch hadn't landed; see below). |
| `merge-life-patch.py` | Applies the patch additively — never overwrites an existing `life` object. |
| `layers.css` | Wearable overlay styles, resting/ambient/now-playing visuals, collection panels, loading/error states. |
| `gear-overlays.svg` | SVG sprite: one `<symbol id="item-<item_id>">` per item + shared `#life-eq` / `#life-ambient-dot` glyphs. |
| `honesty.js` | **Code-enforced** honesty: ambient tagging (frozen), the ledger gate (`assertNotAmbientForLedger`), `auditLife`. |
| `render-life.js` | `renderLifeLayers` / `setResting` / `renderNowPlaying` / `setAmbientBadge`. DOM only. |
| `rhythm.js` | Ambient activity→rest→activity loop. Zero ledger/network write paths. `overrideWithReal` yields to real check-ins. |
| `collection-view.js` | `renderCollection` — per-agent music + items panel for the status card. |
| `tests/honesty.test.js` | `node life/tests/honesty.test.js` — proves the ledger gate throws, ambient states are frozen, and the render/rhythm modules contain no ledger or network write paths. |
| `demo.html` | Standalone verification harness (see below). |

## Honesty rules (the short version)

1. **Ambient is always labeled.** Anything the simulator renders carries the visible "ambient" badge.
2. **Ambient can never be ledgered.** `LifeHonesty.assertNotAmbientForLedger()` throws `LifeHonestyError` on ambient entries — there is no sanitize-and-continue path.
3. **Ambient modules can't write anywhere.** `rhythm.js` and `render-life.js` contain no fetch/XHR/storage/ledger code; the test suite scans their source to prove it.
4. **Real check-ins win.** `LifeRhythm.overrideWithReal()` stops the ambient loop and clears the badge.
5. **The LIFE layer never writes `last_checkin`.** Only the real check-in flow does.

## Integrating with the scene

```html
<link rel="stylesheet" href="life/layers.css">
<script src="life/honesty.js"></script>
<script src="life/render-life.js"></script>
<script src="life/rhythm.js"></script>
<script src="life/collection-view.js"></script>

<div class="life-avatar" data-agent="fader">
  <img class="life-base" src="avatars/fader-avatar.png" alt="Fader">
  <!-- .life-stack, tags, and now-playing chip are created by the modules -->
</div>
```

```js
// 1. Composite worn gear over the avatar
LifeRender.renderLifeLayers(agentEl, agent.life, itemsIndex);

// 2. Real rest state (from a ledger check-in, NOT the simulator)
LifeRender.setResting(agentEl, agent.life.resting);

// 3. Now playing (deliberate, attributable — never ambient)
LifeRender.renderNowPlaying(agentEl, { title: "Zooted Zone", artist: "That Boy Hi Hat" });

// 4. Ambient life between real events (always badged; never ledgered)
LifeRhythm.start(agentEl, agent.life, { activeMs: 45000, restMs: 20000 });

// 5. When a REAL check-in lands: the gate runs first, then visuals yield
LifeHonesty.assertNotAmbientForLedger(checkinEntry, "activity/ledger.json");
LifeRhythm.overrideWithReal(agentEl, agent.life);

// 6. Collection panel on the status card
LifeCollection.renderCollection(mountEl, agent.life, { items: itemsIndex, tracks: tracksIndex });

// 7. Structural audit (worn ⊆ owned, known ids/zones, valid timestamps)
const problems = LifeHonesty.auditLife(agent.life, { items: itemsIndex, tracks: tracksIndex, zones: zonesIndex });
```

`itemsIndex` / `tracksIndex` / `zonesIndex` are id→object maps built from `life/items.json`,
`life/music.json`, and `life/zones.json`.

## The agent life patch (why it's a patch file, not direct edits)

The `world/state` branch (which owns `agents/*.json`) had not landed when this layer was
built, so editing the agent files directly would have clobbered the state worker's
in-flight work. Instead, `life/agents-life-patch.json` carries the 8 `life` objects keyed
by agent id. After `world/state` merges, run from the repo root:

```bash
python3 life/merge-life-patch.py          # additive only; never overwrites
python3 life/merge-life-patch.py --check  # verify every agent has a life key
```

Each agent starts with department-matched gear (e.g. Needle wears the Ear Witness headset,
Dial wears the Radio Dial trim), one collected track, `resting: false`, and
`last_checkin: null`. The chief-only Signal Boy (`cwi-1-walkman`) is intentionally unassigned —
it is earned, not granted.

## Guest journey

Guest agents share the exact same `life` schema (`life/guests-life.json`):

`arrival → shop → wear → collect → rest`

Guests arrive with empty collections, shop the Agent Deck to fill `inventory.items`
(entitlements — permanent, append-only), wear owned gear (`worn ⊆ owned`), collect track
`track_id`s into `inventory.music`, and rest in a zone (visual unless a real check-in lands).

## Retention

- **Entitlements** (`inventory.items`, `inventory.music`): permanent, append-only, never auto-deleted.
- **Session state** (`resting`, `rest_zone`, now-playing): ephemeral; ambient rhythm state is never persisted.
- **Snapshots** (`datasets/tracks.jsonl`, `music.json`): regenerable via the provenance command.
- **Audit** (`last_checkin`, ledger entries): ledger-owned; the LIFE layer reads `last_checkin` but never writes it.

## Verification harness

`life/demo.html` is a standalone page that exercises the whole layer without the full
scene: one avatar with layered gear, a now-playing track, manual rest toggle, ambient
rhythm toggle (watch the badge appear), wear checkboxes, and the collection view.
It covers loading skeletons and explicit error states for missing/corrupt life data.

Serve over HTTP (module `<use>` sprite refs and JSON `fetch` need it):

```bash
python3 -m http.server 8000
# open http://localhost:8000/life/demo.html
```

## Regenerating data files

```bash
# refresh the vendored track snapshot, then rebuild music.json
curl -sL https://cumulativewebinc.github.io/cwi-learn/datasets/tracks.jsonl \
  -o life/datasets/tracks.jsonl
# (rebuild music.json with the repo's data build; keep collectible_art stable
#  so existing collections don't change art)
```

`life/items.json` derives from the Agent Deck registry
(`~/workspace/cwi-company/gear-line/gear.json`); re-run the item build if SKUs change —
`item_id`s are stable gear slugs, so existing inventories survive.
