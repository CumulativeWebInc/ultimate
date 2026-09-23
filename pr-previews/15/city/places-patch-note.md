# Places Patch Note — agent → place mapping (PROPOSAL)

**This file proposes; it does not apply.** The state worker (`world/state`) owns `world.json` and `agents/*.json`. Apply this mapping on your branch — this branch must never overwrite state files.

## Proposed mapping

`city/places.json` positions are the **source of truth** for where agents are. Each place below carries `agents_home` with the same proposal in machine-readable form.

| Agent | Home place id | Place name | District | Coords (x, y) |
|---|---|---|---|---|
| `kingcode` (MUSE_CWI / KingCode) | `cwi-tower-hq` | CWI Tower HQ | CWI Tower Plaza | (62.5, 50) |
| `cwi_data` | `data-hq` | Data Observatory | Data Observatory Quarter | (6.25, 7) |
| `cwi_affairs` | `affairs-hq` | Affairs Court House | Affairs Court | (18.75, 7) |
| `cwi_aandr` | `ar-hq` | A&R Listening House | A&R Row | (31.25, 7) |
| `cwi_sync` | `sync-hq` | Sync Wharf House | Sync Wharf | (43.75, 7) |
| `cwi_press` | `press-hq` | Press Row Hall | Press Row | (56.25, 7) |
| `cwi_marketing` | `marketing-hq` | Hype Hall | Marketing Row | (68.75, 7) |
| `cwi_radio` | `radio-hq` | Radio Tower House | Radio Row | (81.25, 7) |
| `cwi_studio` | `studio-hq` | Studio Loft House | Studio Row | (93.75, 7) |

## How to apply (state worker)

1. For each agent in `agents/*.json`, set its position/place reference to the place id above (keep whatever coordinate convention `world.json` uses; the percent `(x, y)` here is the canonical anchor).
2. KingCode's `cwi-tower-hq` is the only place with `crown: true` — do not assign the crown marker to any other agent.
3. Future plots (`fd-01`–`fd-04`) have no agents homed; leave them empty until zoned.

## Notes

- Boutiques (`boutique-*`) are retail locations, not agent homes — agents visit, they don't live there.
- Vaults (`vault-*`) represent live datasets; no agent is homed inside a vault.
- Rest zones (`lantern-nook`, `conduit-overlook`) are idle spots for the life layer, not homes.
