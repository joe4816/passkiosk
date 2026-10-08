# Staff Google sign-in

App build 0.3.18-visible-signin shows a visible Continue with Google link before staff backend calls. It opens the existing staff Apps Script deployment (`bridge=1`) in a separate top-level tab so Google can display its account/sign-in screens.

The staff member returns to the app after Google sign-in. Returning focus checks access automatically; an explicit continue button is also available. The bridge is recreated for each reconnect attempt, so a previous timeout is recoverable.

The backend's existing getAuthenticatedProfile/staffRpc boundary derives identity from the authenticated CCSD Google account and requires an active adult record. Allowed staff proceed directly to output selection. No username input or second staff identity selection appears. Failed access checks remain on the sign-in screen and do not fall back to manual identity.

Google may finish on a blank bridge page; the app explains that the staff member should return to its tab. Opening the Google tab does not itself prove sign-in or authorize access. Only the subsequent authenticated backend response completes sign-in.

Managed unattended kiosk mode remains a separate existing keyed workflow, because it has no signed-in staff Google account. Printer routing, hub, bridge extension and backend deployments are unchanged.

This fixes visible sign-in and reconnect recovery. Browser restrictions on authenticated cross-site frames or network blocking can still prevent the subsequent connection; the app explains this possibility rather than presenting the timeout as an access denial.
