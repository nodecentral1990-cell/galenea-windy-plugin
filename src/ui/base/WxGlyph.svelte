<!-- Weather pictures (owner, 2026-11-13, port weather): drawn here, no icon font or emoji. -->
<svg class="g-wx" width={size} height={size} viewBox="0 0 32 32" aria-label={title} role="img">
    {#if kind === 'clear'}
        <circle cx="16" cy="16" r="6.5" fill="#ffc83d" />
        {#each [0, 45, 90, 135, 180, 225, 270, 315] as a}<line x1="16" y1="3" x2="16" y2="6.5" stroke="#ffc83d" stroke-width="2.2" stroke-linecap="round" transform="rotate({a} 16 16)" />{/each}
    {:else}
        {#if kind === 'fewclouds' || kind === 'partly' || kind === 'showers'}
            <circle cx="12" cy="11" r="5.5" fill="#ffc83d" />
            {#each [0, 60, 120, 180, 240, 300] as a}<line x1="12" y1="2" x2="12" y2="4.3" stroke="#ffc83d" stroke-width="1.8" stroke-linecap="round" transform="rotate({a} 12 11)" />{/each}
        {/if}
        <path
            d="M9 24h14.5a5 5 0 0 0 .6-10 7 7 0 0 0-13.4 1.3A4.4 4.4 0 0 0 9 24Z"
                fill={kind === 'cloudy' || kind === 'rain' || kind === 'thunder' || kind === 'snow' || kind === 'sleet' || kind === 'fog' ? '#b9c3cf' : '#e9eef4'}
                transform={kind === 'fewclouds' ? 'translate(5 4) scale(.75)' : ''}
            />
        {#if kind === 'rain' || kind === 'showers' || kind === 'sleet' || kind === 'thunder'}
            {#each [11, 16, 21] as x}<line x1={x} y1="26" x2={x - 1.5} y2="30" stroke="#4aa3ff" stroke-width="1.8" stroke-linecap="round" />{/each}
        {/if}
        {#if kind === 'snow' || kind === 'sleet'}
            {#each [kind === 'sleet' ? 23 : 11, 16, 21] as x}<circle cx={x} cy="28" r="1.4" fill="#fff" />{/each}
        {/if}
        {#if kind === 'thunder'}
            <path d="M17 19l-3.5 6h3l-1.5 5 5-7h-3l2-4Z" fill="#ffd400" />
        {/if}
        {#if kind === 'fog'}
            {#each [26, 29] as y}<line x1="7" y1={y} x2="25" y2={y} stroke="#cfd6de" stroke-width="1.8" stroke-linecap="round" />{/each}
        {/if}
    {/if}
</svg>

<script lang="ts">
    import type { WxKind } from '../../lib/placeWx';
    export let kind: WxKind = 'partly';
    export let size = 22;
    export let title = '';
</script>

<style>
    .g-wx {
        display: inline-block;
        vertical-align: middle;
        flex: none;
    }
</style>
