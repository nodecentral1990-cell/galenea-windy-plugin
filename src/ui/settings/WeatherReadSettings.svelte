<!-- Settings → Weather reading (owner, 2026-11-19: weather by itself, area, downloads that work with the tab hidden) -->
<label class="gs-check" title="After you change a waypoint the forecast for the changed legs is fetched by itself (about 2 s after you stop editing); the other legs come from memory">
    <input type="checkbox" bind:checked={$wxAuto.followRoute} />
    Update the weather by itself after a change of the route
</label>
<label class="gs-check" title="While the plugin is open, the route's (and the area's) forecast is fetched again when it is 3 hours old">
    <input type="checkbox" bind:checked={$wxAuto.every3h} />
    Fetch the forecast again every 3 hours
</label>
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
<div class="pp-note g-hl">
    Rows marked <b>E</b> = earlier Windy run kept here; <b>OM</b> = Open-Meteo.
    <Hint title="Where the weather comes from"
        ><p>
            The plugin uses Windy's ECMWF and ECMWF-WAM first. Rows from other sources are marked in the weather table: <b>E</b> = an earlier Windy run kept in this browser (past times), <b>OM</b> = Open-Meteo (ECMWF
            IFS 0.25° for wind and pressure, GFS Wave 0.25° for waves; CC BY 4.0).
        </p></Hint
    >
</div>

<script lang="ts">
    import Hint from '../base/Hint.svelte';
    import { freeForecast } from '../../state';
    import { autoLayers, wxAuto } from '../../windy/weatherJobs';
</script>
