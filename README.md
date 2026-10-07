# Bassin UI

A CKPool mining adaptation of the actual [Umbrel Bitcoin UI](https://github.com/getumbrel/umbrel-bitcoin/tree/master/apps/ui). It uses upstream components, Tailwind styles, DM Sans/Outfit fonts, floating dock, geographic globe, charts, settings controls, and dialogs, recolored with Bassin’s water palette. See [upstream provenance and licenses](THIRD_PARTY_NOTICES.md).

## Develop and verify

Use Node.js 22.18+ and npm. The displayed Bassin release is defined by `BASSIN_VERSION` in `src/helpers/constants.ts`.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Development mode serves sample pool/user files with current timestamps and sample logs, and labels the page as a preview. Production builds do not include sample data. Hashrate history starts with the first actual CKPool timestamp observed during the current visit; it does not manufacture historical points.

## Screens

- **Home:** upstream globe panel and ring chart adapted to pool hashrate and accepted/rejected share difficulty. The five upstream-style 3D tiles show CKPool’s 1-minute, 5-minute, 1-hour, 24-hour and 7-day averages. The original geographic globe supports dragging and shows one pulsing blue marker for the public address reported by your Bitcoin node. Without usable node location data it shows no marker. Reduced-motion preferences disable rotation and pulsing; a static image is used without WebGL.
- **Insights:** worker count, round best share, best share ever, share rate, uptime, sampled hashrate history, share totals, and a searchable/sortable worker table.
- **Settings:** upstream settings layout with Mining, Bitcoin Node, Advanced, and Logs tabs. Import/edit/export `ckpool.conf`, preserving unknown fields and additional nodes. Validation checks known fields; CKPool remains authoritative for custom options.
- **Logs:** refresh every five seconds, pause/resume, follow output, filter/search, and download visible lines. Reads at most 64 KiB and displays the latest 400 lines. Large files require suffix HTTP Range support. Logs are plain text.
- **Connect:** upstream tabbed dialog and QR code adapted to Stratum and Bitcoin-address/worker credentials.

## Current static deployment

The existing Docker image still copies `web/` into `/www/`. The dashboard works with the existing static file server. The optional node-location publisher uses Python 3, included in the updated image. Keep the existing CKPool volumes and static file server. Production endpoints are:

| Path | Content |
| --- | --- |
| `/pool/pool.status` | CKPool newline-delimited JSON |
| `/users/` | Directory index with relative user-file links |
| `/users/<address>` | CKPool user/worker JSON |
| `/pool/version.json` | Detected CKPool software version, published at pool startup |
| `/pool/location.json` | Optional public Bitcoin node location metadata |
| `/ckpool.log` | CKPool text log, with byte-range support for large files |

CKPool's standard `logdir: /www` produces these files. The UI uses fragment navigation, so the file server does not need an SPA fallback. The default public Stratum port remains `3456`, mapped to CKPool's internal `3333`. Custom deployments should use their actual reachable Stratum host/port in miners.

### Applying settings

This release is a **local configuration editor with import/export**, not a live CKPool administration API. It never claims to load or save the running config. Import your existing `data/config/ckpool.conf` first, edit it, download `ckpool.conf`, replace the file in the config volume, and restart Bassin/CKPool through your normal deployment controls. Keep RPC credentials out of the public `/www` directory. Credentials are held only in browser memory and in the explicitly downloaded file, not local storage or network requests. Navigation between screens retains pending edits; reloading the app clears them. Importing over pending edits asks before replacing them.

The default template is not exportable until the required Bitcoin RPC connection is supplied. The app never changes the running pool or restarts miners automatically.

## Browser checks

`tests/browser.mjs` checks the development preview’s layout against upstream geometry and exercises CKPool workflows, unavailable/stale states, config round trips, and mobile overflow. Supply Playwright separately from production dependencies:

```sh
# With npm run dev running:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser.mjs
```

Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` selects an installed Chromium. `BASSIN_TEST_URL` overrides `http://127.0.0.1:4174`. Screenshots go to `/tmp/bassin-ui-fork-review/`. Fixtures do not modify a real pool. `tests/upstream-reference.mjs` captures the original UI for comparison; it expects an upstream checkout at `/tmp/bassin-umbrel-reference` running on port 4180.

Round Best Share uses the pool’s saved `bestshare`: it survives restarts and resets when the pool finds a block or receives an explicit share reset. It is not a session record. Best Share Ever is the maximum `bestever` found in retained user and worker records, not a browser-local record or a fabricated pool status field. Removed records can remove historical highs. Settings includes the Bassin GitHub link.

## Bitcoin node location

The browser reads only `/pool/location.json`; it never detects the visitor’s IP or requests browser geolocation. `scripts/pool-location.py` reads the private `ckpool.conf` and asks configured Bitcoin nodes for [getnetworkinfo.localaddresses](https://bitcoincore.org/en/doc/29.0.0/rpc/network/getnetworkinfo/), falling back to [getpeerinfo.addrlocal](https://bitcoincore.org/en/doc/29.0.0/rpc/network/getpeerinfo/). Remote peer addresses are never used. Private, loopback, and Tor addresses produce no marker.

Only that explicit public node IP is sent to [ipwho.is](https://ipwhois.io/documentation) for approximate coordinates, cached for six hours. RPC credentials stay in the private config mount. The published file contains only source, public IP, coordinates and timestamp. If your Bitcoin node runs elsewhere, the marker represents that node’s location. Missing/invalid results clear the marker; the UI rejects metadata older than 48 hours.

For an existing Compose deployment, `deploy/node-location.compose.yml` is an optional override that builds this UI, copies its static files, and runs the publisher. Set `BASSIN_UI_SOURCE` to this checkout’s absolute path and use the override alongside the existing Bassin Compose file and its usual environment (`APP_DATA_DIR`, etc.). Build `web/` first with `npm run build`. This override is supplied for deployment; it is not automatically enabled by the frontend update. Alternatively, run the helper with private `--config` and public `--output` paths on a server with Python 3. Do not expose the config directory through the web server.

Publisher checks: `python3 -m unittest discover -s tests -p 'test_*.py'`. Globe browser checks: `node tests/globe-browser.mjs` with the same Playwright environment as above. Tests use mocked node metadata and do not query a live node or detect anyone’s IP.

## UTC display and pool version

Insights shows a live UTC clock. Chart ticks, hover timestamps, worker last-share timestamps, pool updates, and log refresh times use UTC independent of browser locale/timezone. Raw CKPool log lines remain unchanged; CKPool already writes UTC in the Bassin deployment. The chart tooltip has explicit light text and a dark background under either browser color preference.

The header reads `/pool/version.json` once a minute. `deploy/ckpool-start.sh` extracts the compiled `ckpool/VERSION` identifier from the pool binary, atomically publishes only that version, and then executes CKPool with the original arguments. This is derived from the installed program, not a manually maintained UI constant, image tag, or guessed default. If detection is unavailable the header shows `CKPool —`. The supplied Compose override mounts this startup script into the pool container; the community-store deployment bundles the same script. Metadata publication failure does not prevent the pool from starting.

`tests/utc-chart-browser.mjs` verifies UTC midnight rollover, chart hover contrast under light/dark preferences and different browser timezones, and version changes without a frontend rebuild. Use the same Playwright environment as the other browser checks.
