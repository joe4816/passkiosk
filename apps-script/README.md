# Apps Script migration files

This directory contains the secure bridge pieces for migrating the PassKiosk UI to GitHub Pages.

- `SecureRpc.gs` — the only browser RPC boundary for staff and kiosk clients.
- `Bridge.html` — hidden iframe relay used by the GitHub client.
- `PRODUCTION_MIGRATION.md` — exact edits to the production Code.gs supplied on 2026-10-02.

The production backend is intentionally **not** copied verbatim into this public repository because it contains deployment-specific identifiers and configuration. Those values should remain in Apps Script / Script Properties / the Helper sheet rather than public source control.

Do not deploy the Apps Script project for unauthenticated access until the migration checklist has been completed.
