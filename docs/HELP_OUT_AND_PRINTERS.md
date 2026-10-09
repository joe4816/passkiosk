# Help out and saved printers

Client build: 0.3.21-help-printers.

Each workflow has Help out and Select printer controls beside Send. Help out uses active Helper adults sorted by the surname in Source Name, then first name, displaying Display Name. Selecting an adult updates that tab's adult display and attached default location: Corridor From, Request destination, detention Report To and optional pickup destination, or the Activity Bus location display. Locations on editable forms remain editable. Other tabs keep their adults. Tab switches and successful submissions preserve the selection within that session; a new session initializes every tab to the authenticated operator.

Transactions keep Session Username / Session User for the actual operator. Corridor passes now populate Issued By Username / Issued By and Signature File for the selected adult. Request, detention and bus retain their workflow-specific adult columns. Linked detention pickup requests use the detention issuer. A blank signature stays blank.

## Printer preferences

Helper!I3 is Printer Preferences. Each active user row stores six stable keys:

`Default|Corridor|Request|Det|Lunch|Bus`

An empty default triggers first-time setup, which initializes all empty positions once. Returning users load the default automatically and each workflow's saved key. Empty workflow positions fall back to Default. EMAIL_PDF represents the existing PDF-only output option. PDF email remains independently available with a physical printer.

Select printer saves only its workflow slot. Saving uses a script lock and re-reads the cell before updating it, preserving other slots. Preferences are keyed to the authenticated operator even while helping another adult. The staff RPC rejects attempts to update another session owner's preferences.

A configured printer is required before submitting. A removed default prompts for replacement while preserving workflow overrides; a removed workflow printer stays visibly unavailable until manually replaced. No physical fallback is silently chosen.

Settings changes Default without resetting existing workflow choices. Reprint confirmation names the current default printer, and its key is sent explicitly with the request. Every normal submission carries its selected key in a request-local session copy, avoiding session-wide routing changes between forms.

## Apps Script installation

The live project embeds the preference functions and workflow helper functions in Code.gs. Do not install duplicate definitions. For another installation:

1. Set Helper!I3 to Printer Preferences without overwriting user data.
2. Add the contents of apps-script/UserPreferences.gs once, either in Code.gs or its own file.
3. Install current SecureRpc.gs, PdfEmail.gs and built StaffBridge.html.
4. In Code.gs submitWorkflow_, read cfg first, then resolve:

```js
const cfg = readHelperConfig_();
const session = sessionForPrinterRequest_(requireSession_(token),request,cfg);
```

5. Replace the Corridor wrapper:

```js
function buildPassTx_(tx, student, data, cfg) {
  return helpOutPassTransaction_(buildPeriodPassTx_(tx, student, data, cfg),data);
}
```

6. Include sourceName: a.sourceName in publicAdult_.
7. Use data.issuedByUsername || session.username for requestedByUsername in detentionPickupData_ (current WorkflowOptions.gs includes this).
8. Extend reprintJob_ to accept printerKey as argument four, retaining the legacy fallback:

```js
const originalSession = requireSession_(token);
const session = printerKey === undefined ? originalSession
  : sessionForPrinterRequest_(originalSession,{printerKey},readHelperConfig_());
```

9. Run testUserPrinterPreferences (read-only), rebuild StaffBridge using scripts/build-staff-app.py, and update the existing staff deployment.

Activity Bus remains staged behind its existing feature flag. Its current source includes request-local routing and selected adult location; this update does not activate transportation integration.

Validation: node --test tests/*.cjs tests/*.mjs. The suite covers first-time initialization, independent users and workflow slots, default fallbacks, invalid keys, request-local routing, Help out isolation/reset/location, blank signatures, startup restoration, failed saves, PDF email, routing, bus reliability and generated staff-app syntax.
