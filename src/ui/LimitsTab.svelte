<h4>Weather thresholds <span class="pp-note">(values apply to port and starboard)</span></h4>
<div class="hs">
    <span class="tag alert">Alert</span>
    <input class="num" type="number" step="0.1" value={$thresholds.hsAlert ?? ''} on:change={e => setHs('hsAlert', e)} />
    <span>SWH (significant wave height), all directions (m)</span>
    <input class="num" type="number" step="0.1" value={$thresholds.hsLimit ?? ''} on:change={e => setHs('hsLimit', e)} />
    <span class="tag limit">Limit</span>
</div>
<table>
    <thead>
        <tr>
            <th />
            <th class="alert" colspan="3">Alert (amber)</th>
            <th class="limit" colspan="3">Limit (red)</th>
        </tr>
        <tr>
            <th>Sector</th>
            <th>Sea m</th><th title="Swell 1 and Swell 2, each by its own direction">Swell 1 / 2 m</th><th>Wind kn</th>
            <th>Sea m</th><th title="Swell 1 and Swell 2, each by its own direction">Swell 1 / 2 m</th><th>Wind kn</th>
        </tr>
    </thead>
    <tbody>
        {#each SECTORS as s, i}
            <tr>
                <td>{SECTOR_LABEL[s]} <span class="pp-note">{range(i)}</span></td>
                {#each LEVELS as lv}
                    {#each KEYS as k}
                        <td><input class="num" type="number" step={k === 'wind' ? 1 : 0.1} value={$thresholds[lv][s][k] ?? ''} on:change={e => setSector(lv, s, k, e)} /></td>
                    {/each}
                {/each}
            </tr>
        {/each}
    </tbody>
</table>
<div>
    <button class="pp-btn pp-btn--ghost" on:click={() => copy('alert', 'limit')}>Copy alert ⇒ limit</button>
    <button class="pp-btn pp-btn--ghost" on:click={() => copy('limit', 'alert')}>⇐ Copy limit to alert</button>
    <button class="pp-btn pp-btn--ghost" on:click={() => clear('alert')}>Clear alert</button>
    <button class="pp-btn pp-btn--ghost" on:click={() => clear('limit')}>Clear limit</button>
</div>
<div class="pp-note g-hl">By direction relative to the bow. <Hint title="Which values are checked"><p>Wind: Windy 10 m wind. Swell 1 / 2: Swell 1 and Swell 2, each by its own direction. Sea: Windy's wind waves (read along
    the route after the forecast), by their own direction; until read, worked out from SWH and the swells with the wind direction.
    SWH: all directions.</p></Hint></div>

<h4>Resonance alert thresholds (m)</h4>
<p class="pp-note">The wave height at which each IMO MSC.1/Circ.1228 warning starts to show. Empty = off.</p>
<div class="res">
    {#each RES as r}
        <label class={r.cls}
            >{r.label}
            <input class="num" type="number" step="0.1" value={$thresholds.resonance[r.key] ?? ''} on:change={e => setRes(r.key, e)} />
            <span class="pp-note">{guide(r.key)}</span>
        </label>
    {/each}
    <label
        >"Nearly equal" tolerance (%)
        <input class="num" type="number" step="1" min="1" max="50" value={$thresholds.resonance.tolerancePct} on:change={setTol} />
        <span class="pp-note">IMO gives no number. Owner's choice: 15%.</span>
    </label>
</div>
<h4>Cold and ice</h4>
<div class="pp-note g-hl">Empty = off. <b class="pp-err">Windy has no sea-ice data: use the official ice services.</b> <Hint title="Cold and ice"><p>Warnings when it is colder than these (empty = off). <b>Windy has no sea-ice data</b> (no ice edge, concentration or
    thickness): for ice use the official ice services (e.g. Canadian Ice Service for the St Lawrence / Montreal, the Finnish /
    Swedish ice services for the Baltic). The plugin warns on cold air, a cold sea surface and <b>spray icing</b> on deck
    (Overland method from wind, air and sea temperature).</p></Hint></div>
<div class="cold">
    <span />
    <b>Alert (amber)</b>
    <b>Limit (red)</b>
    <span>Air temperature at or below (°C)</span>
    <input class="num" type="number" step="1" value={cold.airAlertC ?? ''} on:change={e => setCold('airAlertC', e)} />
    <input class="num" type="number" step="1" value={cold.airLimitC ?? ''} on:change={e => setCold('airLimitC', e)} />
    <span>Sea surface at or below (°C)</span>
    <input class="num" type="number" step="0.5" value={cold.seaAlertC ?? ''} on:change={e => setCold('seaAlertC', e)} />
    <input class="num" type="number" step="0.5" value={cold.seaLimitC ?? ''} on:change={e => setCold('seaLimitC', e)} />
    <span>Spray icing at or above</span>
    <select value={cold.icingAlert ?? ''} on:change={e => setIcing('icingAlert', e)}>
        <option value="">off</option>
        {#each ICING_CLASSES.slice(1) as c}<option value={c}>{c} ({ICING_RATE[c]})</option>{/each}
    </select>
    <select value={cold.icingLimit ?? ''} on:change={e => setIcing('icingLimit', e)}>
        <option value="">off</option>
        {#each ICING_CLASSES.slice(1) as c}<option value={c}>{c} ({ICING_RATE[c]})</option>{/each}
    </select>
</div>
<p class="pp-note">Sea water freezes at about −1.8 °C; Windy's sea temperature is one value per forecast point (not hourly).</p>
<button class="pp-btn pp-btn--ghost" on:click={reset}>Reset all limits to defaults</button>

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import { defaultThresholds, SECTOR_LABEL, SECTORS, type Sector, type SectorLimits, type Thresholds } from '../lib/weather';
    import { thresholds, vessel } from '../state';
    import { defaultCold, ICING_CLASSES, ICING_RATE, type ColdLimits, type IcingClass } from '../lib/icing';

    $: cold = $thresholds.cold ?? defaultCold();
    function setCold(k: 'airAlertC' | 'airLimitC' | 'seaAlertC' | 'seaLimitC', e: Event) {
        const s = (e.target as HTMLInputElement).value.trim();
        const n = s === '' ? null : Number(s);
        thresholds.update(t => ({ ...t, cold: { ...(t.cold ?? defaultCold()), [k]: n != null && isFinite(n) ? n : null } as ColdLimits }));
    }
    function setIcing(k: 'icingAlert' | 'icingLimit', e: Event) {
        const v = (e.target as HTMLSelectElement).value as IcingClass | '';
        thresholds.update(t => ({ ...t, cold: { ...(t.cold ?? defaultCold()), [k]: v || null } }));
    }

    const LEVELS = ['alert', 'limit'] as const;
    const KEYS: (keyof SectorLimits)[] = ['seas', 'swell', 'wind'];
    type ResKey = 'parametric' | 'synchronous' | 'highWaves' | 'broaching';
    const RES: { key: ResKey; label: string; cls: string }[] = [
        { key: 'parametric', label: 'Parametric roll', cls: 'c-par' },
        { key: 'synchronous', label: 'Synchronous roll', cls: 'c-syn' },
        { key: 'highWaves', label: 'High wave groups', cls: 'c-hw' },
        { key: 'broaching', label: 'Broaching / surf-riding', cls: 'c-br' },
    ];

    const num = (e: Event): number | null => {
        const s = (e.target as HTMLInputElement).value.trim();
        const n = s === '' ? null : Number(s);
        return n != null && isFinite(n) && n >= 0 ? n : null;
    };

    function range(i: number): string {
        const e = $thresholds.sectorEdges;
        const lo = i === 0 ? 0 : e[i - 1];
        const hi = i === 4 ? 180 : e[i];
        return `${lo}–${hi}°`;
    }

    function guide(k: ResKey): string {
        const L = $vessel.lbp;
        if (k === 'highWaves') return L ? `IMO: wave height > 0.04 L = ${(0.04 * L).toFixed(1)} m` : 'IMO: wave height > 0.04 L (enter LBP)';
        if (k === 'broaching') return L ? `No IMO height; 0.02–0.04 L = ${(0.02 * L).toFixed(1)}–${(0.04 * L).toFixed(1)} m` : 'No IMO height (enter LBP)';
        return 'No IMO height; set from experience';
    }

    function setHs(k: 'hsAlert' | 'hsLimit', e: Event) {
        const v = num(e);
        thresholds.update(t => ({ ...t, [k]: v }));
    }

    function setSector(lv: 'alert' | 'limit', s: Sector, k: keyof SectorLimits, e: Event) {
        const v = num(e);
        thresholds.update(t => ({ ...t, [lv]: { ...t[lv], [s]: { ...t[lv][s], [k]: v } } }));
    }

    function setRes(k: ResKey, e: Event) {
        const v = num(e);
        thresholds.update(t => ({ ...t, resonance: { ...t.resonance, [k]: v } }));
    }

    function setTol(e: Event) {
        const v = num(e);
        if (v && v > 0) thresholds.update(t => ({ ...t, resonance: { ...t.resonance, tolerancePct: v } }));
    }

    function copy(from: 'alert' | 'limit', to: 'alert' | 'limit') {
        thresholds.update(t => ({ ...t, [to]: JSON.parse(JSON.stringify(t[from])) as Thresholds['alert'] }));
    }

    function clear(lv: 'alert' | 'limit') {
        thresholds.update(t => ({
            ...t,
            [lv]: Object.fromEntries(SECTORS.map(s => [s, { seas: null, swell: null, wind: null }])) as Thresholds['alert'],
        }));
    }

    function reset() {
        if (confirm('Reset all limits to the defaults?')) thresholds.set(defaultThresholds());
    }
</script>

<style lang="less">
    .cold {
        display: grid;
        grid-template-columns: 1fr 90px 160px;
        gap: 4px 8px;
        align-items: center;
        font-size: 11px;
        margin: 4px 0;
    }
    .hs {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
        flex-wrap: wrap;
    }
    .tag {
        padding: 1px 6px;
        border-radius: 3px;
        color: #000;
        font-weight: bold;
        &.alert {
            background: #ffd400;
        }
        &.limit {
            background: #ff4d4d;
        }
    }
    table {
        border-collapse: collapse;
        font-size: 11px;
        th,
        td {
            padding: 2px 3px;
            text-align: center;
        }
        td:first-child {
            text-align: left;
            white-space: nowrap;
        }
        th.alert {
            border-top: 3px solid #ffd400;
        }
        th.limit {
            border-top: 3px solid #ff4d4d;
        }
    }
    input.num {
        width: 48px;
    }
    .res {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 10px;
        label {
            display: flex;
            flex-direction: column;
            font-size: 11px;
            padding-left: 6px;
            border-left: 4px solid transparent;
        }
        .c-par {
            border-color: #e53935;
        }
        .c-syn {
            border-color: #9c27b0;
        }
        .c-hw {
            border-color: #1e9e4a;
        }
        .c-br {
            border-color: #3949ab;
        }
    }
</style>
