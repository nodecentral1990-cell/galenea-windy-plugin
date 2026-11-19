<!-- Settings → Safe speed and course plan -->
<div class="pp-note g-hl">
    What the plan keeps the ship out of.
    <Hint title="Safe speed and course plan"
        ><p>
            What the <b>safe speed and course plan</b> (Optimise → Speed &amp; course) keeps the ship out of, using your weather limits: by changing the speed (slow down, speed up, or stop and drift until the weather
            has passed) and, if allowed, by altering course for a while and coming back to the track.
        </p></Hint
    >
</div>
<div class="gs-toggles gs-toggles--col">
    {#each AVOID_KINDS as k}
        <label class="gs-switch switch"><input type="checkbox" bind:checked={$spSettings.avoid[k]} /><span class="gs-knob" />{AVOID_LABEL[k]}</label>
    {/each}
</div>
<div class="gs-grid">
    <label
        >Keep out of
        <select bind:value={$spSettings.level}>
            <option value={2}>red limits only</option>
            <option value={1}>amber alerts too</option>
        </select>
    </label>
    <label
        >Change speed at most every
        <select bind:value={$spSettings.stepH}>
            <option value={1}>1 hour</option>
            <option value={3}>3 hours</option>
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
        </select>
    </label>
    <label
        >Stop, or leave the track, only at least (nm from land)
        <input type="number" min="5" step="5" bind:value={$spSettings.minLandNm} />
    </label>
    <label
        >Largest course alteration
        <select bind:value={$spSettings.maxAlterDeg} disabled={!$spSettings.allowAlter}>
            <option value={30}>30° (tries 15°, 30°)</option>
            <option value={60}>60° (tries 20°, 40°, 60°)</option>
            <option value={90}>90° (tries 30°, 60°, 90°)</option>
        </select>
    </label>
    <label
        >Furthest off the track (nm)
        <input type="number" min="10" max="200" step="10" bind:value={$spSettings.maxOffNm} disabled={!$spSettings.allowAlter} />
    </label>
    <label
        >Fuel when stopped, t/day (empty = not counted)
        <input type="number" min="0" step="0.5" value={$spSettings.stopFuel ?? ''} on:change={e => ($spSettings.stopFuel = numOrNull(e))} />
    </label>
</div>
<label class="gs-switch switch"><input type="checkbox" bind:checked={$spSettings.allowStop} /><span class="gs-knob" />Allow stopping and drifting (open water only)</label>
<label class="gs-switch switch"><input type="checkbox" bind:checked={$spSettings.allowAlter} /><span class="gs-knob" />Allow altering course for a while (then back to the track)</label>
<div class="pp-note g-hl">
    <span class="pp-err">Land distance is from a coarse world map: no depths, traffic or shelter.</span>
    <Hint title="Speeds and stops"
        ><p>
            Speeds come from your RPM / speed / fuel table (fastest = top of the table) and never from a barred RPM range (Speed, RPM and fuel). Land distance is from a coarse world map: no depths, traffic or shelter
            information. Roll / pitch marks: Roll and pitch estimate.
        </p></Hint
    >
</div>

<script lang="ts">
    import Hint from '../base/Hint.svelte';
    import { AVOID_LABEL, spSettings, type AvoidKind } from '../../windy/speedPlanJob';

    const AVOID_KINDS = Object.keys(AVOID_LABEL) as AvoidKind[];
    const numOrNull = (e: Event) => {
        const v = (e.target as HTMLInputElement).value.trim();
        const n = Number(v);
        return v === '' || !isFinite(n) ? null : n;
    };
</script>
