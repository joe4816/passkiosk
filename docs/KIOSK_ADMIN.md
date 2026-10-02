# PassGen ChromeOS kiosk configuration

This document records the intended policy state for the dedicated PassKiosk Chromebook OU. It intentionally contains no device serial number, staff email address, Wi-Fi password, or other secret.

## Organizational unit

PassKiosk device OU:

`0374-Becker-MS > Kiosks > PassGen`

## Power

### AC kiosk power

- Action on idle: **Do nothing**
- Screen dim timeout: **0 / never**
- Screen off timeout: **0 / never**
- Action on lid close: **Do nothing**

### Battery kiosk power

The battery profile is intentionally conservative so an accidentally unplugged kiosk preserves power.

- Action on idle: **Sleep**
- Idle timeout: **15 minutes**
- Screen dim timeout: **5 minutes**
- Screen off timeout: **10 minutes**

## Updates and restarts

- ChromeOS automatic updates: **Allowed**
- Target version: **Latest available**
- Release channel: **Stable**
- OS rollback: **Do not roll back**
- Auto reboot after updates: **Allowed**
- Update blackout: **Monday-Friday, 06:30-14:30 local time**
- Peer-to-peer update downloads: **Disabled**
- Reboot-after-uptime limit: **Unset for PassGen**
- Scheduled reboot: **Weekly, Sunday 03:00 local time**

## Shutdown

- User shutdown: **Physical power button only**

## Kiosk monitoring

- Report kiosk session status: **Enabled**
- Report running kiosk app: **Enabled**
- Device system log upload: **Enabled**
- Kiosk troubleshooting tools: **Disabled in production**
- Kiosk application-level log collection: **Disabled for now**
- Offline alert delivery: **Email enabled**
- Alert recipient is configured in Google Admin and is intentionally not documented here.

## Network

Managed device-level Wi-Fi profile:

- SSID: `0374-WIFI`
- Auto-connect: **Enabled**
- Hidden network: **No**
- Security family: **WPA/WPA2/WPA3 Personal**
- IP configuration: **DHCP / not user-configurable**
- Proxy: **Direct Internet connection**
- DNS: **Automatic**
- User modification: **Disabled**
- Captive portal detection: **Off**

The Wi-Fi pre-shared key is managed in Google Admin and must never be committed to this repository.

## Auto-launch

Not enabled yet.

Once the GitHub Pages site and secure Apps Script kiosk bridge are operational:

1. Add `https://joe4816.github.io/passkiosk/` as the PassGen kiosk web app.
2. Verify the actual app origin is not redirected.
3. Configure the PassKiosk **Managed configuration** values described in [MANAGED_CONFIG.md](MANAGED_CONFIG.md).
4. Add the final Apps Script bridge origin under **Additional URL origins for this kiosk app**.
5. Select PassKiosk as the **Auto-launch app**.
6. Perform a cold reboot test.
7. Verify camera scanning in the actual kiosk session.
8. Verify the kiosk reconnects to managed Wi-Fi without a user login.
9. Verify Sunday scheduled reboot returns to PassKiosk automatically.

## Printing

Do not assume network reachability solely because all devices use `10.158.*.*` addresses. Test connectivity from the final print brain to each printer before production.

Current printer endpoints are intentionally kept out of this public policy document.
