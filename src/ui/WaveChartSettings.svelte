<!-- Settings → Wave chart: your colours for Windy's SWH / sea / swell layers and lines of equal height. -->
<label class="check"><input type="checkbox" bind:checked={$waveColors.on} /> Use my colours for Windy's wave (SWH), wind-sea and swell layers</label>
{#if $waveColors.on}
    <div class="palettes">
        {#each PALETTES as p}
            <label class="pal" class:on={$waveColors.palette === p.id}>
                <input type="radio" name="pal" value={p.id} bind:group={$waveColors.palette} />
                <span class="strip">{#each strip(p) as c}<i style="background:{c}" />{/each}</span>
                {p.label}
            </label>
        {/each}
    </div>
{/if}
<div class="grid">
    <label title="Below this the sea is shown white"
        >SWH white below (m) <input type="number" step="0.5" min="0" max="15" value={$waveColors.min.hs} on:change={e => setMin('hs', e)} /></label>
    <label title="Below this the sea is shown white"
        >Sea white below (m) <input type="number" step="0.5" min="0" max="15" value={$waveColors.min.sea} on:change={e => setMin('sea', e)} /></label>
    <label title="Below this the sea is shown white"
        >Swell 1 and 2 white below (m) <input type="number" step="0.5" min="0" max="15" value={$waveColors.min.swell} on:change={e => setMin('swell', e)} /></label>
    <label
        >Steps
        <select bind:value={$waveColors.step}>
            <option value={0.5}>every 0.5 m</option>
            <option value={1}>every 1 m</option>
        </select>
    </label>
</div>
<h5 class="sub">Lines of equal height (like isobars), labelled in metres</h5>
<div class="toggles">
    {#each WAVE_LINES as w}
        <label class="switch"><input type="checkbox" bind:checked={$waveColors.lines[w.id]} /><span class="knob" /><i class="ln" style="background:{w.color}" />{w.label}</label>
    {/each}
</div>
<div class="pp-note g-hl"><button class="pp-btn small" on:click={loadLinesForView}>Load lines for this map view</button> up to about 300 points; load again after moving the map. <Hint title="Lines of equal wave height"><p>Lines for the wave type <b>Windy is showing</b> come from Windy's own map data (fine, drawn by themselves). Lines for the
    others need forecast points over the map you see (up to about 300 points; load again after moving the map). Sea from points is worked out from SWH and the swells.</p></Hint></div>
{#if $waveChartStatus}<p class="pp-note">{$waveChartStatus}</p>{/if}
<div class="pp-note g-hl">Windy's colours come back when the plugin closes. <Hint title="Using the wave chart"><p>Pick the layer on Windy's map (or the <b>SWH / Sea / Swell 1 / Swell 2</b> buttons in the Weather tab). The colours are Windy's own
    picture with your colour scale; the lines are the plugin's, from ECMWF-WAM forecast points (coarser). Windy's colours are
    put back when the plugin closes. Whole metres: solid lines; half metres: dashed.</p></Hint></div>

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import { bandColor, PALETTES, WAVE_LINES, type Palette, type WaveLayer } from '../lib/waveColors';
    import { loadLinesForView, waveChartStatus, waveColors } from '../windy/waveChart';

    const strip = (p: Palette) => Array.from({ length: 10 }, (_, i) => `rgb(${bandColor(p, i, 10).slice(0, 3).join(',')})`);
    function setMin(k: WaveLayer, e: Event) {
        const n = Number((e.target as HTMLInputElement).value);
        waveColors.update(s => ({ ...s, min: { ...s.min, [k]: isFinite(n) && n >= 0 ? n : 0 } }));
    }
</script>

<style lang="less">
    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 10px;
        margin: 6px 0;
        label {
            display: flex;
            flex-direction: column;
            font-size: 11px;
        }
    }
    .sub {
        margin: 10px 0 4px;
    }
    .toggles {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 16px;
    }
    .ln {
        display: inline-block;
        width: 14px;
        height: 3px;
    }
    .switch {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        input {
            position: absolute;
            opacity: 0;
            width: 0;
            height: 0;
        }
        .knob {
            position: relative;
            width: 30px;
            height: 16px;
            border-radius: 8px;
            background: #666;
            &::after {
                content: '';
                position: absolute;
                left: 2px;
                top: 2px;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #fff;
                transition: left 0.15s;
            }
        }
        input:checked + .knob {
            background: #2e9e4f;
            &::after {
                left: 16px;
            }
        }
    }
    .palettes {
        display: flex;
        flex-direction: column;
        gap: 3px;
        margin: 4px 0 6px 20px;
    }
    .pal {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        &.on {
            font-weight: bold;
        }
    }
    .strip {
        display: inline-flex;
        border: 1px solid rgba(0, 0, 0, 0.6);
        i {
            display: inline-block;
            width: 14px;
            height: 10px;
        }
    }
    .small {
        padding: 2px 8px;
        font-size: 11px;
    }
</style>
