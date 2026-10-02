# PassKiosk security notes

PassKiosk is a school operational application. The public GitHub repository is treated as untrusted/public storage.

## Never commit

Do not commit any of the following:

- student records or exported rosters
- Wi-Fi passwords
- Apps Script kiosk authorization keys
- print-worker keys
- Google credentials, cookies, OAuth tokens, or service-account files
- private staff information not already intended for public display
- printer credentials or other privileged infrastructure secrets

## Browser/backend boundary

The GitHub Pages client does not receive direct Google Sheets credentials.

Google Apps Script remains the authority for:

- active-adult validation
- student lookup
- detention scheduling
- transaction creation
- processing-error logging
- print queue creation
- reprint authorization

All implementation functions exposed through the browser boundary should be private Apps Script functions ending in `_`. Google documents that private functions cannot be called with `google.script.run`.

Only the explicit wrappers `staffRpc` and `kioskRpc` should dispatch browser requests.

## Kiosk key

The unattended ChromeOS kiosk uses a high-entropy bearer key stored in Apps Script Script Properties and provisioned only to the kiosk browser.

The key must never be placed in this repository.

If compromise is suspected, generate a new kiosk key, update the kiosk configuration, and invalidate the previous value.

## Third-party JavaScript

The QR decoder is vendored in this repository instead of loaded from a third-party CDN. This reduces exposure of kiosk-side browser storage and runtime data to external script origins.

## Activity Bus

Activity Bus transportation lookup remains intentionally disabled until the Bus_Info data contract is finalized.
