<!-- Ship window: "Log roll" (owner, 2026-11-01). Optional: the master notes the roll seen, with the
     forecast of that moment kept beside it, so the estimate can later be fine-tuned (⚙ Settings → Roll and pitch). -->
<div class="ro">
    <div class="ro__head"><b>📝 Log the roll you see</b> <button class="ro__x" on:click={onClose} title="Close">✕</button></div>
    {#if Math.abs(mapTs - Date.now()) > 90 * 60e3}
        <p class="ro__warn">Map time is {fmtTime(mapTs)} UTC, not now. Press 🕒 Now first so the roll is logged with the present weather.</p>
    {/if}
    <div class="ro__grid">
        <label>Roll seen (°, one side; optional) <input type="number" step="0.5" min="0" max="45" bind:value={deg} /></label>
        <label
            >What it is
            <select bind:value={kind}>
                <option value="max">biggest roll in the last 10–20 min</option>
                <option value="steady">typical, steady roll</option>
            </select>
        </label>
        <label
            >Read from
            <select bind:value={instrument}>
                <option value="pendulum">clinometer (pendulum)</option>
                <option value="electronic">electronic inclinometer (accelerometer)</option>
                <option value="gyro">gyro / motion sensor (true angle)</option>
                <option value="eye">by eye</option>
            </select>
        </label>
        <label>Note <input type="text" maxlength="80" bind:value={note} placeholder="optional" /></label>
    </div>
    <div class="ro__sw">
        <b>⏱ Time the roll (optional):</b>
        {#if !swStart}
            <button class="pp-btn small" on:click={swGo} title="Click when the ship is right over to one side">Start</button>
        {:else}
            <button class="pp-btn small" on:click={swStop} title="Click when she is back over to the same side for the last time">Stop</button>
            <span class="mono">{(swNow / 1000).toFixed(1)} s</span>
        {/if}
        <label class="ro__n">full rolls counted <input type="number" min="1" max="50" step="1" bind:value={rolls} /></label>
        {#if timedS != null}<span>= <b>{period?.toFixed(1)} s</b> per roll</span>{/if}
    </div>
    <p class="ro__tip">
        Click <b>Start</b> when she is right over to one side, count the full rolls (over to the other side and back = one),
        click <b>Stop</b> when she is back on the same side after the last one. 5–10 rolls give a good average.
        {#if seasAstern}<span class="ro__warn">Waves are from astern / the quarter now: the ship may be rolling at the waves' rhythm, not her own; the timing is less reliable.</span>{:else}Best in beam or bow seas, moderate weather.{/if}
        Plugin's roll period in use: {rollShown}.
    </p>
    <p class="ro__est">
        Plugin's estimate now: <b>{est != null ? `${est.toFixed(1)}°` : '—'}</b> ({kind === 'max' ? 'biggest in 10–20 min' : 'steady roll'}) at {deg3(heading)} and {speed.toFixed(1)} kn.
        {#if parametric}<span class="ro__warn">IMO parametric-roll warning now: this entry will not be used for fine-tuning.</span>{/if}
    </p>
    <div class="ro__row">
        <button class="pp-btn small" disabled={!(deg > 0) && period == null} on:click={save}>Save</button>
        <span class="pp-note">Kept in this browser and in the ship profile. Optional: the plugin's own estimate stays the main figure.</span>
    </div>
</div>

<script lang="ts">
    import { onDestroy } from 'svelte';
    import { checkWaveSystem, type ResonanceSettings } from '../lib/circ1228';
    import { fmtTime } from '../lib/format';
    import { logEvent } from '../lib/activityLog';
    import { baseShip, motionOptions } from '../lib/motionEstimate';
    import { predictMotions } from '../lib/motions';
    import { newUid, type RollObservation } from '../lib/model';
    import { comparableRoll, freezeWaves, instrumentFactor } from '../lib/rollCalib';
    import { rollPeriodFor, waveSystems, type WxPoint } from '../lib/weather';
    import { vessel } from '../state';

    export let wx: WxPoint;
    export let lat: number;
    export let lon: number;
    export let heading: number;
    export let speed: number;
    export let mapTs: number;
    export let resonance: ResonanceSettings;
    export let onClose: () => void;

    let deg = 0;
    let kind: RollObservation['kind'] = 'max';
    let instrument: RollObservation['instrument'] = 'pendulum';
    let note = '';

    $: ship = baseShip($vessel);
    $: m = ship ? predictMotions(wx, heading, speed, ship, motionOptions($vessel)) : null;
    // the plugin's figure as this instrument would show it (a pendulum high up over-reads)
    $: est = m && m.ok ? comparableRoll(m, kind, instrumentFactor(instrument, $vessel.clinometerHeightM, m.rollPeriodS)) : null;
    $: roll = rollPeriodFor($vessel).value;
    $: parametric = waveSystems(wx)
        .flatMap(ws => checkWaveSystem(ws, { headingDeg: heading, speedKn: speed, lbp: $vessel.lbp, rollPeriod: roll }, resonance))
        .some(h => h.phenomenon === 'parametric');
    // stopwatch: Start on one side, Stop on the same side after `rolls` full rolls
    let swStart = 0;
    let swNow = 0;
    let timedS: number | null = null;
    let rolls = 5;
    let swTimer: ReturnType<typeof setInterval> | null = null;
    function swGo() {
        swStart = Date.now();
        swNow = 0;
        timedS = null;
        swTimer = setInterval(() => (swNow = Date.now() - swStart), 100);
    }
    function swStop() {
        if (swTimer) clearInterval(swTimer);
        swTimer = null;
        timedS = (Date.now() - swStart) / 1000;
        swStart = 0;
    }
    onDestroy(() => swTimer && clearInterval(swTimer));
    $: period = timedS != null && rolls > 0 ? timedS / rolls : null;
    // waves from astern or the quarter (alpha 120–240° off the bow) for the main swell or the sea
    $: seasAstern = [wx.sw1Dir, wx.seaDir ?? wx.windDir].some(d => d != null && Math.abs(((d - heading + 540) % 360) - 180) > 120);
    $: rollShown = roll ? `${roll.toFixed(1)} s${rollPeriodFor($vessel).estimated ? ' (estimated from GM)' : ''}${m && m.ok && m.rollPeriodS ? `; expected in these waves about ${m.rollPeriodS.toFixed(1)} s` : ''}` : 'none';
    const deg3 = (d: number) => `${String(Math.round(d) % 360).padStart(3, '0')}°`;

    function save() {
        const v = $vessel;
        const draft = v.draftFwd != null && v.draftAft != null ? (v.draftFwd + v.draftAft) / 2 : (v.draftFwd ?? v.draftAft ?? null);
        const o: RollObservation = {
            id: newUid(),
            t: mapTs,
            lat,
            lon,
            headingDeg: heading,
            speedKn: speed,
            observedDeg: deg > 0 ? deg : 0,
            periodS: period != null ? Math.round(period * 100) / 100 : null,
            periodRolls: period != null ? rolls : null,
            kind,
            instrument,
            note: note.trim(),
            parametric,
            clinoHeightM: $vessel.clinometerHeightM ?? null,
            waves: freezeWaves(wx),
            rollPeriodS: roll,
            gm: v.gm,
            draftM: draft,
            estimateDeg: est,
            estimatePeriodS: m && m.ok ? m.rollPeriodS : null,
        };
        vessel.update(x => ({ ...x, rollObs: [...(x.rollObs ?? []), o] }));
        logEvent('rollobs', `Observed roll logged: ${deg > 0 ? `${deg}° (${kind})` : 'no angle'}${period != null ? `, roll period timed ${period.toFixed(1)} s over ${rolls} rolls` : ''}, estimate ${est != null ? est.toFixed(1) : '—'}°`, { heading, speed, parametric });
        onClose();
    }
</script>

<style lang="less">
    .ro {
        margin: 6px 0;
        padding: 6px;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.05);
    }
    .ro__head {
        display: flex;
        justify-content: space-between;
    }
    .ro__x {
        background: none;
        border: 0;
        color: inherit;
        cursor: pointer;
    }
    .ro__grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px 8px;
        margin: 4px 0;
        label {
            display: flex;
            flex-direction: column;
            font-size: 10.5px;
        }
        input,
        select {
            font-size: 11px;
        }
    }
    .ro__sw {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
        margin: 4px 0 2px;
        font-size: 11px;
    }
    .ro__n {
        display: flex;
        gap: 4px;
        align-items: center;
        font-size: 10.5px;
        input {
            width: 44px;
        }
    }
    .ro__tip {
        font-size: 10px;
        opacity: 0.85;
        margin: 2px 0;
    }
    .mono {
        font-family: monospace;
    }
    .ro__est {
        margin: 3px 0;
        font-size: 10.5px;
    }
    .ro__warn {
        color: #ffd28a;
        font-size: 10.5px;
        margin: 3px 0;
    }
    .ro__row {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
    }
</style>
