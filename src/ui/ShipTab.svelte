<div class="grid">
    <label>Ship name <input bind:value={$vessel.name} /></label>
    <label title="IMO MSC.1/Circ.1228 uses length between perpendiculars">LBP (m) * <input type="number" step="0.1" value={$vessel.lbp ?? ''} on:change={e => setNum('lbp', e)} /></label>
    <label>LOA (m) <input type="number" step="0.1" value={$vessel.loa ?? ''} on:change={e => setNum('loa', e)} /></label>
    <label>Breadth (m) <input type="number" step="0.1" value={$vessel.breadth ?? ''} on:change={e => setNum('breadth', e)} /></label>
    <label>Draft fwd (m) <input type="number" step="0.01" value={$vessel.draftFwd ?? ''} on:change={e => setNum('draftFwd', e)} /></label>
    <label>Draft aft (m) <input type="number" step="0.01" value={$vessel.draftAft ?? ''} on:change={e => setNum('draftAft', e)} /></label>
    <label>GM (m, corrected) <input type="number" step="0.01" value={$vessel.gm ?? ''} on:change={e => setNum('gm', e)} /></label>
    <label title="Measured in calm sea (Circ.1228 para 2.3) or from the loading computer">Roll period, measured (s) * <input type="number" step="0.1" value={$vessel.rollPeriod ?? ''} on:change={e => setNum('rollPeriod', e)} /></label>
    <label title="Lets RPM give the speed at 0 slip">Propeller pitch (m) <input type="number" step="0.01" value={$vessel.pitch ?? ''} on:change={e => setNum('pitch', e)} /></label>
    <label title="Used for the weather speed-loss estimate. Empty = the typical value for the ship type (shown in grey)">Block coefficient Cb <input type="number" step="0.01" min="0.4" max="0.95" value={$vessel.cb ?? ''} placeholder={`typical ${type.cb}`} on:change={e => setNum('cb', e)} /></label>
    <label
        >Condition
        <select value={$vessel.condition ?? 'laden'} on:change={e => setSel('condition', e)}>
            <option value="laden">Laden / normal</option>
            <option value="ballast">Ballast</option>
        </select>
    </label>
    <label
        >Ship type
        <select value={type.id} on:change={e => setSel('shipType', e)}>
            {#each SHIP_TYPES as t}<option value={t.id}>{t.label}</option>{/each}
        </select>
    </label>
    <label title="Average height of the ship's side above the water, including containers on deck / superstructure. Empty = typical for the ship type and condition (shown in grey)"
        >Windage height (m) <input type="number" step="0.5" min="1" max="70" value={$vessel.windageHeight ?? ''} placeholder={`typical ${type.windH[$vessel.condition === 'ballast' ? 'ballast' : 'laden']}`} on:change={e => setNum('windageHeight', e)} /></label>
    <label title="How fast the ship drifts when stopped, as % of the wind speed. Empty = worked out by the plugin (shown in grey); type your own from experience to override"
        >Wind drift when stopped (% of wind) <input type="number" step="0.1" min="0" max="20" value={$vessel.leewayPct ?? ''} placeholder={`auto ${lee.pct.toFixed(1)}`} on:change={e => setNum('leewayPct', e)} /></label>
    <label title="Drift direction off downwind, degrees (+ to the right of downwind). Empty = straight downwind"
        >Drift angle off downwind (°) <input type="number" step="5" min="-45" max="45" value={$vessel.driftAngleDeg ?? ''} placeholder="0" on:change={e => setSigned('driftAngleDeg', e)} /></label>
</div>
<div class="pp-note g-hl">Wind drift used: <b>{($vessel.leewayPct ?? lee.pct).toFixed(1)} % of the wind speed</b> ({$vessel.leewayPct != null ? 'your value' : lee.how}). <Hint title="Drift when stopped"><p><b>Drift when stopped</b> = current (read from Windy) + wind drift. Wind drift used:
    <b>{($vessel.leewayPct ?? lee.pct).toFixed(1)} % of the wind speed</b>
    ({$vessel.leewayPct != null ? 'your value' : lee.how}). It balances the wind on the area above water against the water on the
    area below (LOA × windage height against LBP × draft); high-sided ships and ships in ballast drift more. An
    <b>estimate</b>: it does not include wave drift (roughly 0.3–1 % more in a big sea). Ship type, Cb and windage height
    values in grey are typical figures, not your ship's: enter your own where you know them.</p></Hint></div>
<div class="pp-note g-hl">Propeller pitch: optional, only for slip. <Hint title="Propeller pitch and slip"><p><b>Propeller pitch</b> is optional. It is only used for slip: with the pitch entered, typing the <b>RPM</b> for a
    leg (Route tab) gives the speed at 0 slip automatically (pitch × RPM × 60 ÷ 1852), and the slip % is worked out
    from that. If you type the 0-slip speed for each leg yourself, leave the pitch empty.</p></Hint></div>

<div class="box">
    Roll period used for the warnings:
    {#if roll.value}
        <b class:est={roll.estimated}>{roll.value.toFixed(1)} s</b>
        {#if roll.estimated}
            <span class="est">estimated from GM (IS Code 2008, A/2.3; LBP used as waterline length). Often more than 10% out: enter a measured value if you have one.</span>
        {:else}
            (measured)
        {/if}
    {:else}
        <span class="pp-err">none: enter a measured roll period, or breadth, drafts, LBP and GM for an estimate.</span>
    {/if}
    {#if meanDraft != null}<div>Mean draft {meanDraft.toFixed(2)} m · trim {trim?.toFixed(2)} m {trim && trim > 0 ? 'by the stern' : trim && trim < 0 ? 'by the head' : ''}</div>{/if}
</div>

<h4>Ship profile file</h4>
<div class="pp-note g-hl">Kept in this browser; save a profile file for another computer. <Hint title="Ship profile"><p>These values are kept in this browser on this computer only. To use them on another computer, save the
    profile to a file (e.g. on a USB stick) and load it there.</p></Hint></div>
<button class="pp-btn" on:click={saveProfile}>Save ship profile…</button>
<button class="pp-btn pp-btn--ghost" on:click={loadProfile}>Load ship profile…</button>
<button class="pp-btn pp-btn--ghost" on:click={clearAll}>Clear everything saved in this browser</button>
{#if message}<div class="pp-note" class:pp-err={isError}>{message}</div>{/if}
<p class="pp-note">* needed for the IMO MSC.1/Circ.1228 checks.</p>

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import { get } from 'svelte/store';

    import { emptyVessel, type Vessel } from '../lib/model';
    import { estimateLeeway, SHIP_TYPES, shipTypeOf } from '../lib/shipTypes';
    import { rollPeriodFor } from '../lib/weather';
    import { clearSaved, thresholds, vessel } from '../state';
    import { downloadFile, pickFile } from './download';

    let message = '';
    let isError = false;

    $: roll = rollPeriodFor($vessel);
    $: type = shipTypeOf($vessel.shipType);
    $: lee = estimateLeeway($vessel);

    function setSigned(k: keyof Vessel, e: Event) {
        const s = (e.target as HTMLInputElement).value.trim();
        const n = s === '' ? null : Number(s);
        vessel.update(v => ({ ...v, [k]: n != null && isFinite(n) ? n : null }));
    }
    $: meanDraft = $vessel.draftFwd != null && $vessel.draftAft != null ? ($vessel.draftFwd + $vessel.draftAft) / 2 : null;
    $: trim = $vessel.draftFwd != null && $vessel.draftAft != null ? $vessel.draftAft - $vessel.draftFwd : null;

    function setSel(k: 'condition' | 'shipType', e: Event) {
        const v = (e.target as HTMLSelectElement).value;
        vessel.update(x => ({ ...x, [k]: v }));
    }

    function setNum(k: keyof Vessel, e: Event) {
        const s = (e.target as HTMLInputElement).value.trim();
        const n = s === '' ? null : Number(s);
        vessel.update(v => ({ ...v, [k]: n != null && isFinite(n) && n > 0 ? n : null, ...(k === 'rollPeriod' ? { rollPeriodDate: n != null && n > 0 ? Date.now() : null } : {}) }));
    }

    function saveProfile() {
        const v = get(vessel);
        const data = JSON.stringify({ kind: 'windy-passage-plan-ship-profile', version: 1, vessel: v, thresholds: get(thresholds) }, null, 2);
        downloadFile(data, 'application/json', `${(v.name || 'ship').replace(/[^\w\- ]+/g, '_')}-profile.json`);
        message = 'Profile saved (ship particulars and limits).';
        isError = false;
    }

    async function loadProfile() {
        const f = await pickFile('.json');
        if (!f) return;
        try {
            const obj = JSON.parse(new TextDecoder().decode(f.data));
            if (obj.kind !== 'windy-passage-plan-ship-profile') throw new Error('not a ship profile file');
            vessel.set({ ...emptyVessel(), ...obj.vessel });
            if (obj.thresholds) thresholds.set(obj.thresholds);
            message = `Loaded ${f.name}.`;
            isError = false;
        } catch (err) {
            message = `Could not load ${f.name}: ${(err as Error).message}`;
            isError = true;
        }
    }

    function clearAll() {
        if (!confirm('Clear the route, ship and limits saved in this browser?')) return;
        clearSaved();
        message = 'Cleared. Reload the page to start empty.';
        isError = false;
    }
</script>

<style lang="less">
    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 10px;
        label {
            display: flex;
            flex-direction: column;
            font-size: 11px;
        }
    }
    .box {
        background: rgba(255, 255, 255, 0.08);
        padding: 6px;
        border-radius: 4px;
        margin-top: 8px;
    }
    .est {
        color: #c8c8c8;
        font-style: italic;
    }
</style>
