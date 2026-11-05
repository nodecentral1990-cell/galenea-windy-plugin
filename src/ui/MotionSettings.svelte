<!-- Settings → Roll and pitch estimate: bilge keels (one or more sections), KG, hull damping, marks. -->
<div class="pp-note g-hl">Used for the roll and pitch estimate. {#if missing}<b class="pp-err">{missing}.</b>{/if} <Hint title="Roll and pitch estimate"><p>Used for the <b>roll and pitch estimate</b> along the route (weather table, ship window, Polar tab, optimiser). Also needs
    LBP, breadth, drafts and GM (Ship particulars). {#if missing}<b>{missing}.</b>{/if}</p></Hint></div>

<div class="rp-box">
    <h5>Roll period: the most important number for the roll estimate</h5>
    <div class="rp-now">
        In use: <b>{roll.value ? `${roll.value.toFixed(1)} s` : 'none'}</b>
        {#if roll.value && !roll.estimated}(measured{$vessel.rollPeriodDate ? `, entered ${fmtTime($vessel.rollPeriodDate)} UTC` : ''}){:else if roll.value}(<span class="pp-err">estimated from GM: enter a measured one</span>){/if}
        {#if calOn}· fine-tuning uses {(roll.value ?? 0) * ($vessel.rollCalib?.periodFactor ?? 1) > 0 ? `${((roll.value ?? 0) * ($vessel.rollCalib?.periodFactor ?? 1)).toFixed(1)} s` : ''}{/if}
    </div>
    <label class="rp-in"
        >Measured roll period (s) <input type="number" step="0.1" min="3" max="60" value={$vessel.rollPeriod ?? ''} on:change={setRollPeriod} /></label
    >
    <div class="pp-note g-hl">A 2 s error changes the roll by about a third. <Hint title="How to measure the roll period"><p>A 2 s error in the roll period changes the estimated roll by about a third. <b>How to measure:</b> in calm water, with
        the present loading, time <b>10 full rolls</b> (port → starboard → port is one) and divide by 10. Do it again after
        a big change in loading (GM). Same as IMO MSC.1/Circ.1228 para 2.3.</p></Hint></div>
    <div class="sw">
        <b>Stopwatch:</b>
        {#if !swStart}
            <button class="pp-btn small" on:click={swGo}>Start (at the end of a roll)</button>
        {:else}
            <button class="pp-btn small" on:click={swRoll}>+1 full roll ({swRolls})</button>
            <button class="pp-btn pp-btn--ghost small" on:click={swStop}>Stop</button>
            <span class="mono">{(swElapsed / 1000).toFixed(1)} s</span>
        {/if}
        {#if swResult}
            <span>{swResult.rolls} rolls in {swResult.s.toFixed(1)} s = <b>{(swResult.s / swResult.rolls).toFixed(1)} s</b></span>
            <button class="pp-btn small" on:click={swUse}>Use {(swResult.s / swResult.rolls).toFixed(1)} s</button>
        {/if}
    </div>
    <label class="rp-in"
        >Forecast wave periods are read as
        <select value={$vessel.wavePeriodKind ?? 'tm-1'} on:change={setKind}>
            <option value="tm-1">mean period (ECMWF energy period: the plugin's default)</option>
            <option value="tm01">mean period (Tm01)</option>
            <option value="tp">peak period</option>
        </select></label
    >
    <p class="pp-note">Windy does not say which wave period it gives; ECMWF's are mean periods, hence the default. Change only if you know better.</p>
</div>

<h5>Bilge keels (one side; the other side is taken as the same)</h5>
<p class="pp-note">One row per section: a keel in 3 parts = 3 rows. Breadth = how far the plate stands out from the hull.</p>
<table class="bk">
    <thead><tr><th><input type="checkbox" checked={keels.length > 0 && sel.size === keels.length} on:change={allSel} title="Select all" /></th><th>Section</th><th>Length (m)</th><th>Breadth (m)</th></tr></thead>
    <tbody>
        {#each keels as k, i}
            <tr class:on={sel.has(i)} on:click={e => rowClick(i, e)}>
                <td><input type="checkbox" checked={sel.has(i)} on:click|stopPropagation={() => toggle(i)} /></td>
                <td>{i + 1}</td>
                <td><input type="number" step="0.5" min="0" value={k.lengthM} on:click|stopPropagation on:change={e => setKeel(i, 'lengthM', e)} /></td>
                <td><input type="number" step="0.05" min="0" value={k.breadthM} on:click|stopPropagation on:change={e => setKeel(i, 'breadthM', e)} /></td>
            </tr>
        {/each}
        {#if !keels.length}<tr><td colspan="4" class="pp-note">No bilge keels entered (roll worked out without them).</td></tr>{/if}
    </tbody>
</table>
<div class="row">
    <button class="pp-btn small" on:click={add}>+ Add section</button>
    <button class="pp-btn pp-btn--ghost small" disabled={!sel.size} on:click={del}>Delete selected ({sel.size})</button>
    {#if keels.length}<span class="pp-note">Total {totalLen.toFixed(1)} m per side. Tick boxes or Ctrl/⌘-click rows to select several.</span>{/if}
</div>

<div class="grid">
    <label title="Height of the centre of gravity above the keel, from the loading computer. Empty = estimated from breadth, draft and GM"
        >KG (m) <input type="number" step="0.01" value={$vessel.kg ?? ''} placeholder="auto" on:change={e => setNum('kg', e)} /></label>
    <label title="Roll damping of the hull without bilge keels and at rest, % of critical. Empty = 2 % (typical assumption). Later this can be tuned from rolls you observe"
        >Hull roll damping (% of critical) <input type="number" step="0.1" value={$vessel.hullRollDampingPct ?? ''} placeholder="2" on:change={e => setNum('hullRollDampingPct', e)} /></label>
    <label title="The weather table marks the roll estimate (significant) above this. Empty = no mark"
        >Mark roll above (°) <input type="number" step="1" value={$vessel.rollLimitDeg ?? ''} placeholder="none" on:change={e => setNum('rollLimitDeg', e)} /></label>
    <label title="The weather table marks the pitch estimate (significant) above this. Empty = no mark"
        >Mark pitch above (°) <input type="number" step="0.5" value={$vessel.pitchLimitDeg ?? ''} placeholder="none" on:change={e => setNum('pitchLimitDeg', e)} /></label>
</div>
<div class="pp-note g-hl"><span class="g-status g-status--warn" style="display:inline">Parametric roll is not predicted: watch the IMO warnings.</span> <Hint title="How the estimate works"><p><b>How it works:</b> each wave system (wind sea, swell 1, swell 2) is turned into a wave spectrum and passed through a
    simple model of how your ship rolls and pitches (natural roll period, damping from the hull, speed and bilge keels;
    pitch from a published closed-form method). Shown as <b>significant</b> roll / pitch (to one side) and the
    <b>likely largest in 3 hours</b>. An <b>estimate</b>: expect roughly ±30–50 % for roll (more near resonance) and ±25 %
    for pitch; trust the trend along the route more than the exact degree. <b>Pitch for waves shorter than about 1.2 ship lengths is probably too low</b> (a limit of the simple method). <b>Parametric roll is not predicted</b>: watch
    the IMO warnings for it. See the Info tab.</p></Hint></div>

<h5>Roll chart on the map (Weather tab → Roll lines for this view)</h5>
<div class="grid">
    <label
        >The lines show
        <select bind:value={$rollChartSettings.value}>
            <option value="sig">significant roll (as in the weather table)</option>
            <option value="max">likely biggest roll in 3 hours</option>
        </select></label
    >
    <label
        >Heading assumed
        <select bind:value={$rollChartSettings.heading}>
            <option value="route">planned course of the nearest leg</option>
            <option value="worst">worst heading (the most roll at any course)</option>
            <option value="fixed">a course I choose</option>
        </select></label
    >
    {#if $rollChartSettings.heading === 'fixed'}
        <label>Course (°T) <input type="number" min="0" max="359" step="5" bind:value={$rollChartSettings.fixedHeading} /></label>
    {/if}
</div>
<label class="rc-check"><input type="checkbox" bind:checked={$rollChartSettings.filled} /> Fill the bands between the lines (light → dark red)</label>
<label class="rc-check"
    ><input type="checkbox" bind:checked={$rollChartSettings.blank} /> Only the roll on the map: Windy's colours, particles and pressure lines off while the roll chart is
    shown (put back when you hide it or close the plugin)</label
>
<div class="pp-note g-hl">Lines of equal roll on the map (Weather → On the map). <Hint title="Roll chart"><p>Lines of equal roll at 2°, 4°, 6°, 8°, 10°, 12° and 15°, light red to dark red; your <b>Mark roll above</b> value (above)
    is drawn as a thick dashed line. Roll depends on heading and speed. <b>Planned course</b>: "what would I roll here on my
    plan". <b>Worst heading</b>: the most roll at any course (pale = small roll whatever you do; slower to work out, about
    12 times the work). <b>A course I choose</b>: "what if I steer 045° through this". Speed: the planned speed of the
    nearest leg. It follows Windy's time slider.</p></Hint></div>

<RollObsSettings />

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import { onDestroy } from 'svelte';
    import { calibState, motionMissing } from '../lib/motionEstimate';
    import { fmtTime } from '../lib/format';
    import { rollPeriodFor } from '../lib/weather';
    import { logEvent } from '../lib/activityLog';
    import RollObsSettings from './RollObsSettings.svelte';
    import { rollChartSettings } from '../windy/rollChart';
    import type { Vessel } from '../lib/model';
    import { vessel } from '../state';

    $: keels = $vessel.bilgeKeels ?? [];
    $: totalLen = keels.reduce((s, k) => s + (k.lengthM || 0), 0);
    $: missing = motionMissing($vessel);
    $: roll = rollPeriodFor($vessel);
    $: calOn = calibState($vessel).applied;

    function setRollPeriod(e: Event) {
        const n = Number((e.target as HTMLInputElement).value);
        const ok = (e.target as HTMLInputElement).value.trim() !== '' && isFinite(n) && n > 0;
        vessel.update(v => ({ ...v, rollPeriod: ok ? n : null, rollPeriodDate: ok ? Date.now() : null }));
    }
    function setKind(e: Event) {
        const k = (e.target as HTMLSelectElement).value as 'tm-1' | 'tm01' | 'tp';
        vessel.update(v => ({ ...v, wavePeriodKind: k }));
    }
    // stopwatch for the roll period
    let swStart = 0;
    let swRolls = 0;
    let swElapsed = 0;
    let swResult: { rolls: number; s: number } | null = null;
    let swTimer: ReturnType<typeof setInterval> | null = null;
    function swGo() {
        swStart = Date.now();
        swRolls = 0;
        swElapsed = 0;
        swResult = null;
        swTimer = setInterval(() => (swElapsed = Date.now() - swStart), 100);
    }
    function swRoll() {
        swRolls += 1;
        swElapsed = Date.now() - swStart;
    }
    function swStop() {
        if (swTimer) clearInterval(swTimer);
        swTimer = null;
        if (swRolls > 0) swResult = { rolls: swRolls, s: swElapsed / 1000 };
        swStart = 0;
    }
    function swUse() {
        if (!swResult) return;
        const p = Math.round((swResult.s / swResult.rolls) * 10) / 10;
        vessel.update(v => ({ ...v, rollPeriod: p, rollPeriodDate: Date.now() }));
        logEvent('ship', `Roll period measured with the stopwatch: ${p} s (${swResult.rolls} rolls)`);
        swResult = null;
    }
    onDestroy(() => swTimer && clearInterval(swTimer));
    let sel = new Set<number>();

    function setKeels(list: { lengthM: number; breadthM: number }[]) {
        vessel.update(v => ({ ...v, bilgeKeels: list }));
    }
    function add() {
        const last = keels[keels.length - 1];
        setKeels([...keels, { lengthM: last?.lengthM ?? 30, breadthM: last?.breadthM ?? 0.4 }]);
    }
    function del() {
        setKeels(keels.filter((_, i) => !sel.has(i)));
        sel = new Set();
    }
    function toggle(i: number) {
        sel = new Set(sel.has(i) ? [...sel].filter(x => x !== i) : [...sel, i]);
    }
    function rowClick(i: number, e: MouseEvent) {
        if (e.ctrlKey || e.metaKey) toggle(i);
        else sel = new Set([i]);
    }
    function allSel() {
        sel = sel.size === keels.length ? new Set() : new Set(keels.map((_, i) => i));
    }
    function setKeel(i: number, k: 'lengthM' | 'breadthM', e: Event) {
        const n = Number((e.target as HTMLInputElement).value);
        setKeels(keels.map((x, j) => (j === i ? { ...x, [k]: isFinite(n) && n >= 0 ? n : 0 } : x)));
    }
    function setNum(k: keyof Vessel, e: Event) {
        const s = (e.target as HTMLInputElement).value.trim();
        const n = s === '' ? null : Number(s);
        vessel.update(v => ({ ...v, [k]: n != null && isFinite(n) && n > 0 ? n : null }));
    }
</script>

<style lang="less">
    h5 {
        margin: 8px 0 2px;
    }
    .rc-check {
        display: flex;
        gap: 6px;
        align-items: flex-start;
        font-size: 11px;
        margin: 4px 0;
    }
    .rp-box {
        border: 1px solid rgba(255, 210, 120, 0.5);
        background: rgba(255, 210, 120, 0.07);
        border-radius: 6px;
        padding: 4px 8px 6px;
        margin-bottom: 8px;
    }
    .rp-now {
        margin: 2px 0 4px;
    }
    .rp-in {
        display: flex;
        flex-direction: column;
        font-size: 11px;
        margin: 4px 0;
        max-width: 360px;
    }
    .sw {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
        margin: 4px 0;
    }
    .mono {
        font-family: monospace;
    }
    .bk {
        border-collapse: collapse;
        font-size: 11px;
        th,
        td {
            padding: 2px 6px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            text-align: left;
        }
        input[type='number'] {
            width: 70px;
        }
        tr.on td {
            background: rgba(80, 160, 255, 0.2);
        }
    }
    .row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        margin: 6px 0;
    }
    .small {
        padding: 1px 6px;
        font-size: 11px;
    }
</style>
