<!-- Latitude or longitude as degrees, minutes and N/S (E/W): plain number boxes, no text to parse. -->
<span class="pi">
    <input class="deg" type="number" min="0" max={kind === 'lat' ? 90 : 180} step="1" bind:value={deg} on:change={emit} title="Degrees" />°
    <input class="min" type="number" min="0" max="59.999" step="0.1" bind:value={min} on:change={emit} title="Minutes (decimals allowed)" />'
    <select bind:value={hemi} on:change={emit}>
        {#each kind === 'lat' ? ['N', 'S'] : ['E', 'W'] as h}<option value={h}>{h}</option>{/each}
    </select>
</span>

<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let kind: 'lat' | 'lon';
    /** Decimal degrees (negative = S / W), or null */
    export let value: number | null;

    const dispatch = createEventDispatcher<{ change: number | null }>();
    let deg: number | null = null;
    let min: number | null = null;
    let hemi = kind === 'lat' ? 'N' : 'E';
    let last: number | null | undefined = undefined;

    // Load from the value when it changes from outside
    $: if (value !== last) {
        last = value;
        if (value == null) {
            deg = min = null;
        } else {
            const a = Math.abs(value);
            deg = Math.floor(a);
            min = Math.round((a - deg) * 60 * 1000) / 1000;
            if (min >= 60) {
                deg += 1;
                min = 0;
            }
            hemi = kind === 'lat' ? (value < 0 ? 'S' : 'N') : value < 0 ? 'W' : 'E';
        }
    }

    function emit() {
        if (deg == null || min == null || !isFinite(deg) || !isFinite(min)) {
            dispatch('change', null);
            return;
        }
        const v = (deg + min / 60) * (hemi === 'S' || hemi === 'W' ? -1 : 1);
        const max = kind === 'lat' ? 90 : 180;
        const ok = Math.abs(v) <= max && min < 60;
        last = ok ? v : null;
        dispatch('change', ok ? v : null);
    }
</script>

<style lang="less">
    .pi {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-family: monospace;
    }
    input.deg {
        width: 46px;
    }
    input.min {
        width: 62px;
    }
</style>
