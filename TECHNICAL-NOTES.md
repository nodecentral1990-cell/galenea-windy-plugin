# windy-plugin-passage-plan (technical notes)

Windy.com plugin, built from `windycom/windy-plugin-template` v5.0.1 (commit 94b4033,
2026-07-15) and the types in `@windycom/plugin-devtools` 3.0.5. Svelte 4 + TypeScript,
bundled by Rollup. Windy modules (`@windy/*`) become Windy's page globals at build time.

## Commands
| Command | What it does |
|---|---|
| `npm install` | Install tools |
| `npm test` | Unit tests (maths, file formats, weather, IMO checks). `REAL_RTZ=/path/file.rtz npm test` also checks a real route kept outside the repo |
| `npm run check` | Type check of our code (Windy's own type files are skipped: they clash with the DOM types) |
| `npm run build` | Build `dist/plugin.js`, `dist/plugin.min.js`, `dist/plugin.json` |
| `npm run test:screens` | Build the stand-in test page (`harness/`) and drive it in headless Chromium; screenshots in `harness/shots/` |
| `npm start` | Windy developer mode: serves `https://localhost:9999/plugin.js` (needs a local computer) |

Publishing: `.github/workflows/publish-windy-plugin.yml` at the repo root (manual run,
needs secret `WINDY_API_KEY`). See `../INSTALL.md`.

## Layout
- `src/lib/` pure logic, no Windy imports (unit tested):
  `geo.ts` (WGS84 GC via geographiclib, ellipsoidal RL), `model.ts` (route, vessel, ETA,
  required speed, slip, positions), `format.ts` (positions/times), `formats/` (RTZ, RT3,
  GPX, CSV/text, xlsx), `circ1228.ts` (IMO checks), `weather.ts` (series sampling,
  limits, table rows).
- `src/windy/` Windy-facing code: `forecast.ts` (point forecasts, map-layer sweep),
  `mapLayer.ts` (drawing on the map).
- `src/ui/` Svelte tabs. `src/state.ts` stores + localStorage.
- `harness/` stand-in for Windy: real plugin + stubbed `@windy/*` + Leaflet 1.9 + FAKE weather.

## Verified vs not verified (2026-10-11)
**Verified here**
- 24 unit tests pass, including the owner's real Furuno RTZ (37 WPs, 3,704.8 nm, round
  trip keeps all Furuno extensions).
- Stand-in page: 25 screen checks pass (open file, ETD/ETA, labels, drag with live
  readout, insert/delete on map, zoomed-in label, ship symbols, ship tab, limits,
  weather table with fake data, row click → slider, sweep restores layer, polar, all six
  exports). Exported .xlsx opens in openpyxl.
- Production build succeeds; Windy imports are mapped to `W.*` globals.

**Not verified (needs a real Windy session)**
- Anything inside windy.com: Leaflet GL behaviour (drag, clicks on legs: Windy notes a
  click issue over plugin shapes), panel styling, `getPointForecastData` responses and
  units, `calendar.end`, the map-layer sweep (raw value layout for currents assumed u/v
  m/s), Premium 1 h steps.
- RT3: layout from one open-source exporter; `LegType` 0 = RL assumed; export untested.
- RTZ export accepted by Furuno/Transas ECDIS: untested on equipment.
- Wave direction convention assumed "coming from" (as wind).
