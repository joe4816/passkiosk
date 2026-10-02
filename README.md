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

GitHub Pages still needs to be enabled for `main / root` before this URL becomes live.

## Current migration status

The GitHub client shell, PWA manifest, offline shell cache, vendored QR decoder, secure bridge client, and split workflow modules are in this repository.

The Apps Script backend has **not yet been migrated to the secure RPC wrappers in production**. Do not create an unauthenticated/public Apps Script deployment until that refactor is installed and tested.

## Activity Bus

The Activity Bus lane remains intentionally scaffolded but not wired to `Bus_Info` yet. Honk audio and duplicate-scan handling also remain unwired.
