# Third-party data and libraries

The plugin's own code is MIT (see LICENSE). These parts come from others and keep their own licences:

| Part | Where in the code | Source | Licence |
|---|---|---|---|
| Sea-lane network (distances along shipping lanes) | `src/lib/seaNetData.ts` (`SEANET_B64`), packed from `@ssroute/data-eurostat` 0.2.1 | Eurostat SeaRoute / MARNET network (built from the Oak Ridge National Laboratory Global Shipping Lane Network and AIS data) | **EUPL-1.2**: this data part (and changes made to it: merged on a 0.2° grid and packed) is distributed under the EUPL-1.2, not the MIT licence. https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 |
| Port list | `src/lib/seaNetData.ts` (`PORTS_RAW`), from the npm package `sea-ports` 0.0.9 | marchah / sea-ports | MIT, Copyright (c) 2016 marchah. Positions approximate. |
| Weather (shown, not included) | fetched at run time | Windy.com (ECMWF, ECMWF-WAM) | Windy's terms of use |
| Free forecast fill (fetched at run time, optional) | `src/windy/forecast.ts` | Open-Meteo, https://open-meteo.com | CC BY 4.0; data by ECMWF and NOAA NCEP |
| Seamarks overlay (fetched at run time, off by default) | `src/windy/chartLayer.ts` | OpenSeaMap, https://www.openseamap.org | Tiles CC BY-SA 2.0; data © OpenStreetMap contributors, ODbL |
| Geodesics | dependency `geographiclib-geodesic` | Charles Karney | MIT |
| Svelte, Rollup and the other build tools | `package.json` | their authors | their own licences (MIT and similar) |

None of these is for navigation. The plugin is a planning aid only.
