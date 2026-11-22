# Bassin UI

A CKPool mining adaptation of the actual [Umbrel Bitcoin UI](https://github.com/getumbrel/umbrel-bitcoin/tree/master/apps/ui). It uses upstream components, Tailwind styles, DM Sans/Outfit fonts, floating dock, geographic globe, charts, settings controls, and dialogs, recolored with Bassin’s water palette. See [upstream provenance and licenses](THIRD_PARTY_NOTICES.md).

## Develop and verify

Use Node.js 22.18+ and npm. The displayed Bassin release is defined by `BASSIN_VERSION` in `src/helpers/constants.ts`.

```sh
npm ci
npm run dev
npm run typecheck
npm test
python3 -m unittest discover -s tests
npm run build
npm run preview
```

Development mode serves sample pool/user files with current timestamps and sample logs, and labels the page as a preview. Production builds do not include sample data. Hashrate history starts with the first actual CKPool timestamp observed during the current visit; it does not manufacture historical points.

## Screens

- **Home:** upstream globe panel and ring chart adapted to pool hashrate and accepted/rejected share difficulty. Five animated water columns compare CKPool’s 1-minute, 5-minute, 1-hour, 24-hour and 7-day averages on a shared, zero-based scale. The geographic globe supports dragging and shows one pulsing blue marker for the public address reported by your Bitcoin node.
- **Insights:** worker count, round best share, best share ever, share rate, uptime, sampled hashrate history, share totals, Stratum V2 client/channel counters (when active), and a searchable/sortable worker table.
- **Settings:** upstream settings layout with **Mining**, **Stratum V2**, **Bitcoin Node**, **Advanced**, and **Logs** tabs.
  - **Live auto-save & automatic reload:** When served by `bassin-server.py` (the default Docker entrypoint), Settings automatically loads the running `/config/ckpool.conf` via `GET /api/config`. Valid edits (including toggling Stratum V2 on/off) auto-save via `PUT /api/config` (with `X-Bassin-Config: 1` CSRF protection, server-side validation, and atomic `0600` writes), and the CKPool startup supervisor (`deploy/ckpool-start.sh`) detects the config change and reloads CKPool automatically.
  - **Credential protection:** Stored Bitcoin RPC passwords are redacted by `GET /api/config` and automatically preserved on save unless explicitly replaced. Private Stratum V2 Noise keys live in `/sv2` (mounted only in CKPool, never in the web UI container).
  - **Backup / Static fallback:** Import and Download buttons remain available for config backups; when running as a static preview without `/api/config`, Settings falls back to local import/edit/export mode.
- **Stratum V2 & Bitcoin node compatibility:** Solo Stratum V2 mining works over standard JSON-RPC and ZMQ with both **Bitcoin Core and Bitcoin Knots**. Optional Cap'n Proto Mining IPC (`ipcmining`) and Job Declaration (`sv2jdurl`) are also configurable for Bitcoin Core v32.x nodes with `-ipcbind`.
- **Logs:** refresh every five seconds, pause/resume, follow output, filter/search, and download visible lines. Reads at most 64 KiB and displays the latest 400 lines using suffix HTTP Range requests.
- **Connect:** upstream tabbed dialog and QR codes for Stratum V1 (`3456`), Noise-encrypted Stratum V2 (`3457`, automatically including the pool’s Base58Check authority public key from `/pool/sv2.json`), optional Job Declaration (`3458`), and Worker Setup.

## Container deployment (`bassin-server.py`)

The Docker image runs as non-root `1000:1000` with `ENTRYPOINT ["python3", "-O", "-B", "/opt/bassin/bassin-server.py"]` on port `8080` (with 256 KiB thread stacks and 15-second keep-alive timeouts for minimal RAM usage). It serves the code-split UI from `/ui`, pool stats/logs from `/www`, the live config API for `/config/ckpool.conf`, built-in umbrelOS dashboard widgets directly from disk (no separate `widget-server` container needed), and runs the background publisher for `/pool/location.json` and `/pool/sv2.json`.

| Path | Content |
| --- | --- |
| `/api/config` | Live `ckpool.conf` read (RPC passwords redacted) and `PUT` save (`X-Bassin-Config: 1`) |
| `/widgets/pool` | umbrelOS `four-stats` widget (5m hashrate, workers, round best share, total shares; stale-aware) |
| `/widgets/workers` | umbrelOS `list` widget ranking workers by all-time best share difficulty (`bestever`) |
| `/widgets/hashrate` | umbrelOS `four-stats` widget comparing `1m`, `5m`, `1h`, and `24h` pool hashrate averages |
| `/health` | Container health endpoint (`{"status":"ok"}`) |
| `/pool/pool.status` | CKPool newline-delimited JSON |
| `/pool/version.json` | Detected CKPool software version, published at pool startup |
| `/pool/location.json` | Optional public Bitcoin node location metadata |
| `/pool/sv2.json` | Public Stratum V2 status and Base58Check authority public key (never private keys) |
| `/users/` | Directory index with relative user-file links |
| `/users/<address>` | CKPool user/worker JSON |
| `/ckpool.log` | CKPool text log, with suffix/span HTTP byte-range support |

Protect the UI behind Umbrel's `app_proxy` authentication (or a reverse proxy with authentication in custom deployments) so `/api/config` is only reachable by authenticated users.

## Browser & unit checks

```sh
npm run typecheck
npm test
python3 -m unittest discover -s tests
```

Browser suites (`tests/browser.mjs`, `tests/live-config-browser.mjs`, `tests/hashrate-browser.mjs`, `tests/notifications-browser.mjs`, `tests/utc-chart-browser.mjs`, `tests/globe-browser.mjs`, `tests/mobile-browser.mjs`) accept `PLAYWRIGHT_MODULE` and optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
