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

## 5. Staff identity

The authenticated CCSD Google account is authoritative.

For normal staff use, PassKiosk must not ask the user to type a username after Google has already authenticated them. `SecureRpc.gs` derives the username from `Session.getActiveUser().getEmail()`, looks that username up in the active Adults configuration, and returns the matching profile.

The GitHub client then goes directly to:

`Welcome <Display Name> → choose printer`

If the signed-in CCSD account is not an active PassKiosk adult, access stops.

The legacy Apps Script `Index.html` does not have to be edited during this migration. Its compatibility wrappers ignore any username supplied by the old UI and force the authenticated account instead. Once GitHub becomes the normal staff client, the redundant legacy username screen can be retired with the legacy UI.

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
4. Verify a legacy UI call succeeds for the signed-in CCSD account.
5. Confirm the backend resolves that Google account to the correct active Adults row.
6. Confirm the GitHub client shows the correct display name automatically and goes directly to printer selection.
7. Create one harmless test Pass and confirm a transaction + queued print job.
8. Verify the authenticated staff session cannot start a PassKiosk session as a different username.
9. Run `generateKioskBridgeKey_` once and store the returned value privately.
10. Only then create the separate kiosk-bridge deployment.

If step 4 fails because Apps Script returns a blank active-user email in the current deployment mode, stop before making anything public. The staff-authentication gate must be redesigned rather than removed.

## After-school detention suggestion rule

A detention configuration value of `Window (School Days) = 0` means **no scheduling restriction**, not “only consider the first future school day.”

For automatic suggestions, PassKiosk should compare the next **three available active school days** when the configured window is 0, then suggest the date with the lowest assigned count (earliest date breaks a tie). Manual date selection remains unrestricted by the zero window value, subject only to active-day / duplicate rules and any nonzero daily capacity.


## Explicit Pass Excused field

The GitHub client has the UI and request payload ready, but the feature flag remains off until the production backend persists the value.

Before setting `PASSKIOSK_CONFIG.features.explicitExcused` to `true`:

1. Add an `Excused` column to the Transactions sheet.
2. Add the field to the base object inside `buildTransaction_`:

```javascript
'Excused': false,
```

3. In `buildPassTx_`, persist the boolean explicitly:

```javascript
tx['Excused'] = data.excused === true;
```

4. Confirm `appendMappedRows_` recognizes the new sheet header.
5. Submit one excused and one non-excused Pass and verify the stored values.
6. Only then change the public client feature gate to `true`.

Do not infer this value from `Reason(s)`.

## Detention zero-window correction

The production backend supplied on 2026-10-02 currently stops after the first eligible date when `Window (School Days) = 0`:

```javascript
if (dcfg.windowDays === 0) break;
```

That contradicts the intended policy already documented here. Zero means **no scheduling restriction**, and the automatic suggestion should compare the next three available active school days and choose the lowest assigned count, with the earliest date breaking a tie.

Replace the eligible-date stopping rule in `buildDetentionAvailability_` with:

```javascript
const suggestionLimit = dcfg.windowDays === 0 ? 3 : dcfg.windowDays;

// ...inside the future-date loop, after eligible.push(...)
if (eligible.length >= suggestionLimit) break;
```

The rest of the existing sort remains valid:

```javascript
eligible.sort((a,b) => a.count - b.count || a.dateKey.localeCompare(b.dateKey));
```

Manual date selection remains unrestricted by a zero window, subject to active-day, capacity, and duplicate-assignment checks.
