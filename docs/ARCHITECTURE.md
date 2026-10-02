# PassKiosk Architecture

PassKiosk is split into three layers:

1. **GitHub Pages / PWA** — the browser and ChromeOS kiosk user interface.
2. **Google Apps Script backend** — configuration, student lookup, transaction creation, detention scheduling, session validation, and the print-job queue.
3. **Local print worker** — school-network print brain that polls queued print jobs and sends ESC/POS or PostScript to the selected printer.

## Permanent kiosk origin

The intended ChromeOS kiosk origin is:

`https://joe4816.github.io/passkiosk/`

This should become the auto-launch kiosk app once the GitHub Pages front end is ready.

## Browser-to-Apps-Script bridge

The current Apps Script-hosted UI uses `google.script.run`. A GitHub-hosted page cannot call that API directly.

The planned migration keeps Apps Script as the backend and adds a minimal Apps Script bridge page. The GitHub page communicates with that bridge, and the bridge invokes the existing backend functions.

The bridge uses a secure RPC boundary:

- real browser-facing implementations are renamed with a trailing underscore so Apps Script treats them as private;
- `staffRpc(fn, args)` validates a signed-in `nv.ccsd.net` user for the CCSD-restricted Apps Script UI;
- `kioskRpc(key, fn, args)` validates the unattended kiosk bearer key stored in Script Properties;
- the bridge accepts messages only from the PassKiosk GitHub Pages origin;
- only an explicit allowlist of PassKiosk methods can be dispatched;
- spreadsheet IDs, worker keys, credentials, student data, and other private operational data stay out of the public repository.

Do not create a public/anonymous Apps Script kiosk deployment until this private-function/RPC refactor has been installed and tested.


## Staff identity

For ordinary staff access, Google Workspace authentication is the identity source. The backend reads the signed-in `@nv.ccsd.net` account, converts it to the CCSD username, and resolves that username against the active Adults configuration.

The staff front door therefore does **not** ask “Who are you?” after Google sign-in. It shows the resolved profile and proceeds to printer selection. The backend also forces `startSession` to use the authenticated adult rather than trusting a client-supplied username.

The dedicated managed kiosk authorization path remains separate because ChromeOS kiosk mode does not provide an ordinary signed-in Google user session.

## Printing

Printing remains a separate concern from transaction creation.

- A transaction is created once the submitted workflow is valid and the document snapshot is successfully built.
- A physical print attempt is recorded separately in `Print_Jobs`.
- Reprints create a new print job but do not create a duplicate transaction.
- The local worker remains responsible for school-network printer access.

## Activity Bus

The Activity Bus lane is intentionally scaffolded but not wired to `Bus_Info` yet.

The following remain deliberately disconnected until the transportation contract is finalized:

- Bus_Info lookup
- automatic Activity Bus printing
- duplicate-scan override flow
- honk MP3 behavior

## Public repository rule

This repository may contain client code, documentation, and non-secret configuration needed by the browser.

It must not contain:

- Wi-Fi passwords
- private worker keys
- confidential student records
- private Google credentials
- service-account secrets
- printer credentials
- any other secret required to access school systems
