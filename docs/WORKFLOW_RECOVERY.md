# Submission recovery

PASS, RQST, DET, and LUNCH_DET now retain ownership of the lane instance that submitted them. A late response can report its outcome but cannot reset a newly opened lane, including leaving and returning to the same lane.

Basket additions/removals are blocked while a submission is in progress. Repeated Send taps do not create another request. Camera frames do not consume the next student's QR while a submission is pending.

The client validates the returned processing counts against the created/error arrays before treating the response as confirmed. A transport failure or malformed response retains the current basket and warns that recording is not confirmed. Verify Transactions before retrying; the client does not automatically replay a possibly recorded submission.

Known partial processing outcomes continue to report the created/error counts. The original form resets after a confirmed response, while any newly opened lane remains intact. Printing status is not inferred from transaction creation.

Synthetic regression tests: `node tests/workflow-reliability.test.cjs`. No backend deployment, sheet migration, printer test, or feature activation is implied by these client checks.
