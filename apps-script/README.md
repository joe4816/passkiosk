# Apps Script migration files

This directory contains the secure bridge pieces for migrating the PassKiosk UI to GitHub Pages.

- `SecureRpc.gs` — the only browser RPC boundary for staff and kiosk clients.
- `Bridge.html` — hidden iframe relay used by the GitHub client.
- `PRODUCTION_MIGRATION.md` — exact edits to the production Code.gs supplied on 2026-10-02.

The production backend is intentionally **not** copied verbatim into this public repository because it contains deployment-specific identifiers and configuration. Those values should remain in Apps Script / Script Properties / the Helper sheet rather than public source control.

Do not deploy the Apps Script project for unauthenticated access until the migration checklist has been completed.


## Activity Bus

`BusIntegration.gs` contains the staged non-printing Activity Bus backend:

- reads all usable `Bus From` assignments from the configured `Bus_Info` sheet;
- preserves multiple assignments;
- checks same-day BUS transactions;
- records normal/duplicate scan audit fields;
- stores an immutable transportation snapshot;
- intentionally creates no `Print_Jobs` row.

Install it with the current `SecureRpc.gs`, run `testBusIntegration_()`, and follow `../docs/ACTIVITY_BUS.md` before enabling the public client feature gate.

## Pending function replacements

See `patches/README.md` for tested detention zero-window and explicit Excused patches. These replace named functions inside Code.gs; do not add them as duplicate function definitions. They remain staged, and client gates remain off pending live backend verification.
