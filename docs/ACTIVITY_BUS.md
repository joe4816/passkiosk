# Activity Bus integration

## Status

The data contract is now defined and the GitHub client/backend integration code is staged.

Physical printing is intentionally outside this workstream. Activity Bus can be enabled first for lookup, authorization, duplicate handling, and transaction audit.

The public client feature gate remains off until the Apps Script backend receives `BusIntegration.gs` and the secure deployment is updated:

```js
features: {
  activityBusData: false
}
```

## Source

PassKiosk reads the configured source from the Helper sheet:

- Student Spreadsheet ID
- Bus Sheet

Current Bus sheet contract:

`Bus_Info`

Required source headers:

- `StudentId`
- `Sped`
- `Bus From Route`
- `Bus From Run`
- `Bus From School Time`
- `Bus From Dropoff Address`
- `Bus From Dropoff Time`
- `Bus From Days`
- `Bus From Assignment Count`

The source can contain more than one row for a student.

A row is a usable Activity Bus assignment only when it has both:

- `Bus From Route`
- `Bus From Dropoff Address`

This deliberately permits a source row to preserve an additional morning assignment while contributing no Activity Bus home assignment.

`Sped` is informational only. It is not transportation eligibility.

## Source audit — 2026-10-04

The live `Bus_Info` tab was checked against this contract before integration work continued:

- 593 transportation rows;
- 589 unique student IDs;
- 586 students with one usable Bus From assignment;
- 3 students with two usable Bus From assignments;
- 1 source row with blank Bus From fields that belongs to a student who has another valid home assignment;
- 0 duplicate usable Bus From rows;
- 0 mismatches between the source `Bus From Assignment Count` and the number of usable assignments produced by the contract.

This validates the decision to preserve multiple assignments and to ignore AM-only rows for Activity Bus rather than forcing one row per student.

## Lookup behavior

The client calls:

`getBusInfo(token, studentId)`

The backend returns all usable From-School assignments for the student. It does not collapse multiple assignments into one.

Each returned assignment contains:

- route
- run
- school departure time
- drop-off address
- drop-off time
- riding days

## Authorization behavior

The Activity Bus lane is single-student only.

The scan/selection itself is approval. There is no additional confirmation button.

Approved By defaults to the logged-in adult but may be changed to another active PassKiosk adult.

A successful normal scan creates one `BUS` transaction and then returns the lane to scanning.

No Print_Jobs row is created by the staged bus integration. Printing is a separate later step.

## No transportation record

When no usable Bus From assignment exists:

- show `NO BUS INFO ON FILE` prominently;
- play the audible alert;
- create no transaction;
- create no authorization;
- show a 3-second countdown;
- return to scanning.

## Duplicate scan

A BUS transaction already recorded for the same student on the same local school day triggers:

`ALREADY SCANNED TODAY`

Behavior:

- play the audible alert;
- show a 5-second countdown;
- create no new transaction on the first duplicate scan;
- rescanning/selecting the same student during that 5-second window records the duplicate.

The duplicate transaction is independently auditable and stores:

- `Bus Scan Type = DUPLICATE`
- `Duplicate Of Transaction ID = <original transaction>`

A normal first scan stores:

- `Bus Scan Type = NORMAL`

The backend re-checks duplicate state while holding the script lock so two kiosks cannot both classify concurrent first scans as normal.

## Transaction snapshot

The Transactions sheet stores the normal session/student/audit fields plus:

- `Bus Route(s)`
- `Bus Drop-off(s)`
- `Bus Assignment Count`
- `Bus Scan Type`
- `Duplicate Of Transaction ID`
- `Bus Snapshot`

`Bus Snapshot` is the immutable transportation snapshot used for later output/audit. A later refresh of Bus_Info must not rewrite an existing transaction.

The actual kiosk/session user remains in:

- `Session Username`
- `Session User`

The selected approving adult remains in:

- `Approved By Username`
- `Approved By`

This preserves who physically operated PassKiosk separately from who approved the Activity Bus pass.

## Scanner behavior

The camera scanner remains open in Activity Bus mode for rapid scanning.

A QR code must leave the camera view before the same student number can fire again. This prevents a held QR code from accidentally generating the duplicate override while still allowing a deliberate remove-and-rescan during the five-second duplicate window.

Search/manual student selection uses the same backend rules.

## Backend installation

Add to the bound Apps Script project:

- `apps-script/BusIntegration.gs`
- current `apps-script/SecureRpc.gs`

The secure RPC allowlist exposes:

- `getBusInfo`
- `submitBusWorkflow`

Then run manually from the Apps Script editor:

`testBusIntegration_()`

The check must succeed before enabling the client feature flag. It verifies the Bus_Info source headers and required Activity Bus transaction headers, then reports aggregate source-health counts including unique students, multiple assignments, blank Bus From rows, duplicate usable assignments, and source-count mismatches. It does not return student transportation records.

## Activation gate

Only after the Apps Script deployment containing the bus integration is live:

1. Verify `testBusIntegration_()` succeeds.
2. Smoke-test a student with one assignment.
3. Smoke-test a student with multiple valid From assignments.
4. Verify a no-bus result creates no transaction and resets after 3 seconds.
5. Verify a second scan on the same day produces the 5-second duplicate warning.
6. Rescan within the window and verify a second transaction is stored as `DUPLICATE`.
7. Confirm the original transaction is unchanged.
8. Change `activityBusData` to `true` in `config.js`.

Printing remains disabled/unrelated during these tests.
