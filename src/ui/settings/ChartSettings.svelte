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
<p class="pp-note pp-err">
    Not official charts. For orientation only; always use ECDIS / official charts and publications. Seamarks © OpenSeaMap contributors (CC BY-SA), data © OpenStreetMap (ODbL). If the chart server is down, nothing is
    drawn.
</p>

<script lang="ts">
    import { chartLayers, placesLayers } from '../../state';
</script>
