# Upstream UI provenance

This frontend directly ports components from [getumbrel/umbrel-bitcoin/apps/ui](https://github.com/getumbrel/umbrel-bitcoin/tree/2fe07948f99e101dbee95ce34e5947a69c441ee4/apps/ui), commit `2fe07948f99e101dbee95ce34e5947a69c441ee4`.

## Source mapping

- `src/components/Layout/`: upstream Layout, Header, Dock, and Background; Bassin branding/palette, CKPool connections, and hash routing replace node-specific integrations.
- `src/components/ui/`, `src/components/shared/`: upstream controls, cards, dialogs, borders, scrolling and fallback components.
- `src/pages/home/`: upstream HomePage geometry, PeersChart, StatusDot, plus a mining adaptation of the Blocks canvas. The upstream geographic Globe retains its hex-map appearance and drag controls, with a single blue Bitcoin-node location marker replacing peer connections. `Blocks/` retains upstream geometry constants, pointer movement and liquid shader (tinted aqua).
- `src/pages/insights/InsightsCard.tsx`, `ChartDefaults.tsx`: upstream cards and chart defaults; CKPool metrics/worker data replace node data.
- `src/pages/settings/InputField.tsx`, `Toggle.tsx`: upstream controls. Settings and ConnectionDetails adapt upstream layouts to CKPool options, logs, Stratum, and local config import/export.
- `src/index.css`, `tailwind.config.ts`, `src/lib/`, `src/main.tsx`: upstream styles, fonts, utilities, and bootstrap, with Bassin color changes.
- `src/assets/` (except Bassin’s existing `logo.svg`), geographic dataset, and Roboto font: copied upstream assets. DM Sans and Outfit are bundled through their upstream npm font packages.

The copied/adapted upstream code and assets remain subject to **PolyForm Noncommercial 1.0.0** and the upstream notices in [licenses/umbrel-bitcoin.md](licenses/umbrel-bitcoin.md). Copies ship in `web/umbrel-bitcoin-license.md` and this notice in `web/THIRD_PARTY_NOTICES.md`. Bassin’s original [GPL license](LICENSE) remains applicable to its original code; it does not replace the upstream license.

[Pogolo Umbrel WebUI](https://git.0xf0xx0.eth.limo/0xf0xx0/pogolo-umbrel-webui), inspected at `4caffa86345395041e39e38636cc1e9c2d6ab082`, informed the mining adaptation. No Pogolo code or assets were copied.

Bassin retains its CKPool backend, static status-file API, logo, and mining identity. Umbrel’s Bitcoin Core RPC backend and administrative API are not included.

DM Sans and Outfit are distributed under the SIL Open Font License; their original notices ship in `web/licenses/dm-sans-OFL.txt` and `web/licenses/outfit-OFL.txt`.
