<!-- Settings → Polar diagram: which IMO warnings are coloured (ship window and Motion). -->
<p class="pp-note">Which IMO warnings are coloured in the polar diagram (ship window and Motion). Everything is still worked out and listed.</p>
<div class="gs-toggles">
    {#each POLAR_KINDS as [k, label]}
        <label class="gs-switch switch"><input type="checkbox" bind:checked={$polarShow[k]} /><span class="gs-knob" /><i class="gs-zsw" style="background:{ZONE_COLORS[k]}" />{label}</label>
    {/each}
</div>
<label class="gs-switch switch gs-pale"><input type="checkbox" bind:checked={$polarPale} /><span class="gs-knob" />Also show pale zones where the warning would apply if the waves were higher</label>
<p class="pp-note">The wave heights at which each warning starts are in Weather limits (IMO warning heights).</p>

<script lang="ts">
    import { polarPale, polarShow } from '../../state';
    import { ZONE_COLORS } from '../../lib/dangerZones';

    const POLAR_KINDS = [
        ['parametric', 'Parametric rolling'],
        ['synchronous', 'Synchronous rolling'],
        ['highWaves', 'Successive high waves'],
        ['surf', 'Surf-riding / broaching'],
    ] as const;
</script>

<style lang="less">
    .gs-zsw {
        display: inline-block;
        width: 12px;
        height: 10px;
        border: 1px solid #000;
    }
    .gs-pale {
        margin-top: 8px;
    }
</style>
