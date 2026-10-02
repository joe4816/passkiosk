# Mobile / Any-Device Authentication Requirement

PassKiosk is intended to work from ordinary staff devices, including phones and tablets. Staff should not need to be sitting at a desktop computer.

## Current issue

The GitHub Pages client loads the CCSD-restricted Apps Script bridge in a hidden iframe. Desktop Chrome can often reuse the existing CCSD Google session, but iPhone/Safari may block or fail that embedded authentication flow because of cross-site / third-party session restrictions.

Current failure symptom:

- GitHub PassKiosk loads.
- The hidden Apps Script bridge does not complete authentication.
- The client eventually reports: `PassKiosk backend did not respond. Check the backend deployment and sign-in.`

## Required finished behavior

- Normal staff devices must have a clear CCSD sign-in path when the embedded bridge cannot establish an authenticated session.
- The fallback should open/complete Google authentication in a top-level browser context, then return the user to PassKiosk.
- Do not replace normal staff identity with a manually typed username.
- Do not weaken the Apps Script deployment to anonymous/public staff access.
- Keep the dedicated Chromebook/kiosk authentication path separate; do not change kiosk authentication to solve the mobile staff-device problem.

This is a functional requirement, not a cosmetic enhancement: PassKiosk must be usable from phones/tablets and other ordinary staff devices.
