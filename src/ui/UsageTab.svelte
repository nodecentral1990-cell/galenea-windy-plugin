<!-- Usage statistics with the heat map, and the activity log (owner, 2026-10-27). -->
<h4 class="h">Use of the plugin on this computer <span class="since">since {fmtDay($usage.since)}</span></h4>
<div class="cards">
    <div class="card"><b>{(($usage.usedMs) / 3600e3).toFixed(1)}</b><span>hours open</span></div>
    <div class="card"><b>{$usage.sessions}</b><span>times opened</span></div>
    <div class="card"><b>{Object.keys($usage.routes).length}</b><span>routes planned</span></div>
    <div class="card"><b>{Math.round($usage.plannedNm).toLocaleString('en')}</b><span>nm planned</span></div>
    <div class="card"><b>{$usage.voyages}</b><span>voyages run</span></div>
    <div class="card"><b>{Math.round($usage.sailedNm).toLocaleString('en')}</b><span>nm sailed (position updates)</span></div>
    <div class="card"><b>{sv.count}</b><span>optimisations ({sv.taken} taken)</span></div>
    <div class="card good"><b>{sv.fuelT.toFixed(1)} t</b><span>fuel saved</span></div>
    <div class="card good"><b>{fmtH(sv.hours)}</b><span>time saved</span></div>
</div>
<div class="pp-note g-hl"><Hint title="How the totals are counted"><p>Fuel and time saved add up the optimised routes you took, each against the route you had before (the plugin's own
    estimate from your speed / fuel table, not measured fuel). Hours count while the plugin is open.</p></Hint></div>

<div class="row">
    <button class="pp-btn" on:click={toggleHeat} disabled={!cellsN}>{heatOn ? 'Hide usage map' : '🗺 Show usage map'}</button>
    <span class="pp-note">{cellsN ? `${cellsN} one-degree squares` : 'Nothing yet: plan a route and get its forecast.'}</span>
</div>
{#if heatOn}<p class="pp-note"><span class="scale" /> pale = used once, dark purple = used most (routes planned, positions sailed).</p>{/if}

<h4 class="h">Activity log</h4>
<div class="pp-note g-hl">Records what the plugin does, to attach to a problem report. <Hint title="Activity log"><p>The plugin notes what it does and what you change (route, ship, limits, weather fetched, currents read, errors), with
    UTC times. Save it as a file and attach it to <b>🐞 Report a problem</b>: the developer can then see what actually
    happened. Kept only in this browser; nothing is sent by itself. {#if !$logEnabled}<b>Recording is off (⚙ Settings → Activity log and usage).</b>{/if}</p></Hint></div>
<div class="row">
    <button class="pp-btn" on:click={() => saveLog(hide)}>💾 Save activity log ({$logCount})</button>
    <button class="pp-btn pp-btn--ghost" on:click={clear} disabled={!$logCount}>Clear log</button>
</div>
<label class="check"><input type="checkbox" bind:checked={hide} /> Hide exact positions and names in the file (rounded to whole degrees)</label>
{#if recent.length}
    <div class="log pp-scroll">
        {#each recent as e}
            <div class="le"><span class="lt">{fmtTime(e.t)}</span> <span class="lk">{e.kind}</span> {e.msg}</div>
        {/each}
    </div>
{/if}

<div class="pp-note g-hl">Stays in this browser, never sent anywhere. <Hint title="Privacy"><p>Statistics stay in this browser on this computer and are never sent anywhere. Totals for a whole fleet or company would
    need a shared server, which the plugin does not have.</p></Hint> <button class="pp-btn small g-btn--danger" on:click={reset}>Reset statistics</button></div>

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import { onDestroy } from 'svelte';

    import { clearLog, logCount, logEnabled, logEntries } from '../lib/activityLog';
    import { resetUsage, savings, usage } from '../lib/usage';
    import { fmtTime } from '../lib/format';
    import { hideHeat, showHeat } from '../windy/heatLayer';
    import { saveLog } from './saveLog';

    let hide = false;
    let heatOn = false;

    $: sv = savings($usage);
    $: cellsN = Object.keys($usage.cells).length;
    // newest 30 entries, refreshed when the count changes
    $: recent = latest($logCount);
    const latest = (_n: number) => logEntries().slice(-30).reverse();
    $: if (heatOn) showHeat($usage.cells);

    function toggleHeat() {
        heatOn = !heatOn;
        if (!heatOn) hideHeat();
    }
    onDestroy(hideHeat);

    function clear() {
        if (confirm('Clear the activity log?')) clearLog();
    }
    function reset() {
        if (confirm('Reset the usage statistics on this computer (hours, routes, heat map, savings)?')) resetUsage();
    }

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fmtDay = (t: number) => {
        const d = new Date(t);
        return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    };
    const fmtH = (h: number) => `${h < 0 ? '−' : ''}${Math.floor(Math.abs(h) / 24)}d ${Math.round(Math.abs(h) % 24)}h`;
</script>

<style lang="less">
    .h {
        margin: 10px 0 4px;
    }
    .since {
        font-weight: normal;
        opacity: 0.6;
        font-size: 11px;
    }
    .cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 6px;
    }
    .card {
        background: rgba(255, 255, 255, 0.06);
        border-radius: 6px;
        padding: 6px 8px;
        display: flex;
        flex-direction: column;
        b {
            font-size: 16px;
        }
        span {
            font-size: 10px;
            opacity: 0.75;
        }
        &.good b {
            color: #7fe08a;
        }
    }
    .row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        margin: 6px 0;
    }
    .scale {
        display: inline-block;
        width: 60px;
        height: 9px;
        vertical-align: middle;
        background: linear-gradient(90deg, rgb(200, 190, 255), rgb(90, 20, 140));
        border-radius: 2px;
    }
    .log {
        max-height: 220px;
        font: 10px monospace;
        background: rgba(0, 0, 0, 0.25);
        padding: 4px 6px;
        border-radius: 4px;
    }
    .le {
        white-space: nowrap;
    }
    .lt {
        opacity: 0.6;
    }
    .lk {
        color: #9fd3ff;
    }
    .link {
        background: none;
        border: 0;
        color: #9fd3ff;
        text-decoration: underline;
        cursor: pointer;
        padding: 0;
        font-size: inherit;
    }
</style>
