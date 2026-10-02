# GitHub Pages activation

The PassKiosk Pages deployment workflow is ready but intentionally manual until GitHub Pages is enabled for the repository.

## One-time repository setting

In GitHub:

1. Open `joe4816/passkiosk`.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Save if GitHub presents a Save control.

Do not choose a branch publishing source; this repository already contains a dedicated Pages workflow.

## First deployment

After Pages is enabled, run the **Publish PassKiosk Pages** workflow manually from the Actions tab.

The workflow publishes only the browser runtime:

- `index.html`
- `styles.css`
- `config.js`
- `bridge.js`
- `sw.js`
- `manifest.webmanifest`
- `assets/`
- `js/`
- `vendor/`

It does not publish the `apps-script/` migration documentation as part of the Pages artifact.

## Expected URL

`https://joe4816.github.io/passkiosk/`

Do not add this URL to the ChromeOS kiosk policy until the first deployment succeeds and the URL is opened once in a normal browser to confirm that it does not redirect to another origin.
