# PDF batches, duplicate printing and detention filing

Release 0.3.22. Existing Friday detention restrictions, Help out identity and operator audit remain in effect.

## Forms

- `DL PDF ½ Sheet` and `DL PDF ¼ Sheet` are virtual printer destinations on every form.
- `+` records the original submission once without printing or emailing it, then adds the saved transaction IDs (including linked pickup requests) to a shared PDF batch.
- `▶️` retrieves those saved records and downloads US Letter pages with two half-sheet or four quarter-sheet notices. Each pass type starts on a fresh page. The batch remains available for repeated downloads until items are removed; removal never voids a transaction.
- Normal PDFs group Corridor, Request, After-School, Lunch and Bus, in that order. Every group sorts by student full last name then first name. Requests first sort by saved delivery period and numeric classroom room. The calling destination is not used.
- The batch is stored in browser local storage under the actual operator username, capped at 400 notices. Other operators cannot fetch those notices. New submissions are capped at 100 students per Add.
- Signatures are obtained through authenticated RPC, rasterized locally and embedded in the PDF. Blank signatures remain blank; missing named files block download. No pass data or signatures are sent to an external rendering service.
- Overlong content raises an error instead of clipping. Quarter-sheet users can choose half-sheet for more room.
- Existing Activity Bus integration remains staged/disabled. Its future PDF controls use the same batching path.

## Print duplicate

Each detention tab saves its own enabled state, office pair and previous individual destination. Checking Print duplicate maps AP Copier/Receipt to AP pair, Back Office Copier/Receipt to Back pair; any other destination requires Select a Printer Set. Only those two configured pairs appear while checked. Unchecking restores the prior individual destination. A pair produces exactly one student receipt and one copier filing notice. Optional Request for Student goes only to that copier.

## Settings filing

Download Today’s Detentions for Filing gathers non-void lunch and after-school notices created on the current school-local date, regardless of assigned dates or issuing adult. Sort is Grade, full Last, full First across both types. AP Office Copier is the initial filing destination for every user; its saved dropdown is independent of form choices. Physical destinations append sorted reprint jobs with FILE copy role. PDF destinations use the same half/quarter Letter renderer, keeping the combined filing order. No new detention assignments are created.

## Persistence and retries

Helper!I keeps its six-position Default|Corridor|Request|Det|Lunch|Bus encoding, now accepting DL_PDF_HALF and DL_PDF_QUARTER. Script properties `PK_OUTPUT_PREF_<normalized username>` hold detention duplicate choices, the filing destination and an explicit Bus override flag. This leaves other Helper columns alone.

Bus initially uses CAFE_TARDY when configured. Existing Bus choices different from the saved Default are preserved. Older Bus choices equal to the Default are treated as inherited, since the old six-slot format cannot distinguish a deliberate matching override; a new manual Bus selection is marked explicit and retained.

`Output_Requests` is created on the first PDF Add or filing print. Its reservation ledger makes retries of the same request idempotent. Recording is reserved before any transaction or print writes. A timeout with an incomplete ledger never records automatically again; the user must check Transactions. Successful results are replayed without new writes. PDF download retries only fetch saved records.

## Deployment

- Replace the live Code.gs embedded WorkflowOptions and UserPreferences sections with current source, preserving the private core and existing worker configuration.
- Add BatchOutputs.gs to the Apps Script project (or append it once to PdfEmail.gs). Update SecureRpc.gs and generated StaffBridge.html together in the staff deployment.
- Do not publish the full live Code.gs in the public repository.
- Run all Node tests and visual PDF checks. Verify the deployed build and new settings/controls without creating real student assignments or sending print jobs.
