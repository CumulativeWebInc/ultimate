# Project Ultimate — Art Direction (Design System Spec v1.0.0)

**Status:** canonical. This is the coherence contract every worker (scene, state, market, life, realism) follows. If a render disagrees with this spec, the render is wrong.

## 1. Visual language: "rounded toy-like KingCode"

The city is a living playset, not a simulation grid. Every surface is soft and touchable:

- **Geometry:** rounded rectangles and circles only. Minimum corner radius 12 units on a 100-grid (`border_radius` tokens in `city/tokens.json`). No sharp-edged boxes anywhere.
- **Buildings:** squat, chunky, slightly oversized relative to streets — toy-block proportions. Rooftop details (water tanks, antennae) are simple circles/rounded caps.
- **Streets:** drawn as thick rounded ribbons with a lighter center line. Streets are 3–4% of grid width.
- **Depth:** flat colors + one offset hard shadow (`shadow.toy`: `0 4px 0 rgba(20,18,28,.18)`) + one soft ambient shadow. No gradients on building bodies (gradients reserved for sky/lighting overlays and glow).

## 2. Tokens

`city/tokens.json` is the machine-readable source. Key tokens:

| Token group | Highlights |
|---|---|
| `palette.base` | `ink #14121c`, `paper #f6f1e7`, `slate #2b2836` |
| `palette.brand` | `cwi-gold #f5b301`, `signal-cyan #46e0ff`, `brass #c9a227` |
| `palette.districts` | one accent per district — each department quarter owns its accent (see §5) |
| `palette.signage` | `on #ffe9a8` lit sign color; `off #6b6552` unlit |
| `type_scale` | display 34 / h1 24 / h2 18 / h3 14 / sign 13 / caption 11 / label 10 (px at 1200px canvas) |
| `border_radius` | sm 8 → 3xl 44 → full 999 |
| `lighting` | `dawn/day/dusk/night` overlays, sign-glow and window-light intensities |

### Usage rules

- District fills: base slate/ink darkened with the district accent at **18% opacity**; district accent used at 100% only for labels, trims, and signage.
- Signage text is always lit-signage color `#ffe9a8` on dark panels; at `day` the glow intensity drops to 0.25 but signs stay readable (never unlit-off during the day — stores are open).
- Vault conduits: `signal-cyan` at 70% opacity with `wave-violet` secondary pulses. Conduit animation is decorative; the static frame must still read as a conduit.
- Rest zones: `garden-green` base with lantern dots `#ffd97a` at dusk/night.

## 3. Typography

- Display/headline: a rounded sans (e.g. "Baloo 2", "Nunito" ExtraBold) — system fallback stack: `"Baloo 2","Nunito","Comic Sans MS","Chalkboard SE",system-ui,rounded,sans-serif`.
- Body/labels: same family, regular/semibold weights.
- Never use condensed, serif, or monospace type for signage or district names. Monospace is allowed only inside vault glyph readouts (data texture, not language).
- Minimum label size: `label 10px` at 1200px canvas; anything smaller must be icon-only.

## 4. CWI logo usage (brand rule: the logo goes on EVERYTHING)

- The official circular CWI badge ("MUSIC / Cumulative Web Inc. / & FILM") appears on: the CWI Tower facade, the map legend card, every boutique's awning medallion, and the city entry marker.
- **Clearspace:** one badge-radius of clear space on all sides.
- **Minimum size:** 24px digital / never below legible badge ring.
- **Never:** recolor the badge, stretch it, place it on clashing red/magenta, or add a crown to it. The badge is a circle; the crown is a separate glyph (see §6).
- In vector contexts where the badge artwork is unavailable, render the approved simplified mark: gold ring + "CWI" wordmark + "MUSIC & FILM" microtype (see `city/map.svg` logo group). This is a stand-in, not a redesign.

## 5. District palettes (coherence contract)

Each department quarter has exactly one accent; buildings in a quarter may only use ink/slate/paper/brass plus that accent. Digital-age districts follow the same one-accent rule:

| District | Accent | Token |
|---|---|---|
| Data Observatory | signal cyan | `signal-cyan` |
| Affairs Court | marble gold | `marble-gold` |
| A&R Row | needle magenta | `needle-magenta` |
| Sync Wharf | dock teal | `dock-teal` |
| Press Row | ink slate | `ink-slate` |
| Marketing Row | hype orange | `hype-orange` |
| Radio Row | wave violet | `wave-violet` |
| Studio Row | atelier rose | `atelier-rose` |
| CWI Tower Plaza | CWI gold | `ink-gold` |
| Market Row | market amber | `market-amber` |
| Ledger Halls | brass | `brass` |
| Dataset Vaults | vault indigo | `vault-indigo` |
| Rest Gardens | garden green | `garden-green` |
| Sound District (music) | sound pink | `sound-pink` |
| Stream District (media) | stream blue | `stream-blue` |
| Signal Exchange (comms) | signal teal | `signal-teal` |
| Social Courts (social) | social coral | `social-coral` |
| Play District (gaming) | play lime | `play-lime` |
| Print District (news) | print ivory | `print-ivory` |
| Gallery District (art) | canvas lilac | `canvas-lilac` |
| Learning Quarter (learning) | learn amber | `learn-amber` |
| Rights District (licensing) | rights bronze | `rights-bronze` |
| Future plots FD-01–FD-04 | future gray (dashed, hatched) | `future-gray` |

## 6. The crown rule (hard)

**The crown glyph is reserved for KingCode. It appears exactly once in the city: above the CWI Tower spire.** No department, store, vault, or ambient element may wear a crown, coronet, or crown-like silhouette. Violation = spec break; flag in review.

## 7. Lighting: time-of-day cycle

The scene owns the clock; the city follows. Four stops, lerped:

| Stop | Sky overlay | Sign glow | Window lights |
|---|---|---|---|
| dawn | warm peach wash | 0.55 | 0.35 |
| day | near-clear | 0.25 | 0.0 |
| dusk | violet-to-gold | 0.85 | 0.9 |
| night | deep ink | 1.0 | 1.0 |

Rules: lighting is an overlay layer — it must never change layout or hide labels. Window lights are per-building pseudo-random (seeded by place id, stable across frames). At dusk/night, window lights "flicker on" over ~2s (ambient layer).

## 8. Ambient vs. real (truth rule)

- Anything decorative (traffic dots, motes, flicker, conduit pulses) carries `data-ambient="true"` in DOM and is badged **"ambient"** in any UI.
- Ambient never writes to the activity ledger, never claims to be an agent, and never repositions an agent.
- If the ambient layer fails to load, the city must render fully and correctly without it.

## 9. Do / Don't

**Do**
- Round everything; keep toy-block proportions.
- Light signage in `#ffe9a8` with a soft glow.
- Name stores after the real SKU registry names (`stores.json` → `sku_name`).
- Badge ambient layers "ambient" in code and UI.
- Degrade gracefully: every visual feature has a text/data fallback.

**Don't**
- Don't invent shops ("Shop #3"), products, prices, or agent actions.
- Don't move the CWI Tower or duplicate the crown.
- Don't let a district borrow another quarter's accent.
- Don't present ambient traffic as real agents — the life layer owns real agent movement.
- Don't hardcode the 25-SKU list into renderers; consume `stores.json` (CI script `check-sku-coverage.py` enforces coverage).

## 10. Changelog

- **1.0.0 (2026-09-15):** initial canonical spec. Tokens, crown rule, lighting stops, ambient truth rule.
- **1.1.0 (2026-09-15):** digital-age expansion — 9 new district accents (sound-pink through rights-bronze), future-plot treatment (dashed + hatched), systems list in §2.
