<!-- Settings → Route optimisation -->
<div class="gs-grid">
    <label
        >Search width either side of the great circle
        <select bind:value={$optSettings.width}>
            <option value="narrow">narrow (8 % of the distance)</option>
            <option value="normal">normal (15 %)</option>
            <option value="wide">wide (25 %)</option>
        </select>
    </label>
    <label
        >Detail
        <select bind:value={$optSettings.detail}>
            <option value="fast">fast (stages every 220 nm)</option>
            <option value="normal">normal (150 nm)</option>
            <option value="fine">fine (100 nm, slower)</option>
        </select>
    </label>
    <label
        >Arrival may be late by up to (h)
        <input type="number" step="0.5" min="0" max="24" bind:value={$optSettings.etaTolH} />
    </label>
    <label
        >Red weather limits
        <select bind:value={$optSettings.limits}>
            <option value="hard">never enter</option>
            <option value="soft">avoid where worth it</option>
        </select>
    </label>
</div>
<label class="gs-check"><input type="checkbox" bind:checked={$optSettings.avoidImo} /> Steer clear of IMO roll / broaching warnings (counted as 20 t of fuel per hour)</label>
<label class="gs-check"
    ><input type="checkbox" bind:checked={$optSettings.avoidRoll} />
    <span>Keep out of places where the roll estimate is above your roll mark (Roll and pitch → Mark roll above{$vessel.rollLimitDeg ? `: ${$vessel.rollLimitDeg}°` : ': not set, so off'})</span></label
>
<p class="pp-note">"Never enter": if no track can keep out of the red limits and still arrive on time, the optimiser says so and shows the least exposed one.</p>

<script lang="ts">
    import { vessel } from '../../state';
    import { optSettings } from '../../windy/optimiseJob';
</script>
