<!-- Settings → Nautical charts and places -->
<label class="gs-check">
    <input type="checkbox" checked={$chartLayers.seamarks} on:change={e => chartLayers.update(c => ({ ...c, seamarks: e.currentTarget.checked }))} />
    <span>Show <b>OpenSeaMap</b> seamarks on the map (lights, buoys, traffic separation, anchorages; from zoom 9)</span>
</label>
<label class="slider"
    >Seamarks strength <input type="range" min="0.3" max="1" step="0.1" value={$chartLayers.opacity} on:input={e => chartLayers.update(c => ({ ...c, opacity: Number(e.currentTarget.value) }))} /></label
>
<label class="gs-check">
    <input type="checkbox" checked={$chartLayers.depth} on:change={e => chartLayers.update(c => ({ ...c, depth: e.currentTarget.checked }))} />
    Depth shading (GEBCO, worldwide; experimental)
</label>
<label class="gs-check">
    <input type="checkbox" checked={$placesLayers.ports} on:change={e => placesLayers.update(c => ({ ...c, ports: e.currentTarget.checked }))} />
    Show ports and pilot stations on the map
</label>
<label class="gs-check">
    <input type="checkbox" checked={$placesLayers.canals} on:change={e => placesLayers.update(c => ({ ...c, canals: e.currentTarget.checked }))} />
    Show canals and main straits on the map
</label>

