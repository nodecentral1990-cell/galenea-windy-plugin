<div class="g-card">
<div class="g-card__head">
    <span class="g-card__title">Ship motion at the map time</span>
    <Hint title="Reading the polar diagram" width={360}>
        <p>Sectors are worked out from <b>Sea, Swell 1 and Swell 2</b> (the SWH flag is for reference). Coloured = a heading / speed where an IMO MSC.1/Circ.1228 check warns: red parametric, purple synchronous, green high waves, indigo broaching; stripes where two apply. Darker middle = closer to the exact condition. Advisory only.</p>
        <p>Flags show where the waves come <b>from</b>, with height and period; the barb points into the wind. The yellow arrow = your heading and speed (its tip on the speed ring).</p>
        <p>Change the heading or speed below to see how the sectors and warnings change. The same diagram is in the ship window on the map.</p>
    </Hint>
    <div class="g-card__actions"><button class="pp-btn pp-btn--ghost small" on:click={openPolarSettings} title="Polar diagram settings: which warnings are shown"><Icon name="sliders" size={14} /> Polar settings</button></div>
</div>
<div class="g-seg mode" role="radiogroup" aria-label="Motion views">
    <button role="radio" class="g-seg__opt" class:is-on={mode === 'plan'} aria-checked={mode === 'plan'} on:click={() => setMode('plan')}><Icon name="clock" size={15} />At the map time</button>
    <button role="radio" class="g-seg__opt" class:is-on={mode === 'live'} aria-checked={mode === 'live'} on:click={() => setMode('live')}><Icon name="crosshair" size={15} />Live (GPS)</button>
