# Murmuration — in-world dashboard

The living face of the Global Pulse inside Project Ultimate.

- `index.html` — the dashboard. Fetches `pulse.json` from this same directory
  (relative path, `cache: no-store`) and renders the heartbeat: signal sources,
  trending themes, rising tools, gaps, sentiment, per-region notes, evidence,
  method. Designed states: loading skeleton, error + retry, per-section empty
  states. A canvas starling murmuration wheels overhead — the swarm, visualized.
- `pulse.json` — the latest snapshot, republished by the daily
  `cwi-global-pulse` cron (`intelligence/pulse/publish.py`). Schema 1.0.0.
- `cwi-logo.jpg` — the official CWI badge, per the brand rule (logo on everything).

Truth contract: this page never invents data. If `pulse.json` is missing or
fails schema validation, it says so. If a source was dry, its pill says dry.
