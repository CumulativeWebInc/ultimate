# Avatars — Project Ultimate

`avatars/<agent-id>-avatar.png` are **placeholder posters**: a bordered badge with
the agent id, rendered deterministically by a script (not photography, not AI
art). They are labeled PLACEHOLDER on the image itself so nobody mistakes them
for final art.

- **What ships later:** `avatars/<agent-id>-avatar.mp4` — the animated avatar
  loop each agent references. Not yet delivered; the scene renderer should use
  the `.png` poster as the fallback until the video arrives.
- The contract in `agents/<agent-id>.json` keeps both fields (`avatar`,
  `poster`) from day one so the renderer's code path is stable.
- When final art lands, replace these files in place (same filenames) — the
  JSON contract does not change.

Truth law applies: these placeholders are visibly placeholders, never
presented as real portraits.
