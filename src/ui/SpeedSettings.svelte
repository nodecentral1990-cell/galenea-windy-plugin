<!-- Settings: the owner's RPM / speed / fuel table, weather loss method and currents. -->
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
                    <td><button class="icon" title="Remove" on:click={() => removeRow(i)}>✕</button></td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>
<button class="pp-btn pp-btn--ghost" on:click={addRow}>＋ Add a row</button>

<h5>RPM the ship must not run at (barred ranges)</h5>
<div class="pp-note g-hl">Never suggested by the plugin; ⛔ in Speed & fuel. <Hint title="Barred RPM ranges"><p>E.g. the <b>critical / barred speed range</b> (heavy vibration), or RPM where the shaft generator, auxiliary engine or
    boiler cuts in / out. The plugin <b>never suggests these RPM</b> (safe speed plan) and marks a leg planned inside them.</p></Hint></div>
<div class="pp-scroll tw">
    <table class="tbl barred">
        <thead><tr><th>From RPM</th><th>To RPM</th><th>Why</th><th /></tr></thead>
        <tbody>
            {#each barred as b, i}
                <tr>
                    <td><input class="num" type="number" step="1" value={b.from ?? ''} on:change={e => setBarred(i, 'from', e)} /></td>
                    <td><input class="num" type="number" step="1" value={b.to ?? ''} on:change={e => setBarred(i, 'to', e)} /></td>
                    <td><input class="why" list="pp-barred-why" value={b.why} placeholder="e.g. critical: vibration" on:change={e => setBarred(i, 'why', e)} /></td>
                    <td><button class="icon" title="Remove" on:click={() => removeBarred(i)}>✕</button></td>
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
    <option value="Turbocharger / auxiliary blower changeover" />
</datalist>
<button class="pp-btn pp-btn--ghost" on:click={addBarred}>＋ Add a barred range</button>

<h5>Weather loss and currents</h5>
<div class="grid">
    <label
        >Weather speed loss
        <select value={$route.lossMethod ?? 'manual'} on:change={e => updateRoute(r => (r.lossMethod = selLoss(e)))}>
            <option value="manual">My allowance per leg (Route table)</option>
            <option value="kwon">Estimate from the forecast (Kwon)</option>
        </select>
    </label>
    <label class="check">
        <input type="checkbox" checked={!!$route.useCurrents} on:change={setCurrents} />
        Include ocean currents
    </label>
</div>
<div class="pp-note g-hl">Currents come from Windy's map layer (Weather → Read currents). <Hint title="How currents work"><p><b>How currents work:</b> Windy gives currents only as a map layer. In the Weather tab press <b>Get forecast</b>, then
    <b>Read currents</b> (it steps through the voyage on the currents layer). Tick <b>Include ocean currents</b> here and the
    speed over ground and ETA use them. {#if currentsRead}Currents read: {currentsRead} times.{:else}<span class="pp-err">No currents read yet.</span>{/if}</p></Hint></div>
{#if ($route.lossMethod ?? 'manual') === 'kwon'}
    <div class="pp-note g-hl"><span class="pp-err">A rough guide: coefficients not yet checked against the original paper.</span> <Hint title="Weather loss estimate"><p>Estimate uses the forecast wind and significant wave height against your heading, LBP, breadth, drafts, block
        coefficient, condition and ship type (Ship particulars, above). <b>Its coefficients have not yet been checked against the original
        paper: treat it as a rough guide.</b> {#if !$weatherReady}<span class="pp-err">Get the forecast in the Weather tab first.</span>{/if}</p></Hint></div>
{/if}

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import type { BarredRpm, SpeedRow } from '../lib/model';
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
