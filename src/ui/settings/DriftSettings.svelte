<!-- Settings → Drift (owner, 2026-11-26). How the ship lies and drifts when stopped, what is shown, when to warn. -->
<div class="pp-note g-hl">
    How your ship lies and drifts when stopped.
    <Hint title="Drift settings"
        ><p>
            A stopped ship lies with the wind about θ on the bow: just forward of the beam when the accommodation (most windage) is aft, about abeam with it 1/3 from forward and the engine
            casing aft, just abaft the beam with it forward. Its wind drift is then a little off downwind (δ), to one side or the other depending on which side is to the weather.
        </p>
        <p>The figures are starting values, not measured for your ship: type what you see, and update the position while drifting: the plugin learns from it (on by default).</p></Hint
    >
</div>
<div class="gs-grid">
    <label
        >Accommodation / most windage
        <select bind:value={$driftSettings.accom}>
            <option value={null}>As usual for the ship type ({ACCOM.find(a => a.id === accomFor($vessel.shipType))?.label})</option>
            {#each ACCOM as a}<option value={a.id}>{a.label}</option>{/each}
        </select>
    </label>
    <label
        >Wind on the bow when stopped (°, empty = from the accommodation: {p.theta}°)
        <input type="number" min="30" max="150" step="1" bind:value={$driftSettings.theta} placeholder={String(p.theta)} />
    </label>
    <label
        >Drift off downwind (°, empty = worked out: {p.delta}°)
        <input type="number" min="0" max="45" step="1" bind:value={$driftSettings.delta} placeholder={String(p.delta)} />
    </label>
    <label
        >Side to the weather
        <select bind:value={$driftSettings.side}>
            <option value="both">Both (two tracks)</option>
            <option value="stbd">Starboard side</option>
            <option value="port">Port side</option>
        </select>
    </label>
    <label
        >Show ahead
        <select bind:value={$driftSettings.hours}>
            {#each [6, 12, 24, 48, 72] as h}<option value={h}>{h} hours</option>{/each}
        </select>
    </label>
    <label
        >Marks on the track every
        <select bind:value={$driftSettings.marksH}>
            <option value={1}>1 hour</option>
            <option value={3}>3 hours</option>
        </select>
    </label>
    <label
        >Warn within (nm of land)
        <input type="number" min="1" max="30" step="1" bind:value={$driftSettings.dangerNm} />
    </label>
    <label
        >Spread shown: drift speed ± (%)
        <input type="number" min="0" max="80" step="5" bind:value={$driftSettings.spreadPct} />
    </label>
    <label
        >Spread shown: direction ± (°)
        <input type="number" min="0" max="45" step="1" bind:value={$driftSettings.spreadDeg} />
    </label>
</div>
<div class="gs-toggles">
    <label class="gs-switch switch"><input type="checkbox" bind:checked={$driftSettings.learn} /><span class="gs-knob" />Learn from my position updates (speed and direction; newer updates count more)</label>
</div>
<p class="pp-note">Wind drift: {p.leewayPct.toFixed(1)} % of the wind speed ({p.leewayHow}). Change it in Ship particulars (leeway, windage height).</p>

<script lang="ts">
    import Hint from '../base/Hint.svelte';
    import { ACCOM, accomFor, driftParams } from '../../lib/drift';
    import { vessel } from '../../state';
    import { driftSettings } from '../../windy/driftJob';

    // an emptied number box gives null (= worked out)
    $: for (const k of ['theta', 'delta'] as const) if (($driftSettings[k] as unknown) === '' || ($driftSettings[k] != null && !isFinite($driftSettings[k] as number))) $driftSettings[k] = null;
    $: p = driftParams($vessel, $driftSettings);
</script>
