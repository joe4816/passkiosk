# Staff sign-in 0.3.19 — backend deployed, front door verification pending

The 0.3.18 separate-tab flow is defective in real use. The top-level Bridge page
is intentionally blank and has no completion callback. Returning to GitHub
retries a hidden authenticated iframe that can still fail after Google sign-in.
No account denial is established by that timeout.

## Replacement

The GitHub front door keeps a visible Continue with Google link, now in the same
tab. Its existing bridge=1 deployment URL serves StaffBridge.html. Within the
Google wrapper, the staff app starts directly, uses google.script.run.staffRpc,
checks getAuthenticatedProfile, and proceeds to printer selection. There is no
popup, return-to-GitHub callback, manual already-signed-in button, or second
identity picker. The same app is served by Apps Script after authentication.

Every staff call still goes through requireActiveCcsdAdult_. No kiosk secret,
client-selected username, or client assertion replaces Google authentication.
The embedded kiosk bridge keeps its original message channel and kioskRpc path.
Staff startup is suppressed when the Google wrapper itself is embedded.

## Deployment order

1. Add generated apps-script/StaffBridge.html as HTML file StaffBridge in the
   existing Apps Script project. Update SecureRpc.gs from this branch.
2. Rebuild StaffBridge whenever the app changes with
   `python scripts/build-staff-app.py` from the repository root.
3. Update the existing web app deployment to a new version, keeping its URL,
   execution identity, allowed audience, and permissions unchanged.
4. Verify the top-level bridge URL loads the app and an allowed signed-in staff
   account reaches printer selection. A disallowed account must see an access
   error. Verify the embedded managed kiosk still responds.
5. Only then merge/publish the same-tab GitHub front door.

Automated tests cover both startup contexts, the same-tab link, direct staffRpc
success/error propagation, access denial, no identity fallback, and generated
script syntax. Physical printing is not part of the auth test.

Backend deployment restored on 2026-10-08. StaffBridge and the page factory
were deployed as app backend version 20; the unattended worker remains on its
existing deployment. Context detection uses the full ancestor-origin chain
because Google currently adds two wrapper frames.
