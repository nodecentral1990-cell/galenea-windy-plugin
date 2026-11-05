<!-- Settings → Roll and pitch → Observed rolls (owner, 2026-11-01). OPTIONAL: the plugin's own estimate is the
     main figure; the log only lets the master fine-tune it to this ship (two corrections, applied when switched on). -->
<h5>Observed rolls (optional)</h5>
<div class="pp-note g-hl">Optional: fine-tunes the estimate to your ship. Used only if you switch it on. <Hint title="Observed rolls"><p>Optional. The plugin works out the roll by itself. If you like, note the rolls you actually see (ship window →
    <b>📝 Log roll</b>, which also has a stopwatch to time the roll period with heading, speed and UTC time kept). After {MIN_OBS} or more, the plugin can work out two small corrections (roll damping and roll period)
    so its estimate matches your ship better. They are used <b>only if you switch them on</b>.</p></Hint></div>
<label class="ch"
    >Clinometer height above the waterline (m) <input type="number" min="0" max="80" step="1" value={$vessel.clinometerHeightM ?? ''} placeholder="not set" on:change={setHeight} /></label
>
<div class="pp-note g-hl">A pendulum clinometer high up shows more roll than there is. <Hint title="Clinometer height"><p>A pendulum clinometer (or an accelerometer-type inclinometer) high up on the bridge <b>shows more roll than there is</b>:
    e.g. about 1.35 × at 25 m with a 17 s roll. With the height entered, the plugin allows for it when it compares your
    readings with its estimate. A gyro / motion sensor, or the horizon by eye, reads the true angle.</p></Hint></div>
{#if !obs.length}
    <p class="pp-note">No observations yet.</p>
{:else}
    <div class="pp-scroll tw">
        <table class="tbl obs">
            <thead>
                <tr>
                    <th><input type="checkbox" checked={sel.size === obs.length} on:change={allSel} title="Select all" /></th>
                    <th>UTC</th><th class="g">Hdg / kn</th><th title="SWH and swell 1 at the time (kept with the entry)">Waves</th>
                    <th class="g" title="What you saw">Seen</th><th title="Plugin's own estimate at the time, same kind (biggest in 10–20 min, or steady)">Plugin</th>
                    <th class="g" title="Roll period you timed with the stopwatch (rolls counted)">Period timed</th><th title="Plugin's mean roll period in those waves at the time">Plugin</th>
                    {#if cal}<th title="Estimate with the corrections">Fine-tuned</th>{/if}
                    <th class="g">Used?</th>
                </tr>
            </thead>
            <tbody>
                {#each obs as o}
                    <tr class:on={sel.has(o.id)} on:click={e => rowClick(o.id, e)}>
                        <td><input type="checkbox" checked={sel.has(o.id)} on:click|stopPropagation={() => toggle(o.id)} /></td>
                        <td class="nowrap">{fmtTime(o.t)}</td>
                        <td class="g nowrap">{deg3(o.headingDeg)} / {o.speedKn.toFixed(1)}</td>
                        <td class="nowrap">SWH {f1(o.waves.hs)} · Sw1 {f1(o.waves.sw1)} m {f0(o.waves.sw1Period)} s</td>
                        <td class="g nowrap">{#if o.observedDeg > 0}<b>{o.observedDeg.toFixed(1)}°</b> {o.kind === 'max' ? 'max' : 'steady'}{:else}—{/if}</td>
                        <td class="nowrap">{o.estimateDeg != null ? `${o.estimateDeg.toFixed(1)}°` : '—'}</td>
                        <td class="g nowrap">{o.periodS ? `${o.periodS.toFixed(1)} s (${o.periodRolls})` : '—'}</td>
                        <td class="nowrap">{o.estimatePeriodS ? `${o.estimatePeriodS.toFixed(1)} s` : '—'}</td>
                        {#if cal}<td class="nowrap">{fitAfter[o.id] != null ? `${fitAfter[o.id].toFixed(1)}°` : '—'}</td>{/if}
                        <td class="g nowrap">{obsUnusable(o) || 'yes'}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
    <div class="row">
        <button class="pp-btn pp-btn--ghost small" disabled={!sel.size} on:click={toggleExclude}>Leave out / use selected ({sel.size})</button>
        <button class="pp-btn pp-btn--ghost small" disabled={!sel.size} on:click={del}>Delete selected ({sel.size})</button>
        <span class="pp-note">Tick boxes or Ctrl/⌘-click rows to select several.</span>
    </div>
{/if}

<div class="row">
    <button class="pp-btn small" disabled={usable < MIN_OBS || busy} on:click={fit}>Work out the corrections</button>
    <span class="pp-note">{usable} usable of {obs.length} ({MIN_OBS} needed; a roll angle of 2° or more and / or a timed roll period; IMO parametric-roll times are not used).</span>
</div>
{#if status}<p class="pp-note"><b>{status}</b></p>{/if}
{#if cal}
    <div class="cal">
        <div>
            Worked out {fmtTime(cal.at)} UTC from <b>{cal.n}</b> observations: roll damping × <b>{cal.dampingFactor.toFixed(2)}</b>,
            roll period × <b>{cal.periodFactor.toFixed(3)}</b>{cal.rollPeriodS ? ` (${cal.rollPeriodS.toFixed(1)} → ${(cal.rollPeriodS * cal.periodFactor).toFixed(1)} s)` : ''}.
        </div>
        {#if (cal.nAmp ?? cal.n) > 0}<div>Roll angles: typical difference from what you saw: plugin alone <b>±{cal.errBeforePct.toFixed(0)} %</b>, fine-tuned <b>±{cal.errAfterPct.toFixed(0)} %</b>.</div>{/if}
        {#if cal.nPeriod}<div>Also used {cal.nPeriod} roll period{cal.nPeriod > 1 ? 's' : ''} you timed.</div>{/if}
        <label class="switch"><input type="checkbox" checked={cal.on} on:change={setOn} /><span class="knob" />Use the corrections in the estimate (off = the plugin's own estimate)</label>
        {#if cal.on && !state.applied}<div class="pp-err">Not in use: {state.why}.</div>{/if}
        <button class="pp-btn pp-btn--ghost small rm" on:click={clearCal}>Remove the corrections</button>
    </div>
{/if}

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import { fmtTime } from '../lib/format';
    import { logEvent } from '../lib/activityLog';
    import { baseShip, calibState, motionOptions } from '../lib/motionEstimate';
    import { fitCalibration, MIN_OBS, obsUnusable } from '../lib/rollCalib';
    import { rollPeriodFor } from '../lib/weather';
    import { vessel, workEnd, workProgress, workStart } from '../state';

    $: obs = $vessel.rollObs ?? [];
    $: cal = $vessel.rollCalib ?? null;
    $: state = calibState($vessel);
    $: usable = obs.filter(o => !obsUnusable(o)).length;
    let fitAfter: Record<string, number> = {};
    let sel = new Set<string>();
    let busy = false;
    let status = '';

    const f0 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(0));
    const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1));
    const deg3 = (d: number) => `${String(Math.round(d) % 360).padStart(3, '0')}°`;

    function setHeight(e: Event) {
        const v = (e.target as HTMLInputElement).value.trim();
        const n = Number(v);
        vessel.update(x => ({ ...x, clinometerHeightM: v === '' || !isFinite(n) || n <= 0 ? null : n }));
    }
    function toggle(id: string) {
        sel = new Set(sel.has(id) ? [...sel].filter(x => x !== id) : [...sel, id]);
    }
    function rowClick(id: string, e: MouseEvent) {
        if (e.ctrlKey || e.metaKey) toggle(id);
        else sel = new Set([id]);
    }
    function allSel() {
        sel = sel.size === obs.length ? new Set() : new Set(obs.map(o => o.id));
    }
    function del() {
        if (!confirm(`Delete ${sel.size} observation${sel.size > 1 ? 's' : ''}?`)) return;
        vessel.update(v => ({ ...v, rollObs: (v.rollObs ?? []).filter(o => !sel.has(o.id)) }));
        sel = new Set();
    }
    function toggleExclude() {
        vessel.update(v => ({ ...v, rollObs: (v.rollObs ?? []).map(o => (sel.has(o.id) ? { ...o, excluded: !o.excluded } : o)) }));
    }
    async function fit() {
        const ship = baseShip($vessel);
        if (!ship) {
            status = 'Ship particulars incomplete (LBP, breadth, drafts, GM).';
            return;
        }
        busy = true;
        const signal = { cancelled: false };
        workStart('Fine-tuning the roll estimate', ['Comparing with your observations'], signal);
        try {
            const r = await fitCalibration(obs, ship, motionOptions($vessel), (d, t) => workProgress('Comparing with your observations', d, t), $vessel.clinometerHeightM ?? null);
            if (!r.ok) {
                status = r.reason ?? 'Could not work it out.';
                return;
            }
            fitAfter = r.after;
            const prevOn = $vessel.rollCalib?.on ?? false;
            vessel.update(v => ({
                ...v,
                rollCalib: { on: prevOn, dampingFactor: r.dampingFactor, periodFactor: r.periodFactor, n: r.n, nAmp: r.nAmp, nPeriod: r.nPeriod, errBeforePct: r.errBeforePct, errAfterPct: r.errAfterPct, at: Date.now(), rollPeriodS: rollPeriodFor(v).value },
            }));
            status = `Done. ${prevOn ? 'In use.' : 'Not in use until you switch it on below.'}`;
            logEvent('rollobs', `Roll fine-tuning worked out from ${r.n} observations: damping ×${r.dampingFactor.toFixed(2)}, period ×${r.periodFactor.toFixed(3)}, error ${r.errBeforePct.toFixed(0)} % → ${r.errAfterPct.toFixed(0)} %`);
        } finally {
            busy = false;
            workEnd();
        }
    }
    function setOn(e: Event) {
        const on = (e.target as HTMLInputElement).checked;
        vessel.update(v => (v.rollCalib ? { ...v, rollCalib: { ...v.rollCalib, on } } : v));
    }
    function clearCal() {
        if (!confirm('Remove the corrections? The estimate goes back to the plugin alone (your observations are kept).')) return;
        vessel.update(v => ({ ...v, rollCalib: null }));
        fitAfter = {};
        status = '';
    }
</script>

<style lang="less">
    h5 {
        margin: 10px 0 2px;
    }
    .ch {
        display: flex;
        flex-direction: column;
        font-size: 11px;
        max-width: 280px;
        margin: 4px 0;
    }
    .tw {
        max-height: 240px;
    }
    .tbl {
        border-collapse: collapse;
        font-size: 11px;
        th,
        td {
            padding: 2px 5px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            text-align: left;
        }
        th {
            position: sticky;
            top: 0;
            background: #333;
        }
        .g {
            border-left: 1px solid rgba(255, 255, 255, 0.25);
        }
        tr.on td {
            background: rgba(47, 111, 214, 0.25);
        }
        .nowrap {
            white-space: nowrap;
        }
    }
    .row {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
        margin: 4px 0;
    }
    .cal {
        background: rgba(255, 255, 255, 0.06);
        border-radius: 4px;
        padding: 6px 8px;
        margin: 4px 0;
        font-size: 11px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .rm {
        align-self: flex-start;
    }
    .switch {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        input {
            position: absolute;
            opacity: 0;
            width: 0;
            height: 0;
        }
        .knob {
            position: relative;
            width: 30px;
            height: 16px;
            border-radius: 8px;
            background: #666;
            &::after {
                content: '';
                position: absolute;
                left: 2px;
                top: 2px;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #fff;
                transition: left 0.15s;
            }
        }
        input:checked + .knob {
            background: #2e9e4f;
            &::after {
                left: 16px;
            }
        }
    }
</style>
