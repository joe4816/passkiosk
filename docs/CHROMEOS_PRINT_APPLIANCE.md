# PassKiosk ChromeOS Print Appliance

## Current architecture decision

Use the existing **ChromeOS kiosk-mode** setup for the dedicated PassGen Chromebook.

The PassGen Chromebook is intended to be an untouched print appliance:
- ChromeOS managed device in the `PassGen` OU.
- Auto-launch the PassKiosk print-appliance web app in kiosk mode.
- No normal user sign-in is required on the appliance.
- Managed printers are assigned at the device / OU level.
- A companion managed Chrome extension may use the ChromeOS-only `chrome.printing` API to enumerate/select installed printers and submit jobs without relying on the default printer.
- The appliance page/helper will consume PassKiosk print jobs and print them unattended.
- Do not move the print worker to the AutomationHub PC unless explicitly re-decided.

## Why this differs from Badgie

Badgie used a more locked-down session because students could physically interact with that device. PassGen will sit out of harm's way, so the existing kiosk-mode deployment is acceptable and preferred for the first implementation.

## Authentication

The kiosk has no ordinary signed-in CCSD user. It uses the private `PASSKIOSK_KIOSK_KEY` through managed web-app configuration. The public Apps Script worker/bridge deployment is only the transport; kiosk RPC still validates the kiosk key.
