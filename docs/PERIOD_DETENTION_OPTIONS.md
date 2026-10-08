# Period routing and detention outputs

Implemented October 8, 2026. App build 0.3.17-period-detentions; Apps Script version 18.

Corridor TO and Request for Student delivery FROM share the same default: the current class until five minutes before its bell, then the next instructional period. Passing/lunch use the upcoming period; before school uses P1; the final period's five-minute handover and after school use P1 on the next active school day. School-calendar and student lunch assignment still drive routing. Missing class data does not silently select a different period.

The selected period, room and teacher appear on screen and paper. Other period buttons show P1–P6 only; selecting one immediately replaces the displayed class and remains selected while the form is completed. The corridor destination remains manually editable. Bulk routing resolves each student's schedule separately.

Both detention forms expose independent optional pickup requests, plus mutually exclusive Back Office/AP Office paired-printer checkboxes. Either office override produces one receipt detention copy and one copier filing copy; an accompanying request goes only to that office's copier. With neither office override, the existing chosen output is used. No printer registrations, bridge or CUPS settings change.

The pickup request uses P6, the session owner's identity, reason “Pick up detention notice.” and a calculated At time ten minutes before the configured P6 final bell. Only Send student to is revealed for editing, defaulting to the session owner's location. Each bulk student has their own request. Missing P6/final bell fails that student's coordinated bundle before adding transactions/jobs. Pickup creation requires an active school day.

Detention and pickup transactions use separate IDs, linked in Notes. Paired copies reference the same detention transaction, so capacity counts increase once, not once per copy. Existing print row builders preserve route/media/rendering mappings. Email submissions include linked request PDFs and may additionally queue physical copies when explicitly selecting an office override.

## Backend integration

The deployed Code.gs is maintained in the private Apps Script project. The functions in `apps-script/WorkflowOptions.gs` are appended there (do not install a second duplicate file).

- `resolveRouting_` delegates to `resolvePeriodRouting_`.
- `buildPassTx_` delegates to `buildPeriodPassTx_`.
- `submitWorkflow_` deduplicates IDs and calls `prepareWorkflowBundle_` for each student before staging rows. It adds bundle.transactions and bundle.jobs, counts detention once, and returns pickupTransactionId on each created student result.
- `PdfEmail.gs` uses the same bundle preparation, includes linked requests in PDF retrieval, and reports whether explicitly requested office copies were queued.
- `testWorkflowOptions` performs a read-only configuration check; it creates no transactions/jobs and sends no messages.

Tests: period boundaries; next-day P1; manual corridor periods; pickup time/location; missing route/P6 failure; office exclusivity; 24 combinations of workflow, pair, pickup and email; existing selection feedback and workflow/bus/camera/routing regressions.

The separately approved printer-selection screen redesign and Google Chat remain deferred, not implemented by this change.
