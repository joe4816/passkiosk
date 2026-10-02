# ChromeOS managed configuration

PassKiosk supports ChromeOS Web Managed Configuration so the dedicated kiosk can receive its backend settings without placing secrets in GitHub or in the public launch URL.

## Configuration keys

The GitHub client reads these keys from `navigator.managed.getManagedConfiguration(...)`:

```json
{
  "PassKioskBridgeUrl": "https://script.google.com/macros/s/DEPLOYMENT_ID/exec",
  "PassKioskKioskKey": "REPLACE_WITH_PRIVATE_RANDOM_KEY"
}
```

Never commit the real key to this repository.

## Google Admin

For the PassGen kiosk OU, after PassKiosk is added as a kiosk web app:

1. Open the PassKiosk app policy in **Devices > Chrome > Apps & extensions > Kiosks**.
2. Enter the JSON above under **Managed configuration** if that field is available for the deployed web app.
3. Set the real Apps Script bridge deployment URL and the private kiosk key.
4. Save.

The PassKiosk client tries managed configuration first. It falls back to one-time fragment provisioning only when managed configuration is unavailable.

## Additional URL origin

The kiosk application's primary origin is:

`https://joe4816.github.io`

The backend bridge runs on an Apps Script origin. Because the kiosk uses more than one origin, add the Apps Script bridge origin to **Additional URL origins for this kiosk app** in Google Admin after the final deployment URL is known.

Do not add a guessed origin. Use the exact final origin from the deployed bridge URL and verify that it does not redirect to a different origin.

## Camera

Camera access is requested only by the GitHub-hosted PassKiosk origin. ChromeOS kiosk web apps auto-grant requested web permissions to trusted configured kiosk origins, so normal browser permission prompts should not be part of the production kiosk flow.

Test this only after the final GitHub Pages URL is configured as the actual kiosk app.