<!-- Sea areas and limits (owner, 2026-11-22): ECA / SECA, MARPOL special areas by annex, ballast water, 3 / 12 / 24 / 50 / 200 nm -->
<div class="sa" data-g="sea-areas">
    <div class="sa__head"><b>Sea areas and limits</b>
        <Hint title="Sea areas and limits" width={380}>
            <p><b>IMO areas</b> (ECAs and MARPOL special areas): drawn from the official IMO texts (MARPOL Annex VI appendix VII and the MEPC resolutions; the source of each is in the list below and when you point at its name on the map). Where a text says "on the coast", the line ends at the coast of the Natural Earth world map.</p>
            <p><b>Distance lines</b>: 3, 50 and 200 nm are measured by the plugin from the Natural Earth coastline, <b>not from the official baselines</b>; the 12 nm, 24 nm and EEZ limits come from the Marine Regions maritime boundaries (Flanders Marine Institute). Real limits can differ (straight baselines, agreements, claims).</p>
            <p>The data is downloaded once from the plugin's public code page and then kept in this browser, so it also shows with no internet.</p>
        </Hint>
    </div>
    <div class="sa__grp">Emission control areas (MARPOL Annex VI)</div>
    <label class="gs-check"><input type="checkbox" checked={$seaAreaLayers.sox} on:change={e => set('sox', e.currentTarget.checked)} /><i class="sa__sw" style={sw('eca')} /> SOx ECAs (SECA): 0.10 % sulphur fuel</label>
    <label class="gs-check"><input type="checkbox" checked={$seaAreaLayers.nox} on:change={e => set('nox', e.currentTarget.checked)} /><i class="sa__sw" style={sw('eca')} /> NOx ECAs (NECA): Tier III engines</label>
    <label class="gs-check sa__sub"><input type="checkbox" checked={$seaAreaLayers.future} on:change={e => set('future', e.currentTarget.checked)} /><i class="sa__sw" style={sw('eca', true)} /> Also adopted, not yet in force (North-East Atlantic ECA, in force 1 Sep 2027)</label>
    <div class="sa__grp">MARPOL special areas</div>
    <label class="gs-check"><input type="checkbox" checked={$seaAreaLayers.a1} on:change={e => set('a1', e.currentTarget.checked)} /><i class="sa__sw" style={sw('a1')} /> Annex I: oil</label>
    <label class="gs-check"><input type="checkbox" checked={$seaAreaLayers.a2} on:change={e => set('a2', e.currentTarget.checked)} /><i class="sa__sw" style={sw('a2')} /> Annex II: noxious liquid substances (Antarctic; persistent floating products areas)</label>
    <label class="gs-check"><input type="checkbox" checked={$seaAreaLayers.a4} on:change={e => set('a4', e.currentTarget.checked)} /><i class="sa__sw" style={sw('a4')} /> Annex IV: sewage (Baltic, passenger ships)</label>
    <label class="gs-check"><input type="checkbox" checked={$seaAreaLayers.a5} on:change={e => set('a5', e.currentTarget.checked)} /><i class="sa__sw" style={sw('a5')} /> Annex V: garbage</label>
    <div class="sa__grp">Distance from land and sea zones</div>
    {#each ZONE_KINDS as k}
        <label class="gs-check"><input type="checkbox" checked={$seaAreaLayers[k]} on:change={e => set(k, e.currentTarget.checked)} /><i class="sa__sw" style={zsw(k)} /> {ZONE_LABEL[k]}{ZONE_MIN_ZOOM[k] > 3 ? ` (from zoom ${ZONE_MIN_ZOOM[k]})` : ''}</label>
    {/each}
    <div class="sa__row">
        <label class="gs-check"
            ><input type="checkbox" checked={$seaAreaLayers.nm50 && $seaAreaLayers.nm200} on:change={e => seaAreaLayers.update(c => ({ ...c, nm50: e.currentTarget.checked, nm200: e.currentTarget.checked }))} /> Ballast water exchange: the 50 nm and 200 nm lines</label
        >
        <Hint title="Ballast water exchange" width={340}>
            <p>BWM Convention, regulation B-4, as written in UK law (SI 2022/737, reg. 11): exchange "must, where possible, be carried out at least 200 nautical miles from the nearest land; and in water at least 200 metres in depth", otherwise "as far as possible from the nearest land and in any case not less than 50 nautical miles from the nearest land" and in water at least 200 m deep.</p>
            <p><b>Depth is not shown</b>, the lines are from the coastline (not the baselines), and many states and regions set their own exchange areas or require treatment (D-2) instead: check the port and flag requirements.</p>
        </Hint>
    </div>
    <label class="gs-check"><input type="checkbox" checked={$seaAreaLayers.labels} on:change={e => set('labels', e.currentTarget.checked)} /> Names of the areas on the map (point at one for its rule and source)</label>
    {#if $seaAreaStatus}<div class="g-status">{$seaAreaStatus}</div>{/if}
    {#if shownAreas.length}
        <details class="sa__list">
            <summary>What the lines on the map are ({shownAreas.length})</summary>
            {#each shownAreas as a}
                <div class="sa__item"><i class="sa__sw" style={sw(a.g, !!a.future)} /><b>{a.name}</b>{a.note ? `: ${a.note}` : ''} <span class="pp-note">Source: {a.src}.</span></div>
            {/each}
        </details>
    {/if}
    {#if $seaAreaLayers.ts12 || $seaAreaLayers.cz24 || $seaAreaLayers.eez}<p class="pp-note">Maritime limits: Flanders Marine Institute (2023), Maritime Boundaries v12, marineregions.org, CC BY 4.0 (simplified for this map; no legal value).</p>{/if}
    {#if $seaAreaLayers.nm3 || $seaAreaLayers.nm50 || $seaAreaLayers.nm200}<p class="pp-note">3 / 50 / 200 nm lines: worked out by the plugin from the Natural Earth coastline (public domain), not from official baselines.</p>{/if}
    <p class="pp-note pp-err">Sea areas and limits: for planning and orientation only, not official. Rules and limits change: check the current IMO texts, flag and port state rules, and official charts.</p>
</div>

<p class="pp-note pp-err">
    Not official charts. For orientation only; always use ECDIS / official charts and publications. Seamarks © OpenSeaMap contributors (CC BY-SA), data © OpenStreetMap (ODbL). If the chart server is down, nothing is
    drawn.
</p>

<script lang="ts">
    import Hint from '../base/Hint.svelte';
    import { chartLayers, placesLayers, seaAreaLayers, type SeaAreaLayers } from '../../state';
    import { AREA_STYLE, ZONE_KINDS, ZONE_LABEL, ZONE_MIN_ZOOM, ZONE_STYLE, areaWanted, imoAreas, seaAreaStatus, type ImoArea } from '../../windy/seaAreasLayer';

    const set = (k: keyof SeaAreaLayers, v: boolean) => seaAreaLayers.update(c => ({ ...c, [k]: v }));
    const dash = (d: string | undefined, color: string) => (d ? `background: repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` : `background: ${color}`);
    const sw = (g: ImoArea['g'], future = false) => dash(future || AREA_STYLE[g].dashArray ? 'x' : undefined, AREA_STYLE[g].color);
    const zsw = (k: (typeof ZONE_KINDS)[number]) => dash(ZONE_STYLE[k].dashArray, ZONE_STYLE[k].color);
    $: shownAreas = $imoAreas.filter(a => areaWanted(a, $seaAreaLayers));
</script>

<style lang="less">
    .sa {
        margin: 10px 0 6px;
        padding: 8px 10px;
        border: 1px solid var(--g-border);
        border-radius: var(--g-r-m);
    }
    .sa__head {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .sa__grp {
        margin: 8px 0 2px;
        font-size: 11.5px;
        color: var(--g-text-3);
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }
    .sa__row {
        display: flex;
        align-items: center;
        gap: 2px;
    }
    .sa__sub {
        margin-left: 22px;
    }
    .sa__sw {
        display: inline-block;
        width: 22px;
        height: 3px;
        margin: 0 4px 0 2px;
        vertical-align: middle;
        border-radius: 1px;
        flex: none;
    }
    .sa__list {
        margin-top: 6px;
        font-size: 12px;
        summary {
            cursor: pointer;
        }
    }
    .sa__item {
        margin: 4px 0;
        line-height: 1.35;
    }
</style>
