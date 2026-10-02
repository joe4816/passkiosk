# PassKiosk

Becker Middle School PassKiosk.

## Current architecture

- **GitHub Pages / PWA:** browser and ChromeOS kiosk UI
- **Google Apps Script:** backend, config, student lookup, transaction logging, detention logic, print queue
- **Local print worker:** sends queued jobs to the school-network printers

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current design.

## Kiosk target

Planned permanent kiosk URL:

`https://joe4816.github.io/passkiosk/`

## Status

The Activity Bus lane is intentionally not wired to `Bus_Info` yet.