</div>
{#if mode === 'live'}
    <LivePolar />
{:else}
<!-- time buttons (phones cannot see Windy's time slider while the plugin is open; handy on a computer too) -->
<div class="mt">
    <button class="pp-btn small" on:click={() => stepTime(-3)} title="3 hours earlier">◀ 3 h</button>
    <span class="mt__t mono">{fmtTime($timelineTs)} UTC</span>
    <button class="pp-btn small" on:click={() => stepTime(3)} title="3 hours later">3 h ▶</button>
    <button class="pp-btn pp-btn--ghost small" on:click={() => setTime(Date.now())} title="The present time">Now</button>
    {#if $plan.etd != null}<button class="pp-btn pp-btn--ghost small" on:click={() => setTime($plan.etd ?? Date.now())} title="The ETD at the first waypoint">ETD</button>{/if}
</div>
{#if !pos}
    <div class="g-empty"><Icon name="motion" size={30} /><p>Pick a time inside the voyage (between ETD and ETA) with the buttons above or Windy's time slider, to see the ship's planned position and the weather there. {#if !$wxSeries.length}Get the forecast in the Weather section first.{/if}</p></div>
{:else}
    <div class="head">
        <b>{fmtTime($timelineTs)} UTC</b> · {fmtPos(pos.lat, pos.lon)}
    </div>
    <div class="grid">
        <label>Heading (°T) <input type="number" min="0" max="359" bind:value={heading} /></label>
        <label>Speed (kn) <input type="number" min="0" step="0.5" bind:value={speed} /></label>
        <button class="pp-btn pp-btn--ghost" on:click={resetWhatIf}>Back to plan ({pos.course.toFixed(0)}°, {planSpeed.toFixed(1)} kn)</button>
    </div>
    {#if wx}
        <RiskPolar {wx} {heading} {speed} lbp={$vessel.lbp} rollPeriod={roll.value} settings={$thresholds.resonance} size={490} style={$shipStyle} current={wx.currentKn != null && wx.currentSet != null ? { kn: wx.currentKn, set: wx.currentSet } : null} colors={$flagColors} />
        <h4>At this heading and speed <span class="g-chip">advisory</span></h4>
        {#if hits.length || limits.length}
            {#each hits as h}<div><span class="chip {h.phenomenon}">{PHENOMENON_LABEL[h.phenomenon]}</span> {h.detail}</div>{/each}
            {#each limits as l}<div class="lv{l.level}">{l.level === 2 ? 'LIMIT' : 'Alert'}: {l.detail}</div>{/each}
        {:else}
            <div class="g-status g-status--ok"><Icon name="check" size={14} /> No warnings from the checks. That does not mean it is safe.</div>
        {/if}
        <div class="motion">
            {#if motion}
                <b>Roll / pitch estimate:</b> roll {motion.roll.toFixed(1)}° (likely largest in 3 h {motion.rollMax.toFixed(0)}°), pitch {motion.pitch.toFixed(1)}° (largest {motion.pitchMax.toFixed(1)}°).
                <span class="pp-note">Estimate · damping {motion.full.damping.totalPct.toFixed(1)} %{motion.full.damping.bilgeKeelPct > 0 ? ` (bilge keels ${motion.full.damping.bilgeKeelPct.toFixed(1)} %)` : ', no bilge keels entered'} · parametric roll not predicted</span>
                <Hint title="Roll and pitch estimate"><p>Linear estimate from the wave spectra (sea, swell 1, swell 2) and your ship particulars; damping {motion.full.damping.totalPct.toFixed(1)} % of critical. Typically within ±30–50 % for roll. Parametric roll is <b>not</b> predicted: watch the IMO warnings. Settings → Roll and pitch.</p></Hint>
            {:else}
                <span class="pp-note">Roll / pitch estimate: {motionMissing($vessel) || 'no wave data here'}.</span>
            {/if}
        </div>
        <p class="pp-note">Roll period {roll.value ? roll.value.toFixed(1) + ' s' + (roll.estimated ? ' (estimated from GM)' : ' (measured)') : 'not set: no roll checks'}. LBP {$vessel.lbp ?? 'not set: no surf-riding or high-wave checks'}. Advisory only.</p>
    {:else}
        <div class="g-empty"><p>No forecast for this time and place (beyond the forecast, or not fetched yet: see the Weather section).</p></div>
    {/if}
{/if}
{/if}
</div>

<script context="module" lang="ts">
    let MOTION_MODE: 'plan' | 'live' = 'plan';
</script>

<script lang="ts">
    import store from '@windy/store';
    import { logEvent } from '../lib/activityLog';
    /** Set Windy's forecast time (Windy keeps it inside its forecast range) */
    function setTime(t: number) {
        store.set('timestamp', Math.round(t / 60e3) * 60e3);
        logEvent('click', `Motion: map time set to ${new Date(t).toISOString().slice(0, 16)} UTC`);
    }
    function stepTime(h: number) {
        setTime($timelineTs + h * 3600e3);
    }
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import { fmtPos, fmtTime } from '../lib/format';
    import { positionAt } from '../lib/model';
    import { checkLimits, rollPeriodFor, sampleSeries, waveSystems, type WxPoint } from '../lib/weather';
    import { checkWaveSystem, PHENOMENON_LABEL } from '../lib/circ1228';
    import { norm180 } from '../lib/geo';
    import { flagColors, plan, planKey, route, shipStyle, sweepKey, thresholds, timelineTs, vessel, wxPlanKey, wxSeries, wxSweepValid } from '../state';
    import RiskPolar from './RiskPolar.svelte';
    import LivePolar from './LivePolar.svelte';
    import { openSettingsSection } from './SettingsTab.svelte';

    // live GPS or the plan at the map time (kept while the plugin is open)
    let mode: 'plan' | 'live' = MOTION_MODE;
    function setMode(m: 'plan' | 'live') {
        mode = m;
        MOTION_MODE = m;
        logEvent('tab', `Motion view: ${m}`);
    }
    /** Switches the plugin to the Settings tab */
    export let onSettings: (() => void) | null = null;
    function openPolarSettings() {
        openSettingsSection('polar');
        onSettings?.();
    }
    import { motionAt, motionMissing } from '../lib/motionEstimate';

    $: pos = $plan.etd != null && $plan.eta != null && $timelineTs >= $plan.etd && $timelineTs <= $plan.eta ? positionAt($route, $plan, $timelineTs) : null;
    $: planSpeed = pos ? ($plan.legs[Math.max(0, pos.legIdx)]?.stw ?? 0) : 0;
    let heading = 0;
    let speed = 0;
    let lastKey = '';
    $: if (pos) {
        const key = `${$timelineTs}|${$sweepKey}`;
        if (key !== lastKey) {
            lastKey = key;
            heading = Math.round(pos.course);
            speed = Math.round(planSpeed * 10) / 10;
        }
    }
    function resetWhatIf() {
        lastKey = '';
        if (pos) {
            heading = Math.round(pos.course);
            speed = Math.round(planSpeed * 10) / 10;
        }
    }

    $: series = $wxPlanKey === $planKey ? $wxSeries : [];
    $: wx = pos && series.length ? sampleAt(pos.lat, pos.lon, $timelineTs) : null;
    function sampleAt(lat: number, lon: number, t: number): WxPoint | null {
        let best = series[0];
        let bd = Infinity;
        for (const s of series) {
            const d = (s.lat - lat) ** 2 + (norm180(s.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
            if (d < bd) {
                bd = d;
                best = s;
            }
        }
        const p = sampleSeries(best, t);
        if (!p) return null;
        // Use swept map-layer values from the nearest table time, if any
        let extra: Partial<WxPoint> | undefined;
        let bt = Infinity;
        for (const [ts, v] of $wxSweepValid) {
            if (Math.abs(ts - t) < bt) {
                bt = Math.abs(ts - t);
                extra = v;
            }
        }
        return bt < 3 * 3600e3 && extra ? { ...p, ...extra } : p;
    }

    $: roll = rollPeriodFor($vessel);
    $: hits = wx ? waveSystems(wx).flatMap(ws => checkWaveSystem(ws, { headingDeg: heading, speedKn: speed, lbp: $vessel.lbp, rollPeriod: roll.value }, $thresholds.resonance)) : [];
    $: limits = wx ? checkLimits(wx, heading, $thresholds) : [];
    $: motion = wx ? motionAt(wx, heading, speed, $vessel) : null;

</script>

<style lang="less">
    .small {
        padding: 1px 6px;
        font-size: 11px;
    }
    .head {
        margin-bottom: 6px;
    }
    .grid {
        display: flex;
        gap: 8px;
        align-items: flex-end;
        flex-wrap: wrap;
        label {
            display: flex;
            flex-direction: column;
            font-size: 11px;
        }
        input {
            width: 70px;
        }
    }
    .chip {
        display: inline-block;
        padding: 0 4px;
        border-radius: 3px;
        color: #fff;
        font-weight: bold;
        font-size: 10px;
        &.parametric {
            background: #e53935;
        }
        &.synchronous {
            background: #9c27b0;
        }
        &.highWaves {
            background: #1e9e4a;
        }
        &.surf {
            background: #3949ab;
        }
    }
    .lv1 {
        color: #ffd400;
    }
    .lv2 {
        color: #ff6b6b;
        font-weight: bold;
    }
    .mt {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        margin: 0 0 10px;
    }
    .mt__t {
        font-family: var(--g-mono);
        font-size: 12.5px;
        padding: 0 4px;
    }
</style>
