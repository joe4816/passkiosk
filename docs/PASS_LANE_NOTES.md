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
