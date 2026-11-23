<!-- Weather for an area (owner, 2026-11-19): north / south latitude, west / east longitude make a box; "Get weather"
     downloads the forecast on a grid over it (0.5°–6° apart, at most 400 points; was 3° / 300 = about 50° × 50° until
     the owner asked for bigger areas, 2026-11-23); fetched again when Windy has a newer run.
     A route inside the box then needs no download of its own when it is changed. -->
<div class="aw" data-g="wx-area">
    <div class="aw__head">
        <label class="switch aw__on" title="Use the area's forecast for the weather"><input type="checkbox" checked={$wxAuto.areaOn} on:change={e => (e.currentTarget.checked ? on() : areaOff())} /><span class="knob" /><b>Weather for an area</b></label>
        <Hint title="Weather for an area">
            <p>Type the <b>north and south latitude</b> and the <b>west and east longitude</b> of the area (e.g. <span class="mono">48 30N</span>, <span class="mono">005 15W</span>, or −5.25), or take them from the map you see or from your route. <b>Get weather</b> downloads the forecast on a grid over the box (0.5° to 6° apart: the finest that keeps to 400 points, one download each, so a bigger box gets points further apart). Up to about 110° × 110°.</p>
            <p>While the plugin is open it is fetched again by itself when Windy has a newer forecast run (checked every hour). A route inside the box then needs no download of its own when you change it: good for trying different tracks round bad weather. Sea, currents and visibility come with it (Open-Meteo), so it also works with the Windy tab hidden.</p>
            <p>Why a limit: every grid point is a separate forecast download from Windy (and Open-Meteo for sea, currents and visibility), about 2 minutes for 400 points. More points would take long and load Windy's service; points further apart than 6° (360 nm) tell little. For a whole ocean, a coarse box gives the overview and the route keeps its own close points.</p>
            <p>The box is drawn on the map (yellow, dashed).</p>
        </Hint>
    </div>
    <div class="aw__grid">
        <label>North lat <input type="text" bind:value={nTxt} placeholder="e.g. 50 00N" on:change={save} /></label>
        <label>South lat <input type="text" bind:value={sTxt} placeholder="e.g. 40 00N" on:change={save} /></label>
        <label>West lon <input type="text" bind:value={wTxt} placeholder="e.g. 020 00W" on:change={save} /></label>
        <label>East lon <input type="text" bind:value={eTxt} placeholder="e.g. 005 00E" on:change={save} /></label>
    </div>
    <div class="aw__go">
        <button class="pp-btn g-btn--primary" disabled={$areaBusy || !grid} on:click={get} title="Download the forecast for the area now"><Icon name="download" size={15} /> Get weather</button>
        {#if !$phone}<button class="pp-btn pp-btn--ghost small" on:click={fromMap} title="The map you see now">Map view</button>{/if}
        <button class="pp-btn pp-btn--ghost small" disabled={$route.waypoints.length < 2} on:click={fromRoute} title="Round the route, 2° extra on each side">Round the route</button>
        {#if grid}<span class="pp-note">{grid.points.length} points, every {grid.step}° (about {Math.round(grid.step * 60)} nm), about {Math.max(1, Math.round((grid.points.length * 0.3) / 60))} min to download</span>{:else if anyTyped}<span class="pp-note pp-err">Check the four values: north must be north of south; at most about 110° × 110°</span>{/if}
    </div>
    {#if grid && grid.step >= 4}<p class="pp-note">A big area gets a coarse grid ({grid.step}° ≈ {Math.round(grid.step * 60)} nm between points): good for an overview and for weather off the track; your route still gets its own forecast points every 30–60 nm.</p>{/if}
    {#if $areaStatus}<div class="g-status" class:g-status--ok={/^Done|^Updated/.test($areaStatus)}>{$areaStatus}{#if $lastAreaFetch && $wxAuto.every3h}{" "}Fetched again by itself when Windy has a newer run.{/if}</div>{/if}
</div>

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import { fmtLat, fmtLon, parseCoord } from '../lib/format';
    import { logEvent } from '../lib/activityLog';
    import { areaGrid, type WxArea } from '../lib/weather';
    import { phone, route } from '../state';
    import { areaBusy, areaOff, areaStatus, lastAreaFetch, refreshArea, wxAuto } from '../windy/weatherJobs';
    import { map } from '@windy/map';

    const a0 = $wxAuto.area;
    let nTxt = a0 ? fmtLat(a0.n, 1) : '';
    let sTxt = a0 ? fmtLat(a0.s, 1) : '';
    let wTxt = a0 ? fmtLon(a0.w, 1) : '';
    let eTxt = a0 ? fmtLon(a0.e, 1) : '';
    $: typed = { n: parseCoord(nTxt, 'lat'), s: parseCoord(sTxt, 'lat'), w: parseCoord(wTxt, 'lon'), e: parseCoord(eTxt, 'lon') };
    $: area = typed.n != null && typed.s != null && typed.w != null && typed.e != null ? ({ n: typed.n, s: typed.s, w: typed.w, e: typed.e } as WxArea) : null;
    $: grid = area ? areaGrid(area) : null;
    $: anyTyped = !!(nTxt || sTxt || wTxt || eTxt);

    function save() {
        if (area && grid) wxAuto.update(x => ({ ...x, area }));
    }
    function setBox(b: WxArea) {
        const r1 = (v: number) => Math.round(v * 2) / 2;
        b = { n: Math.min(89, r1(b.n)), s: Math.max(-89, r1(b.s)), w: r1(b.w), e: r1(b.e) };
        nTxt = fmtLat(b.n, 1);
        sTxt = fmtLat(b.s, 1);
        wTxt = fmtLon(b.w, 1);
        eTxt = fmtLon(b.e, 1);
        wxAuto.update(x => ({ ...x, area: b }));
    }
    function fromMap() {
        try {
            const bb = map.getBounds();
            setBox({ n: bb.getNorth(), s: bb.getSouth(), w: ((((bb.getWest() + 180) % 360) + 360) % 360) - 180, e: ((((bb.getEast() + 180) % 360) + 360) % 360) - 180 });
        } catch {
            areaStatus.set('Could not read the map view: type the area instead.');
        }
    }
    function fromRoute() {
        const w = $route.waypoints;
        const lats = w.map(p => p.lat);
        const lons = w.map(p => p.lon);
        setBox({ n: Math.max(...lats) + 2, s: Math.min(...lats) - 2, w: Math.min(...lons) - 2, e: Math.max(...lons) + 2 });
    }
    function on() {
        save();
        if ($wxAuto.area) wxAuto.update(x => ({ ...x, areaOn: true }));
    }
    function get() {
        save();
        logEvent('click', 'Area weather: Get weather', { area });
        refreshArea({ fresh: true });
    }
</script>

<style lang="less">
    .aw {
        margin-top: 10px;
        padding: 8px 10px;
        border: 1px dashed rgba(255, 212, 0, 0.55);
        border-radius: var(--g-r-m);
    }
    .aw__head {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .aw__on {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .aw__grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        margin: 6px 0;
        label {
            display: flex;
            flex-direction: column;
            gap: 2px;
            font-size: 11.5px;
        }
        input {
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            font-family: var(--g-mono);
        }
    }
    .aw__go {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
    }
    @media (max-width: 600px) {
        .aw__grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>
