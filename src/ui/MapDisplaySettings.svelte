<!-- Settings: how the ship and route are shown on the map, and the ship window. -->
<div class="grid">
    <label
        >Ship symbols every
        <select bind:value={$shipStepH}>
            <option value={0}>off</option>
            {#each [1, 2, 3, 6, 12, 24] as h}<option value={h}>{h} h</option>{/each}
        </select>
    </label>
    <label
        >Ship symbol
        <span class="sym">
            <select bind:value={$shipStyle}>
                {#each SHIP_STYLES as s}<option value={s.id}>{s.label}</option>{/each}
            </select>
            <span class="sym__preview" title="Seen from above, bow up. Turns red on an IMO roll/broaching warning">{@html shipSymbolSvg($shipStyle, 34)}</span>
        </span>
    </label>
</div>
<label class="check" title="A bar at the top of the map with the weather where the mouse rests, at Windy's map time (computer only)">
    <input type="checkbox" checked={$cursorBar.on} on:change={e => cursorBar.update(b => ({ ...b, on: e.currentTarget.checked }))} />
    Weather under the cursor (bar at the top of the map)
</label>
<label class="check" title="Three rings around the ship at the map time; their spacing follows the map scale (10 / 20 / 30 nm … 100 / 200 / 300 nm)">
    <input type="checkbox" bind:checked={$rangeRings} />
    Range rings around the ship (3 rings, spacing follows the map scale)
</label>
<label class="check" title="Softer text and accents in the plugin panel and windows, for the wheelhouse at night">
    <input type="checkbox" bind:checked={$panelDim} />
    Dim the plugin panel (wheelhouse at night)
</label>
<label class="check" title="Windy's pressure lines (isobars). Windy's own isolines menu can still change or hide them.">
    <input type="checkbox" bind:checked={$showIsobars} on:change={() => $showIsobars && showPressureLines()} />
    Show isobars (pressure lines) when the plugin opens
</label>
<label class="check" title="Rings from the ship outwards: swell 1, swell 2, sea, SWH, wind barb. Amber = alert, red = limit or IMO warning.">
    <input type="checkbox" bind:checked={$shipWeather} />
    Show SWH, sea, swell 1, swell 2 and wind on the ship symbols (after "Get forecast" in the Weather tab)
</label>
<div class="swatches">
        <span class="pp-note">Flag colours (map symbols, polar diagram and ship window):</span>
        {#each FLAG_KINDS as [k, label]}
            <div class="swrow">
                <span class="swlabel">{label}</span>
                {#each FLAG_PALETTE as c}
                    <button
                        class="sw"
                        class:on={$flagColors[k] === c}
                        style="background:{c}"
                        title={c}
                        on:click={() => flagColors.update(f => ({ ...f, [k]: c }))}
                    />
                {/each}
            </div>
        {/each}
        <span class="pp-note">Amber and red are kept for warnings (your limits), so they are not offered here.</span>
    </div>
<label class="check" title="The map pans so the ship at Windy's slider time stays in the middle. The map stays north up.">
    <input type="checkbox" bind:checked={$followShip} />
    Keep the ship centred on the map (the map follows the ship, north up)
</label>
<label class="check" title="Route name, times in UTC, the ship and swell / sea / wind / current at the slider time">
    <input type="checkbox" bind:checked={$showShipBox} />
    Show the ship info window on the map (top left, drag to move)
</label>
<div class="grid colors">
    <label class="col">Track colour <input type="color" value={$route.color || '#ff2d95'} on:change={e => setColor('color', e)} /></label>
    <label class="col">Sailed part colour (voyage) <input type="color" value={$route.doneColor || '#9e9e9e'} on:change={e => setColor('doneColor', e)} /></label>
</div>

<script lang="ts">
    import { FLAG_PALETTE, type FlagColors } from '../lib/shipGlyph';
    const FLAG_KINDS: [keyof FlagColors, string][] = [
        ['swh', 'SWH'],
        ['sea', 'Sea'],
        ['swell', 'Swell 1'],
        ['swell2', 'Swell 2'],
    ];
    import { SHIP_STYLES, shipSymbolSvg } from '../lib/shipSymbols';
    import { showPressureLines } from '../windy/weatherJobs';
    import { cursorBar, rangeRings, flagColors, followShip, panelDim, route, shipStepH, shipStyle, shipWeather, showIsobars, showShipBox, updateRoute } from '../state';

    function setColor(k: 'color' | 'doneColor', e: Event) {
        const v = (e.target as HTMLInputElement).value;
        updateRoute(r => (r[k] = v));
    }
</script>

<style lang="less">
    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 10px;
        margin-bottom: 4px;
        label {
            display: flex;
            flex-direction: column;
            font-size: 11px;
        }
    }
    .check {
        display: flex;
        gap: 4px;
        align-items: center;
        margin: 3px 0;
    }
    .sym {
        display: flex;
        align-items: center;
        gap: 6px;
        select {
            flex: 1;
        }
    }
    .sym__preview {
        line-height: 0;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        padding: 1px;
    }
    .swatches {
        margin: 2px 0 6px 22px;
    }
    .swrow {
        display: flex;
        align-items: center;
        gap: 3px;
        margin-bottom: 3px;
    }
    .swlabel {
        width: 70px;
        font-size: 11px;
    }
    .sw {
        width: 18px;
        height: 14px;
        border: 1px solid rgba(0, 0, 0, 0.6);
        border-radius: 3px;
        cursor: pointer;
        padding: 0;
        &.on {
            outline: 2px solid #fff;
            outline-offset: 1px;
        }
    }
    .colors {
        margin-top: 6px;
    }
    input[type='color'] {
        width: 60px;
        height: 24px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.3);
        background: none;
    }
</style>
