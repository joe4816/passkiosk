# PrintHub endpoint activation — Receipt Printer 1

This is the production activation sequence for the first PassKiosk receipt route.

## Scope

Only this route is activated first:

- Printer Key: `RECEIPT1`
- Route ID: `RECEIPT1`
- Route Label: `Receipt Printer 1`
- Endpoint ID: `PH-FRONT-RECEIPT-01`
- Endpoint Type: `CHROMEOS_BROWSER`
- Binding Key: `RECEIPT1`
- Media Profile ID: `80MM_RECEIPT`
- Renderer ID: `PASSKIOSK_RECEIPT`

Receipt Printer 2 and all copier routes remain out of scope until Receipt Printer 1 succeeds end-to-end.

## Existing legacy jobs

Old `Print_Jobs` rows with blank `Endpoint ID` are intentionally ignored by the new endpoint poller.

Do not backfill the new routing columns on old queued jobs.

## Required Print_Jobs columns

The migration is additive. These columns must exist to the right of the legacy fields:

```
Job Group ID
Copy Role
Route ID
Route Label
Endpoint ID
Endpoint Type
Binding Key
Media Profile ID
Renderer ID
Claim ID
Claimed At
Claimed By
Lease Expires At
Print Invoked At
Attempt Number
Parent Job ID
```

## Apps Script files

Install the full current source of:

```
apps-script/PrintHubEndpoint.gs
```

The live `Code.gs` must also:

1. dispatch `endpoint.ping`, `endpoint.poll`, and `endpoint.complete` from `doPost(e)`;
2. stamp new Receipt Printer 1 jobs with the PrintHub route fields;
3. preserve route ancestry on deliberate reprints.

Do not expose the endpoint key in source.

## Endpoint setup

Run:

```
setupPrintHubEndpoint_()
```

This audits the sheet, creates the endpoint credential if needed, and leaves polling disabled.

The returned endpoint key is private. Copy it only into the managed Chrome extension policy. Do not commit it.

Run:

```
auditPrintHubEndpoint_()
```

Expected before activation:

- legacy queued rows may exist with blank Endpoint ID;
- routed queue counts should be zero unless a new test job was deliberately created;
- endpoint enabled should be false.

## Managed Chrome extension

Production polling requires PrintHub ChromeOS bridge v0.5.0 or later.

The managed `sourceConfigJson` structure is:

```json
{
  "endpointUrl": "<APPS_SCRIPT_WORKER_EXEC_URL>",
  "endpointId": "PH-FRONT-RECEIPT-01",
  "endpointKey": "<GENERATED_ENDPOINT_KEY>",
  "pollAfterMs": 2500,
  "bindings": {
    "RECEIPT1": {
      "name": "Receipt Printer 1",
      "uri": "socket://10.158.82.22:9100"
    }
  }
}
```

The public PrintHub page never receives the endpoint credential.

The extension must be repacked with the same existing private signing key so its ID remains:

```
dfdadlbllhjoadgkdlpgghfdklbhlpem
```

Do not advance the hosted update XML until the matching v0.5.0 CRX has actually been rebuilt and uploaded.

## Deployment gates

Keep the endpoint disabled until all of these are true:

1. live Apps Script source is installed;
2. both relevant Apps Script deployments are updated;
3. `setupPrintHubEndpoint_()` succeeds;
4. bridge v0.5.0 is installed on the PassGen Chromebook;
5. managed `sourceConfigJson` is present;
6. PrintHub reports the managed source authenticated but disabled.

Then run:

```
enablePrintHubEndpoint_()
```

Reload PrintHub. It should report `POLLING`.

## First production test

Only after polling is healthy:

1. sign into PassKiosk;
2. choose Receipt Printer 1;
3. create one legitimate PASS;
4. verify one new transaction;
5. verify one new Print_Jobs row with Endpoint ID `PH-FRONT-RECEIPT-01`;
6. verify state progression:
   `QUEUED -> CLAIMED -> PRINT_INVOKED -> PRINTED`;
7. verify the physical 80 mm pass is upright, complete, and cut;
8. verify the transaction reaches `PRINTED`.

Chrome's `chrome.printing.onJobStatusChanged` event is the source of the final `PRINTED` / `FAILED` result for extension-created jobs.

Do not activate Receipt Printer 2 until this first route succeeds.
