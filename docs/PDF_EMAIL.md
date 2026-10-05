# PDF email output

This is a temporary, printer-independent output option for PassKiosk. The browser
and backend source are implemented. **The bound Apps Script project must be
updated and redeployed before the option appears.** Repository publication does
not install Apps Script code or grant its mail/Docs permissions.

## Staff experience

After sign-in, choose **Email PDFs to my CCSD email** instead of a printer.
Settings can switch between email and a configured printer. The context strip
shows the verified email recipient. No printer is required for an email session.

Choose the normal workflow settings and Send. The backend records transactions
using the existing workflow builders, then creates a letter-size PDF from the
saved records. Each student's document starts on a new page; long content may
continue onto another page. Bulk output uses one attachment, followed by a
clearly labelled error report for any students not recorded. Up to 100 students
may be submitted per email. The limit is checked before recording.

PDFs include resolved destinations/delivery classes, selected When/time,
detention date and directions, adult attribution and available signature image,
and all Activity Bus assignments and duplicate audit details. Excused is shown
only if the transaction schema actually contains it; it is never inferred from
Reason. Missing signature images are visibly labelled.

Emails go to the **session operator**, not the selected Requested By / Issued By /
Approved By adult. Staff recipients come from the authenticated Google identity.
Managed kiosks use the actual session operator's active Helper Adults entry,
whose configured CCSD email must match that username. The script owner's email
is never a fallback. The client cannot supply the destination email.

Email output never writes to `Print_Jobs`. It does not mark a transaction PRINTED.
The legacy printer path remains separate. Activity Bus and Excused client flags
remain off until their respective deployment gates are passed.

## Install in the existing bound project

1. Open the PassKiosk workbook, then **Extensions → Apps Script**. Confirm it is
   the project containing the working secure bridge deployment. Compare current
   source before overwriting any file that has newer live changes.
2. Add `apps-script/PdfEmail.gs` as `PdfEmail.gs`.
3. Update the existing `SecureRpc.gs` from this repository. Keep the security
   checks and existing Code.gs implementations. **No Code.gs replacement is
   needed for email.** The new email writer reuses the existing builders while
   deliberately bypassing the printer queue.
4. Save. If the project has explicit `oauthScopes`, preserve them and add the
   necessary Docs/Drive and mail scopes:
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/script.send_mail`
   Existing spreadsheet and authentication scopes must remain. If scopes are
   inferred, Apps Script derives them from the new services. Authorize the
   additional services through Google's normal consent flow.
5. Run `setupPdfEmail_()`. It adds only the `Email_Deliveries` tab if absent and
   checks its headers. It does not rewrite Transactions, Print_Jobs or Helper.
6. Run `testPdfEmailRendering_()` as an active CCSD staff member. Expected log:
   `ok:true`, positive PDF byte count, daily quota remaining, `emailSent:false`.
   It uses synthetic data and trashes the temporary source document. It sends
   no email and records no student transaction.
7. Run `enablePdfEmail_()`, then update the **existing secure web-app deployment**
   to a new version, retaining its existing CCSD/kiosk authorization settings and
   URL. Do not make the app public or change the authenticated identity model.
8. Sign out of PassKiosk and reload. Existing pre-install sessions lack the new
   verified email binding. Sign in and choose email output. Verify your own CCSD
   address is shown.
9. Perform one legitimate non-printing submission. Check Transactions, your
   inbox/PDF and Email Delivery in Settings. Confirm no Print_Jobs row was added.
   Then test a small bulk submission and review successful documents and the
   error-report page. These tests do not require printers.

Activity Bus email reuses `BusIntegration.gs`. Install/test/redeploy that module
and pass its non-printing smoke tests before enabling `activityBusData`. Email
installation alone does not enable Activity Bus or Excused.

To disable the option, set script property `PASSKIOSK_PDF_EMAIL_ENABLED` to
`false`. Existing transactions and the delivery ledger remain intact. Switching
output modes does not resend or reprint earlier submissions.

## Delivery and recovery

`Email_Deliveries` stores delivery ID, timestamp, session username, device,
verified recipient, request fingerprint, status, original result and message.
An email submission reserves a durable ID **before recording any transaction**.
A replay of the same ID returns its existing outcome. It does not record again;
reusing an ID with different settings is rejected.

The status sequence is RECORDING → READY → PREPARING → SENDING → SENT.
SENT means MailApp accepted the submission, **not proof of inbox arrival**.

- FAILED: PDF conversion, quota, or another pre-send failure. Transactions remain
  saved. **Retry email only** reuses the original transaction IDs and records no
  additional authorizations. READY can also be safely claimed for delivery.
- SEND_UNCONFIRMED / SENDING: mail may have been submitted. Check the inbox. The
  app refuses automatic or button-triggered resend to avoid duplicate mail.
- RECORDING_UNCONFIRMED / RECORDING: a write may have happened. Check Transactions
  before making another authorization. The same request ID cannot record twice.
- PREPARING: PDF creation started. A timed-out execution may leave this status;
  an administrator must review it before resetting anything.
- NOT_CREATED: a normal single Activity Bus warning/no-bus result created no
  authorization and no email. Deliberate duplicate rescan behavior is preserved.

Settings shows the last hour's latest 20 deliveries for the authenticated
operator and device. Refresh status after a lost response. Do not resubmit a
basket merely to retry delivery. The client does not automatically replay writes.

Temporary Docs are never shared and are moved to Trash after PDF conversion,
including conversion failures. PDF attachments are capped at 20 MiB. Extremely
large documents or exhausted quotas may require administrator help; the
transaction and delivery states preserve that distinction.

## Verification

`tests/pdf-email.test.cjs` exercises recipient isolation, request replay,
workflow/bulk outcomes, error pages, all bus assignments, quota/conversion
failures, email-only retry, uncertain-send protection, letter geometry and
source cleanup. The existing camera/workflow tests remain required.

The automated tests mock Google services; an actual Apps Script rendering test
and an inbox check are still required after installation. No successful live
email delivery should be claimed from repository tests alone.

Primary API references:
- https://developers.google.com/apps-script/reference/document/paragraph
- https://developers.google.com/apps-script/reference/drive/file#getAs(String)
- https://developers.google.com/apps-script/reference/mail/mail-app
