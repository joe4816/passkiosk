# GitHub front-end migration

The GitHub-hosted PassKiosk UI is intentionally separated from the Apps Script backend.

## Why a bridge is needed

The original Apps Script HTML page can call `google.script.run` directly. GitHub Pages cannot. A tiny Apps Script bridge page remains inside the Apps Script project and relays a small allowlisted set of calls from the GitHub origin.

## Kiosk authorization

An auto-launch ChromeOS kiosk has no ordinary CCSD Google user session. The kiosk bridge therefore uses a separate random device authorization key stored in Apps Script Script Properties.

The key is **not committed to GitHub**.

At initial kiosk setup, the GitHub URL can be launched once with:

`?bridge=<apps-script-kiosk-deployment-url>&kiosk=<random-key>`

The page stores those values in the kiosk browser's local storage and immediately removes them from the visible address bar. The permanent GitHub repository contains neither value.

## Apps Script deployment strategy

Keep the existing CCSD-restricted deployment for the current Apps Script-hosted UI while migration is underway.

Create a separate kiosk-bridge deployment after `Bridge.html` and the `doGet(e)` bridge branch are installed. If district policy permits an `Anyone` deployment, the bridge secret is the kiosk authorization layer. The default Apps Script UI does not need to be used through that deployment.

If district policy does not permit an unauthenticated deployment, stop and redesign the kiosk authentication path rather than weakening the public repository or student-data protections.

## Files

- `apps-script/Bridge.html` — hidden iframe RPC relay
- `apps-script/KioskBridge.gs` — merge-ready Apps Script bridge/key functions
- `bridge.js` — GitHub-side iframe RPC client
