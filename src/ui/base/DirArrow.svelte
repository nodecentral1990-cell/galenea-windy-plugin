<!-- A small arrow showing a direction (owner, 2026-11-13, port weather). `toward` = the bearing the arrow points to
     (° true, 0 = up). Wind and waves: pass where they come FROM with `from` (the arrow then points the way they go,
     as on Windy's own forecast); current: pass where it sets with `toward`. -->
{#if deg != null}
    <svg class="g-dir" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate({deg}deg)"
        ><path d="M12 3 L17.5 12.5 L13.4 11.4 L13.4 21 L10.6 21 L10.6 11.4 L6.5 12.5 Z" fill={color} /></svg
    >
{/if}

<script lang="ts">
    export let from: number | null | undefined = undefined;
    export let toward: number | null | undefined = undefined;
    export let size = 14;
    export let color = 'currentColor';
    $: deg = toward != null && isFinite(toward) ? toward % 360 : from != null && isFinite(from) ? (from + 180) % 360 : null;
</script>

<style>
    .g-dir {
        display: inline-block;
        vertical-align: -2px;
        flex: none;
    }
</style>
