# Production Apps Script migration patch

This patch is based on the production `Code.gs` supplied on 2026-10-02.

Do **not** make the kiosk bridge deployment public until every item in this file is complete and the CCSD-restricted deployment still passes its smoke test.

## 1. Add files

Add these repository files to the bound Apps Script project:

- `apps-script/SecureRpc.gs`
- `apps-script/Bridge.html`

## 2. Replace doGet

Replace the current no-argument `doGet()` with:

```javascript
function doGet(e) {
  const p = (e && e.parameter) || {};

  if (String(p.bridge || '') === '1') {
    return servePassKioskBridge_();
  }

  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('PassKiosk')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}
```

The print-worker `doPost(e)` remains separate and unchanged by the RPC boundary.

## 3. Rename browser-callable implementations

Rename these functions in `Code.gs` by adding a trailing underscore:

| Current | Secure name |
| --- | --- |
| `getFrontDoorConfig` | `getFrontDoorConfig_` |
| `identifyAdult` | `identifyAdult_` |
| `startSession` | `startSession_` |
| `signOut` | `signOut_` |
| `changePrinter` | `changePrinter_` |
| `getBootstrapData` | `getBootstrapData_` |
| `getStudentDetails` | `getStudentDetails_` |
| `getDetentionAvailability` | `getDetentionAvailability_` |
| `submitWorkflow` | `submitWorkflow_` |
| `getRecentPrintJobs` | `getRecentPrintJobs_` |
| `reprintJob` | `reprintJob_` |

These names exactly match the allowlist in `SecureRpc.gs`.

## 4. Protect editor-only functions

The current production file also contains browser-callable administrative helpers. Rename them:

- `generatePrintWorkerKey` → `generatePrintWorkerKey_`
- `testPassKioskConfig` → `testPassKioskConfig_`

They remain runnable manually from the Apps Script editor but are not exposed to `google.script.run`.

This is particularly important for `generatePrintWorkerKey`: leaving it browser-callable would allow a public web-app visitor to rotate the print-worker secret.

## 5. Update the legacy Apps Script Index adapter

The current Apps Script-hosted UI can remain available during migration.

Find its `server(fn,...args)` helper and replace the direct dynamic call with:

```javascript
function server(fn, ...args) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(e => reject(new Error(e && e.message ? e.message : String(e))))
      .staffRpc(fn, args);
  });
}
```

Everything else in the legacy Apps Script UI can remain unchanged.

## 6. Optional print-worker health check

The production code supplied on 2026-10-02 supports `worker.poll` and `worker.complete` but not `worker.ping`.

The 0.2 print-worker package includes a health check. Add this immediately after `const action = ...` inside `doPost(e)`:

```javascript
if (action === 'worker.ping') {
  validateWorkerKey_(body.workerKey);
  return jsonOutput_({
    ok: true,
    service: 'PassKiosk Print Worker API',
    schemaVersion: PK.SCHEMA_VERSION
  });
}
```

This is additive and does not change queue behavior.

## 7. Pre-public-deployment tests

Before creating any deployment with unauthenticated access:

1. Save all Apps Script files.
2. Run `testPassKioskConfig_` from the editor; it must complete.
3. Open the existing CCSD-restricted deployment.
4. Verify `staffRpc` can see the signed-in CCSD account.
5. Enter a known active username and reach printer selection.
6. Create one harmless test Pass and confirm a transaction + queued print job.
7. Verify calling an old direct function name from the client is no longer possible.
8. Run `generateKioskBridgeKey_` once and store the returned value privately.
9. Only then create the separate kiosk-bridge deployment.

If step 4 fails because Apps Script returns a blank active-user email in the current deployment mode, stop before making anything public. The staff-authentication gate must be redesigned rather than removed.
