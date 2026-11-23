# Third-party data and libraries

The plugin's own code is MIT (see LICENSE). These parts come from others and keep their own licences:

| Part | Where in the code | Source | Licence |
|---|---|---|---|
| Sea-lane network (distances along shipping lanes) | `data/seanet/seanet.json` (fetched on first use; until 0.28.0 `src/lib/seaNetData.ts`), packed from `@ssroute/data-eurostat` 0.2.1 | Eurostat SeaRoute / MARNET network (built from the Oak Ridge National Laboratory Global Shipping Lane Network and AIS data) | **EUPL-1.2**: this data part (and changes made to it: merged on a 0.2° grid and packed) is distributed under the EUPL-1.2, not the MIT licence. https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 |
| Port list | `src/lib/seaNetData.ts` (`PORTS_RAW`), from the npm package `sea-ports` 0.0.9 | marchah / sea-ports | MIT, Copyright (c) 2016 marchah. Positions approximate. |
| Weather (shown, not included) | fetched at run time | Windy.com (ECMWF, ECMWF-WAM) | Windy's terms of use |
| Free forecast fill (fetched at run time, optional) | `src/windy/forecast.ts` | Open-Meteo, https://open-meteo.com | CC BY 4.0; data by ECMWF and NOAA NCEP |
| Seamarks overlay (fetched at run time, off by default) | `src/windy/chartLayer.ts` | OpenSeaMap, https://www.openseamap.org | Tiles CC BY-SA 2.0; data © OpenStreetMap contributors, ODbL |
| IMO sea areas (ECAs, MARPOL special areas) | `data/seaareas/imo.json`, built by the Nav-Plugins tool `build_areas.py` | Coordinates and limits from IMO texts: MARPOL Annex VI appendix VII (IMO errata March 2018), MEPC.361(79), MEPC.392(82), MEPC.407(84), MEPC.315(74), MEPC.117(52), MEPC.154(55), MEPC.118(52), MEPC.200(62), MEPC.201(62) | Facts taken from public regulations (no IMO text is copied beyond names and coordinates). Not an official IMO product. |
| Coastline (where a line ends "on the coast"; land / water check) | `data/seaareas/imo.json`, `src/lib/landMaskData.ts` | Natural Earth 1:10m land, https://www.naturalearthdata.com | Public domain |
| Territorial sea (12 nm), contiguous zone (24 nm), EEZ limits | `data/seaareas/zones/ts12`, `cz24`, `eez` | Flanders Marine Institute (2023). Maritime Boundaries Geodatabase, version 12, https://www.marineregions.org (simplified by Galenea) | CC BY 4.0. No legal value. |
| 3 / 50 / 200 nm from land | `data/seaareas/zones/nm3`, `nm50`, `nm200` | Worked out from Natural Earth 1:10m land and minor islands | Public domain |
| Climate averages beyond the forecast | `data/climate/m01.json … m12.json` | ERA5 reanalysis 2006–2025 (ECMWF / Copernicus Climate Change Service), via Google ARCO-ERA5; monthly statistics worked out by Galenea | Contains modified Copernicus Climate Change Service information 2026. ERA5 © ECMWF, CC BY 4.0 (Copernicus licence). Climate averages, not forecasts. |
| Geodesics | dependency `geographiclib-geodesic` | Charles Karney | MIT |
| Svelte, Rollup and the other build tools | `package.json` | their authors | their own licences (MIT and similar) |

None of these is for navigation. The plugin is a planning aid only.
