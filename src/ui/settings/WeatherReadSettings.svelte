<!-- Settings → Weather reading (owner, 2026-11-19: weather by itself, area, downloads that work with the tab hidden) -->
<label class="gs-check" title="After a change of the route the weather is shown at once from the forecast already downloaded; only points far (more than 25 nm) from any downloaded point are fetched, a second or so after you stop editing">
    <input type="checkbox" bind:checked={$wxAuto.followRoute} />
    After a change of the route: show the weather at once, download only the new parts
</label>
<label class="gs-check" title={IS_APP ? "Once an hour the app asks Open-Meteo (one small request) whether a newer forecast run is out; only then are the forecasts fetched again" : "While the plugin is open, once an hour the plugin asks Windy (one small request) whether a newer forecast run is out; only then are the route's and the area's forecasts fetched again"}>
    <input type="checkbox" bind:checked={$wxAuto.every3h} />
    Get the new forecast by itself when {IS_APP ? 'Open-Meteo' : 'Windy'} has a newer run (checked every hour)
</label>
{#if !IS_APP}
<label class="gs-check" title="Sea (wind waves) and currents from Open-Meteo marine (Météo-France), visibility from Open-Meteo, downloaded with the forecast: free, and it works while the Windy tab is hidden or minimised">
    <input type="checkbox" bind:checked={$wxAuto.extras} />
    Download sea, currents and visibility with the forecast (Open-Meteo, free; works with the tab hidden)
</label>
<label class="gs-check" title="After the forecast, step Windy's time slider through the voyage with Windy's sea, currents and visibility layers and read them at each ship position (about 1–2 s per step). Needs the Windy tab on screen: browsers stop drawing hidden pages. When done, Windy's values replace the downloaded ones.">
    <input type="checkbox" bind:checked={$autoLayers} />
    Also read Windy's own map (sea, currents, visibility) after the forecast (moves Windy's time slider; keep the tab on screen)
</label>
<label class="gs-check" title="Open-Meteo is a free weather service (no account). Used only where Windy has nothing: past times not kept in this browser, and days beyond your Windy plan (free Windy: about 5 days, 3-hour steps).">
    <input type="checkbox" bind:checked={$freeForecast} />
    <span>Fill missing times from <b>Open-Meteo</b> (free): past times, and days beyond your Windy plan</span>
</label>
{/if}
<label class="gs-check" title="Beyond the end of the forecast (about 10–15 days), the usual weather of that month from a climate table (ERA5, 2006–2025, 2° squares): mean wind and waves, with the chance of a gale and of high seas. Used in the weather table (rows marked C) and for the ETA; never a warning, never a forecast.">
    <input type="checkbox" bind:checked={$climateOn} />
    <span>Beyond the forecast: <b>climate averages</b> (usual weather of the month; rows marked <b>C</b>; also for the ETA)</span>
</label>
{#if $climateStatus}<div class="g-status">{$climateStatus}</div>{/if}
{#if IS_APP}
<div class="pp-note g-hl">
    All weather comes from <b>Open-Meteo</b> (free, CC BY 4.0): wind and pressure from ECMWF IFS 0.25°, waves, swells, currents and sea
    temperature from Météo-France MFWAM (about 10 days), then GFS Wave 0.25° up to 15 days. Rows marked <b>OM</b> = not the newest run or
    another model; <b>C</b> = climate average, not a forecast. Everything downloaded is kept on this phone and used with no internet.
</div>
{:else}
<div class="pp-note g-hl">
    Rows marked <b>E</b> = earlier Windy run kept here; <b>OM</b> = Open-Meteo; <b>C</b> = climate average, not a forecast.
    <Hint title="Where the weather comes from"
        ><p>
            The plugin uses Windy's ECMWF and ECMWF-WAM first. Rows from other sources are marked in the weather table: <b>E</b> = an earlier Windy run kept in this browser (past times), <b>OM</b> = Open-Meteo (ECMWF
            IFS 0.25° for wind and pressure, GFS Wave 0.25° for waves; CC BY 4.0), <b>C</b> = climate average beyond the forecast: the usual weather of that month
            from ERA5 (ECMWF / Copernicus reanalysis, 2006–2025, 2° squares; "contains modified Copernicus Climate Change Service information"). C rows give the usual wind and waves and the chance of a gale and of seas over 4 / 6 m; they never raise a warning.
        </p></Hint
    >
</div>
{/if}

<script lang="ts">
    import Hint from '../base/Hint.svelte';
    import { IS_APP } from '../../lib/appMode';
    import { climateOn, freeForecast } from '../../state';
    import { climateStatus } from '../../windy/climateJob';
    import { autoLayers, wxAuto } from '../../windy/weatherJobs';
</script>
