# PassKiosk

Becker Middle School PassKiosk.

## Current architecture

- **GitHub Pages / PWA:** browser and ChromeOS kiosk UI
- **Google Apps Script:** backend, config, student lookup, transaction logging, detention logic, print queue
- **Local print worker:** sends queued jobs to the school-network printers

See:
- [Architecture](docs/ARCHITECTURE.md)
- [GitHub migration](docs/GITHUB_MIGRATION.md)
- [PassGen kiosk policy](docs/KIOSK_ADMIN.md)
- [Security notes](SECURITY.md)

## Kiosk target

Planned permanent kiosk URL:

`https://joe4816.github.io/passkiosk/`

GitHub Pages is enabled and publishing from `main / (root)`.

## Staff identity

For normal staff use, the signed-in CCSD Google account is the PassKiosk identity; the GitHub client does not ask the staff member to type a username again.

## Current migration status

The GitHub client shell, PWA manifest, offline shell cache, vendored QR decoder, secure bridge client, and split workflow modules are in this repository.

The Apps Script backend has **not yet been migrated to the secure RPC wrappers in production**. Do not create an unauthenticated/public Apps Script deployment until that refactor is installed and tested.

## Activity Bus

The Activity Bus data path is now implemented in the repository. `apps-script/BusIntegration.gs` reads the configured `Bus_Info` tab, preserves multiple valid `Bus From` assignments, checks same-day duplicates, and records Activity Bus transactions without creating a print job. The browser lane includes the 3-second no-data reset and 5-second duplicate rescan override. The feature remains gated off until the additive Apps Script file and updated secure RPC are installed in production. Physical printing remains separate.
