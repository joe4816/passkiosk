# PassKiosk ChromeOS Print Appliance

## Architecture decision

Mirror the final working Badgie Chromebook deployment pattern rather than inventing a Windows print worker.

The dedicated PassGen Chromebook is intended to be an untouched appliance:
- ChromeOS managed device in the `PassGen` OU.
- Use a **Managed Guest Session (MGS)** that auto-launches, matching the final Badgie deployment pattern.
- No normal user sign-in is required on the appliance.
- Managed printers are assigned at the device / OU level.
- Silent printing and exact/default printer policy should be configured through Chrome Admin, following the Badgie pattern.
- The appliance page/helper will consume PassKiosk print jobs and print them unattended.
- The separate Apps Script worker endpoint and private worker/kiosk credentials remain backend plumbing; do not move the print worker to the AutomationHub PC unless explicitly re-decided.

## Badgie reference pattern

The final Badgie configuration used:
- Managed Guest Session enabled and auto-launched.
- Badgie web app launched inside the session.
- Badgie Helper extension force-installed and exempted from MGS cleanup.
- Silent printing enabled.
- Exact default printer policy for the managed Kyocera.

PassKiosk should reproduce this architecture with the `PassGen` OU and PassKiosk-specific app/helper configuration.
