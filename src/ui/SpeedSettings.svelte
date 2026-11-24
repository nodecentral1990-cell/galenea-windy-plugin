<!-- Settings: the owner's RPM / speed / fuel table, weather loss method and currents. -->
{#if !part || part === 'table'}
<h5>Your RPM / speed / fuel table</h5>
<p class="pp-note">Enter RPM, speed in calm water (SiCW), fuel per day and (optional) engine power for a few engine settings. Saved with the ship profile.</p>
<div class="pp-scroll tw">
    <table class="tbl speedtable">
        <thead><tr><th>RPM</th><th>SiCW kn</th><th>Fuel t/day</th><th title="Engine power at this setting, kW (optional; shown in the graphs)">Power kW</th><th /></tr></thead>
        <tbody>
            {#each rows as r, i}
                <tr>
                    <td><input class="num" type="number" step="1" value={r.rpm ?? ''} on:change={e => setRow(i, 'rpm', e)} /></td>
                    <td><input class="num" type="number" step="0.1" value={r.sicw ?? ''} on:change={e => setRow(i, 'sicw', e)} /></td>
                    <td><input class="num" type="number" step="0.1" value={r.fuel ?? ''} on:change={e => setRow(i, 'fuel', e)} /></td>
                    <td><input class="num" type="number" step="10" value={r.powerKw ?? ''} on:change={e => setRow(i, 'powerKw', e)} /></td>
                    <td><button class="icon" title="Remove" on:click={() => removeRow(i)}><Icon name="x" size={13} /></button></td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>
<button class="pp-btn pp-btn--ghost" on:click={addRow}><Icon name="plus" size={14} /> Add a row</button>
{/if}
{#if !part || part === 'barred'}
<h5>Lowest and highest RPM</h5>
<div class="rpm-lim" data-g="rpm-limits">
    <label>Min RPM <input class="num" type="number" step="1" min="0" value={$vessel.minRpm ?? ''} placeholder="none" on:change={e => setLim('minRpm', e)} /></label>
    <label>Max RPM <input class="num" type="number" step="1" min="0" value={$vessel.maxRpm ?? ''} placeholder="none" on:change={e => setLim('maxRpm', e)} /></label>
    <Hint title="Min and max RPM"><p>The plugin <b>never advises an RPM below the min or above the max</b> (Speed & fuel, safe speed and course plan). If the plan or the ETA needs more than the max, it advises the max RPM and warns that the speed will be lower and the ETA later; below the min it advises the min. Leave empty for no limit.</p></Hint>
</div>
<h5>RPM the ship must not run at (barred ranges)</h5>
<div class="pp-note g-hl">Never suggested by the plugin; ⛔ in Speed & fuel. <Hint title="Barred RPM ranges"><p>E.g. the <b>critical / barred speed range</b> (heavy vibration), or RPM where the shaft generator, auxiliary engine or
    boiler cuts in / out, or the <b>auxiliary blower cut-in / cut-out</b> (scavenge air pressure; running there can damage the blower motor). Add as many ranges as you need. The plugin <b>never suggests these RPM</b> (safe speed plan) and, when a leg or the ETA would need one, advises the nearest allowed RPM just above or below and says why.</p></Hint></div>
<div class="pp-scroll tw">
    <table class="tbl barred">
        <thead><tr><th>From RPM</th><th>To RPM</th><th>Why</th><th /></tr></thead>
        <tbody>
            {#each barred as b, i}
                <tr>
                    <td><input class="num" type="number" step="1" value={b.from ?? ''} on:change={e => setBarred(i, 'from', e)} /></td>
                    <td><input class="num" type="number" step="1" value={b.to ?? ''} on:change={e => setBarred(i, 'to', e)} /></td>
                    <td><input class="why" list="pp-barred-why" value={b.why} placeholder="e.g. critical: vibration" on:change={e => setBarred(i, 'why', e)} /></td>
                    <td><button class="icon" title="Remove" on:click={() => removeBarred(i)}><Icon name="x" size={13} /></button></td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>
<datalist id="pp-barred-why">
    <option value="Critical / barred speed range (vibration)" />
    <option value="Shaft generator cut-in / cut-out" />
    <option value="Auxiliary engine cut-in / cut-out" />
    <option value="Exhaust gas boiler cut-in / cut-out" />
    <option value="Auxiliary blower cut-in / cut-out (scavenge air pressure)" />
    <option value="Turbocharger / auxiliary blower changeover" />
</datalist>
<button class="pp-btn pp-btn--ghost" on:click={addBarred}><Icon name="plus" size={14} /> Add a barred range</button>
{/if}
{#if !part || part === 'loss'}
<h5>Weather loss and currents</h5>
<div class="grid">
    <label
        >Weather speed loss
        <select value={lossMethodOf($route)} on:change={e => updateRoute(r => (r.lossMethod = selLoss(e)))}>
            <option value="kwon">Estimate from the forecast (Kwon)</option>
            <option value="manual">My allowance per leg (Route table)</option>
        </select>
    </label>
    <label class="check">
        <input type="checkbox" checked={currentsOn($route)} on:change={setCurrents} />
        Include ocean currents
    </label>
</div>
<div class="pp-note g-hl">Currents come with the forecast (Open-Meteo marine model, about 8 km, updated daily); Windy's own currents map takes over where it was read. <Hint title="How currents work"><p><b>How currents work:</b> the ocean current along the route is downloaded with the forecast,
    so nothing needs pressing. If you also read Windy's currents layer (Weather → Read currents, optional), Windy's values are used for those times.
    With <b>Include ocean currents</b> ticked (the normal setting) the speed over ground and ETA use them: SOG = speed through the water + the current along the track.
    Model currents can be wrong near coasts, in eddies and in tidal streams: check them against the ship's log and GPS. {#if currentsRead}Windy's map read: {currentsRead} times.{/if}</p></Hint></div>
{#if lossMethodOf($route) === 'kwon'}
    <div class="pp-note g-hl">A rough estimate for a typical hull, not your ship's own data. <Hint title="Weather loss estimate"><p>Estimate uses the forecast wind and significant wave height against your heading, LBP, breadth, drafts, block
        coefficient, condition and ship type (Ship particulars). Method: Kwon (2008), with the coefficients as published in later papers.
        <b>Treat it as rough</b>: compare it with your ship's experience; if you know better, choose "My allowance per leg".
        {#if !lossInputs($vessel)}<span class="pp-err">Needs LBP, breadth and drafts in Ship particulars: until then the weather loss is 0.</span>{/if}
        {#if !$weatherReady}<span class="pp-err">Get the forecast in the Weather tab first.</span>{/if}</p></Hint></div>
    {#if !lossInputs($vessel)}<div class="pp-note pp-err">Weather loss needs LBP, breadth and drafts (Ship particulars): until they are filled in it is 0.</div>{/if}
{/if}
{/if}

<script lang="ts">
    import Icon from './base/Icon.svelte';
    /** Show only this piece of the group (a gear beside a function); null = all of it */
    export let part: string | null = null;
    import Hint from './base/Hint.svelte';
    import { currentsOn, lossMethodOf, type BarredRpm, type SpeedRow } from '../lib/model';
    import { lossInputs } from '../lib/speed';
    import { planKey, route, updateRoute, vessel, wxPlanKey, wxSeries, wxSweepValid } from '../state';
    import { derived } from 'svelte/store';

    const weatherReady = derived([wxSeries, wxPlanKey, planKey], ([s, a, b]) => s.length > 0 && a === b);
    $: rows = $vessel.speedTable ?? [];
    $: barred = $vessel.barredRpm ?? [];
    function setBarred(i: number, k: keyof BarredRpm, e: Event) {
        const s = (e.target as HTMLInputElement).value.trim();
        vessel.update(v => {
            const t = [...(v.barredRpm ?? [])];
            const n = s === '' ? null : Number(s);
            t[i] = { ...t[i], [k]: k === 'why' ? s : n != null && isFinite(n) ? n : null };
            return { ...v, barredRpm: t };
        });
    }
    function setLim(k: 'minRpm' | 'maxRpm', e: Event) {
        const t = (e.currentTarget as HTMLInputElement).value.trim();
        const v = t === '' ? null : Number(t);
        vessel.update(x => ({ ...x, [k]: v != null && isFinite(v) && v > 0 ? Math.round(v) : null }));
    }
    const addBarred = () => vessel.update(v => ({ ...v, barredRpm: [...(v.barredRpm ?? []), { from: null, to: null, why: '' }] }));
    const removeBarred = (i: number) => vessel.update(v => ({ ...v, barredRpm: (v.barredRpm ?? []).filter((_, j) => j !== i) }));
    $: currentsRead = [...$wxSweepValid.values()].filter(v => v.currentKn != null).length;

    function setCurrents(e: Event) {
        const on = (e.target as HTMLInputElement).checked;
        updateRoute(r => (r.useCurrents = on));
    }

    const selLoss = (e: Event) => (e.target as HTMLSelectElement).value as 'manual' | 'kwon';

    function setRow(i: number, k: keyof SpeedRow, e: Event) {
        const s = (e.target as HTMLInputElement).value.trim();
        const n = s === '' ? null : Number(s);
        vessel.update(v => {
            const t = [...(v.speedTable ?? [])];
            t[i] = { ...t[i], [k]: n != null && isFinite(n) ? n : null };
            return { ...v, speedTable: t };
        });
    }

    function addRow() {
        vessel.update(v => ({ ...v, speedTable: [...(v.speedTable ?? []), { rpm: null, sicw: null, fuel: null }] }));
    }

    function removeRow(i: number) {
        vessel.update(v => ({ ...v, speedTable: (v.speedTable ?? []).filter((_, j) => j !== i) }));
    }
</script>

<style lang="less">
    .rpm-lim {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 14px;
        align-items: center;
        label {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        input {
            width: 70px;
        }
    }
    h5 {
        margin: 8px 0 4px;
        font-size: 12px;
    }
    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 10px;
        align-items: end;
        label {
            display: flex;
            flex-direction: column;
            font-size: 11px;
        }
        label.check {
            flex-direction: row;
            gap: 6px;
            align-items: center;
        }
    }
    .tw {
        max-height: 260px;
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
            background: #333;
        }
    }
    input.num {
        width: 64px;
    }
    input.why {
        width: 230px;
    }
    button.icon {
        background: none;
        border: 0;
        color: inherit;
        cursor: pointer;
    }
</style>
