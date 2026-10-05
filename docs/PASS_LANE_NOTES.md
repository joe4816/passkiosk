# Pass lane UX notes

## Explicit excused status

The Pass lane must treat **Excused** as an explicit status, not something inferred from the selected reason.

Requirements:

- Add an **Excused** checkbox to the Pass screen.
- Default the checkbox to unchecked.
- Store the excused state explicitly with the transaction snapshot so printing and later review do not have to infer it from the reason text.
- The physical pass should always print a checkbox followed by the word **Excused** so the status is unambiguous:
  - checked box when the pass is excused;
  - empty box when it is not excused.
- Keep the optional Reason / Excused For value separate from the excused checkbox; a reason may be present whether or not the pass is marked excused.

This requirement was captured from the live GitHub PassKiosk smoke test on 2026-10-02.


## Implementation status

The GitHub client now contains the explicit **Excused** control and sends a boolean `request.data.excused`, but the feature is intentionally gated off in `config.js` until the Apps Script backend persists an `Excused` field in the transaction snapshot.

Current gate:

```js
features: {
  explicitExcused: false
}
```

Enable it only after the backend and the Transactions sheet both support the field. This prevents the UI from claiming an Excused status was saved when an older backend would silently discard it.
