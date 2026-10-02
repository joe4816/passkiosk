# GitHub front-end migration

The GitHub-hosted PassKiosk UI is intentionally separated from the Apps Script backend.

## Why a bridge is needed

The original Apps Script HTML page can call `google.script.run` directly. GitHub Pages cannot. A tiny Apps Script bridge page remains inside the Apps Script project and relays requests to a secure RPC wrapper.

## Kiosk authorization

An auto-launch ChromeOS kiosk has no ordinary CCSD Google user session. The kiosk bridge therefore uses a separate random device authorization key stored in Apps Script Script Properties.

The key is **not committed to GitHub**.

### Preferred: ChromeOS managed configuration

The GitHub client first checks the ChromeOS Web Managed Configuration API for:

- `PassKioskBridgeUrl`
- `PassKioskKioskKey`

If Google Admin exposes **Managed configuration** for the deployed PassKiosk web app, configure those two values there. This is the preferred unattended-appliance path because the repository and public launch URL contain no kiosk secret.

### Fallback provisioning

Outside a managed ChromeOS configuration, a one-time URL fragment can seed browser storage without sending the secret to GitHub's server:

`https://joe4816.github.io/passkiosk/#bridge=<encoded-apps-script-url>&kiosk=<random-key>`

The page stores those fallback values locally and removes the fragment from the visible address bar. This fallback should be used only when managed configuration is unavailable.

## Secure Apps Script RPC

Before creating a public kiosk-bridge deployment, the current browser-callable Apps Script entry functions must be made private by renaming them with a trailing underscore. The only browser-callable RPC functions should then be:

- `staffRpc(fn, args)` — checks that the active Google user is in `nv.ccsd.net`.
- `kioskRpc(key, fn, args)` — validates the kiosk key stored in Script Properties.

`apps-script/SecureRpc.gs` contains the dispatcher and exact function list.

The current Apps Script `Index.html` should change its `server()` adapter to call `staffRpc`, while the GitHub bridge calls `kioskRpc`.

## Deployment strategy

Keep the existing CCSD-restricted deployment while migration is underway.

After the secure RPC refactor is installed, create a separate kiosk-bridge deployment. If district policy permits an `Anyone` deployment, the secret-validated `kioskRpc` is the authorization layer for that deployment.

If district policy does not permit an unauthenticated deployment, stop and redesign the kiosk authentication path rather than weakening the public repository or student-data protections.

## Files

- `apps-script/Bridge.html` — hidden iframe relay
- `apps-script/SecureRpc.gs` — secure staff/kiosk RPC wrappers and dispatcher
- `bridge.js` — GitHub-side iframe RPC client
