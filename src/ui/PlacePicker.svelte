<!-- A place for the Distances table: a port by name or UN/LOCODE, or the start / end of the route (2026-11-02). -->
<label class="pk">
    <span class="pk__l">{label}</span>
    <input
        type="text"
        bind:value={q}
        placeholder="Port name or code"
        autocomplete="off"
        on:input={() => ((open = true), (place = null))}
        on:focus={() => (open = true)}
        on:blur={() => setTimeout(() => (open = false), 150)}
        on:keydown={key}
        aria-label={`${label}: port`}
    />
    {#if open && (list.length || routeEnds)}
        <div class="pk__list" role="listbox">
            {#if routeEnds && !q.trim()}
                <button type="button" class="pk__opt" on:mousedown|preventDefault={() => pickWp(routeEnds.first, 'Route start')}>Route start ({routeEnds.first.name || 'WP1'})</button>
                <button type="button" class="pk__opt" on:mousedown|preventDefault={() => pickWp(routeEnds.last, 'Route end')}>Route end ({routeEnds.last.name || 'last WP'})</button>
            {/if}
            {#each list as p, i}
                <button type="button" class="pk__opt" class:is-on={i === hi} on:mousedown|preventDefault={() => pick(p)}>{p.name} <small>{p.code}</small></button>
            {/each}
        </div>
    {/if}
</label>

<script context="module" lang="ts">
    export interface Place {
        name: string;
        lat: number;
        lon: number;
    }
</script>

<script lang="ts">
    import { findPorts, type Port } from '../lib/seaNet';

    export let label: string;
    export let place: Place | null = null;
    export let routeEnds: { first: { lat: number; lon: number; name: string }; last: { lat: number; lon: number; name: string } } | null = null;

    let q = place?.name ?? '';
    let open = false;
    let hi = 0;
    $: list = q.trim().length >= 2 && !place ? findPorts(q, 8) : [];
    $: if (place && q !== place.name) q = place.name;

    function pick(p: Port) {
        place = { name: p.name, lat: p.lat, lon: p.lon };
        q = p.name;
        open = false;
    }
    function pickWp(w: { lat: number; lon: number; name: string }, fallback: string) {
        place = { name: w.name || fallback, lat: w.lat, lon: w.lon };
        q = place.name;
        open = false;
    }
    function key(e: KeyboardEvent) {
        if (e.key === 'ArrowDown') hi = Math.min(list.length - 1, hi + 1);
        else if (e.key === 'ArrowUp') hi = Math.max(0, hi - 1);
        else if (e.key === 'Enter' && list[hi]) pick(list[hi]);
        else return;
        e.preventDefault();
    }
</script>

<style lang="less">
    .pk {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
        input {
            width: 100%;
        }
    }
    .pk__l {
        font-size: 12px;
        color: var(--g-text-2);
    }
    .pk__list {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        z-index: 20;
        margin-top: 2px;
        max-height: 240px;
        overflow: auto;
        background: var(--g-bg-1);
        border-radius: 8px;
        box-shadow: var(--g-shadow);
        padding: 4px;
    }
    .pk__opt {
        display: block;
        width: 100%;
        text-align: left;
        border: 0;
        background: transparent;
        color: var(--g-text-1);
        padding: 6px 8px;
        border-radius: 6px;
        cursor: pointer;
        font: 13px var(--g-font);
        small {
            color: var(--g-text-3);
            margin-left: 4px;
        }
        &:hover,
        &.is-on {
            background: var(--g-bg-3);
        }
    }
</style>
