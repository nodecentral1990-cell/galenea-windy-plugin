<!-- The voyage on this route: start it, type in the present position (UTC) and
     the plan restarts from there with the speed needed for the next fixed time / ETA. -->
<div class="g-card">
<div class="g-card__head">
    <span class="g-card__title">Voyage</span>
    <Hint title="Voyage">
        <p>Starts the voyage on the route: the part already sailed (by the plan, compared with the present time in UTC) turns to the "sailed part" colour.</p>
        <p>Then type in your <b>present position</b> and time: the future track runs from that position to the next waypoint, with the speed needed for the next fixed time / ETA.</p>
    </Hint>
</div>
{#if !$route.voyage}
    <button class="pp-btn" disabled={$route.waypoints.length < 2 || $route.etd == null} on:click={start} title={$route.etd == null ? 'Set the ETD first' : ''}><Icon name="play" size={14} /> Start voyage on this route</button>
{:else}
    <div class="active">
        <b>Voyage running</b> since {fmtTime($route.voyage.startedAt)} UTC.
        {#if $plan.fix}
            Sailed {$plan.fix.alongNm.toFixed(1)} nm up to your position of {fmtTime($plan.fix.t)} UTC
            ({$plan.fix.offNm.toFixed(1)} nm off the track). Distance to go <b>{($plan.totalNm - $plan.fix.alongNm).toFixed(1)} nm</b>.
        {:else}
            The sailed part is where the plan puts the ship now.
        {/if}
    </div>
    {#if !entering}
        <button class="pp-btn g-btn--primary" on:click={openEntry}><Icon name="crosshair" size={15} /> Input current position</button>
    {:else}
        <div class="fixform">
            <b>Current position (UTC)</b>
            <div class="col">Lat <PositionInput kind="lat" value={lat} on:change={e => (lat = e.detail)} /></div>
            <div class="col">Lon <PositionInput kind="lon" value={lon} on:change={e => (lon = e.detail)} /></div>
            <div class="col">Time (UTC, 24 h) <DateTimeField value={fixT} clearable={false} on:change={e => (fixT = e.detail)} /></div>
            <p class="pp-note">Filled in with the planned position for now: overwrite it with your actual position and time.</p>
            <div class="row">
                <button class="pp-btn" on:click={applyFix}>Update position</button>
                <button class="pp-btn pp-btn--ghost" on:click={() => (entering = false)}>Cancel</button>
            </div>
            {#if err}<div class="pp-err">{err}</div>{/if}
        </div>
    {/if}
    {#if $route.voyage.fix}<button class="pp-btn pp-btn--ghost small" on:click={clearFix}>Clear position</button>{/if}
    {#if $plan.fix}
        {@const leg = $plan.legs[$plan.fix.legIdx]}
        <div class="result">
            {#if leg?.targetSog != null}
                To keep {nextFixedLabel()}: <b>{leg.targetSog.toFixed(2)} kn over ground</b> from your position
                (speed in calm water {($sim.legs[$plan.fix.legIdx]?.sicw ?? leg.calmSpeed).toFixed(1)} kn{$sim.legs[$plan.fix.legIdx]?.rpm != null ? `, about ${$sim.legs[$plan.fix.legIdx].rpm?.toFixed(0)} rpm` : ''}).
            {:else}
                At your planned speeds: ETA <b>{fmtTime($plan.eta)} UTC</b>. Fix an ETA in the table (📌) or set "ETD + ETA" to get the speed needed.
            {/if}
            ETA {fmtTime($plan.eta)} UTC.
        </div>
    {/if}
    <button class="pp-btn pp-btn--ghost" on:click={end}>■ End voyage</button>
{/if}
</div>

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import { get } from 'svelte/store';

    import { fmtTime } from '../lib/format';
    import { positionAt } from '../lib/model';
    import { plan, route, sim, updateRoute } from '../state';
    import { refreshWeather } from '../windy/weatherJobs';
    import DateTimeField from './DateTimeField.svelte';
    import PositionInput from './PositionInput.svelte';

    let entering = false;
    let lat: number | null = null;
    let lon: number | null = null;
    let fixT: number | null = null;
    let err = '';

    function start() {
        updateRoute(r => (r.voyage = { startedAt: Date.now(), fix: null }));
    }
    function end() {
        if (!confirm('End the voyage? The position you entered is cleared; the route stays.')) return;
        updateRoute(r => (r.voyage = null));
        entering = false;
    }
    /** Open the entry, filled in with the planned position for the present time (to overwrite). */
    function openEntry() {
        err = '';
        const now = Math.floor(Date.now() / 60e3) * 60e3;
        const p = positionAt(get(route), get(plan), now);
        lat = p ? Math.round(p.lat * 60000) / 60000 : null;
        lon = p ? Math.round(p.lon * 60000) / 60000 : null;
        fixT = now;
        entering = true;
    }
    async function applyFix() {
        err = '';
        if (lat == null || lon == null) {
            err = 'Enter the latitude and longitude (degrees, minutes, N/S, E/W).';
            return;
        }
        if (fixT == null) {
            err = 'Set the time (UTC).';
            return;
        }
        const fix = { lat, lon, t: fixT };
        updateRoute(r => (r.voyage = { startedAt: r.voyage?.startedAt ?? Date.now(), fix }));
        entering = false;
        // Re-check the weather (latest forecast, currents, visibility) for the new timing
        await refreshWeather({ fresh: true, title: 'Position updated: re-checking the weather and the speed needed' });
    }
    function clearFix() {
        updateRoute(r => r.voyage && (r.voyage = { ...r.voyage, fix: null }));
    }
    function nextFixedLabel(): string {
        const r = $route;
        const p = $plan;
        if (!p.fix) return '';
        for (let i = p.legs[p.fix.legIdx].index; i < r.waypoints.length; i++) {
            if (i === r.waypoints.length - 1 && r.mode === 'eta' && r.eta != null) return `the ETA ${fmtTime(r.eta)} UTC at WP${i + 1}`;
            if (r.waypoints[i].fixedEta != null) return `the fixed time ${fmtTime(r.waypoints[i].fixedEta ?? null)} UTC at WP${i + 1}`;
        }
        return 'the fixed time';
    }
</script>

<style lang="less">
    .row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 10px;
        align-items: flex-end;
        margin: 4px 0;
    }
    .col {
        display: flex;
        flex-direction: column;
        font-size: 11px;
    }
    .small {
        font-size: 11px;
        padding: 1px 6px;
        margin-left: 6px;
    }
    .active,
    .result {
        background: rgba(63, 169, 255, 0.12);
        border-left: 3px solid #3fa9ff;
        padding: 4px 6px;
        border-radius: 3px;
        margin: 6px 0;
        font-size: 11px;
    }
    .fixform {
        margin: 6px 0;
        max-width: 300px;
    }
</style>
