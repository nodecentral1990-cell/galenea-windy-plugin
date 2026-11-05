<!-- Route optimisation for least fuel within your weather limits (owner, 2026-10-27). -->
<!-- Two ways (owner, 2026-10-30): change the track (route optimisation) or keep it and change the speed (safe speed plan) -->
{#if mode === 'speed'}
    <SpeedPlanPanel {onSettings} />
{:else}
    <div class="g-card">
    <div class="g-card__head">
        <span class="g-card__title">Change the track (least fuel)</span>
        <span class="g-chip">advisory</span>
        <Hint title="What the optimiser does and does not do" width={360}>
            <p>Finds the track and the speed on each leg that <b>use the least fuel and still arrive on time</b>, keeping out of your red weather limits (Settings → Weather limits). Method: dynamic programming over a grid of possible tracks (no AI model).</p>
            <p>Weather: ECMWF + ECMWF-WAM forecast; fuel from your speed / fuel table; weather slowing the ship as in the weather table.</p>
            <p><b>Not included: currents, depths, traffic separation, routeing measures.</b> Land is checked on a coarse world map (about 6 nm squares). It does not replace official weather routing.</p>
        </Hint>
        <div class="g-card__actions"><button class="pp-btn pp-btn--ghost small" on:click={() => openSettings('optimise')} title="Optimisation settings"><Icon name="sliders" size={14} /> Optimisation settings</button></div>
    </div>
    <div class="g-status g-status--warn"><Icon name="warn" size={14} /> Check any optimised route on ECDIS before use.</div>

    {#if $route.waypoints.length < 2}
        <div class="g-empty"><Icon name="route" size={30} /><p>Make a route first (Route → Waypoints).</p></div>
    {:else}
        <div class="grid">
            <label
                >Optimise from
                <select bind:value={a}>
                    {#each $route.waypoints as w, i}{#if i < $route.waypoints.length - 1}<option value={i}>WP{i + 1}{w.name ? ' ' + w.name : ''}</option>{/if}{/each}
                </select>
            </label>
            <label
                >to
                <select bind:value={b}>
                    {#each $route.waypoints as w, i}{#if i > a}<option value={i}>WP{i + 1}{w.name ? ' ' + w.name : ''}</option>{/if}{/each}
                </select>
            </label>
        </div>
        <div class="pp-note">
            Departs WP{a + 1} <b>{fmtTime(times.etd)} UTC</b> as planned.
            <Hint title="Which part to optimise"><p>Waypoints before WP{a + 1} and after WP{b + 1} stay as they are: pick the open-sea part (e.g. from the pilot station or the end of a coastal stretch to the landfall).</p></Hint>
        </div>
        <label class="check"><input type="checkbox" bind:checked={ownEta} /> Arrive at WP{b + 1} by a time I choose (otherwise the planned {fmtTime(times.eta)} UTC)</label>
        {#if ownEta}
            <div class="eta">Arrive by (UTC) <DateTimeField value={etaOwn ?? times.eta} clearable={false} on:change={e => (etaOwn = e.detail)} /></div>
        {/if}
        <div class="row">
            <button class="pp-btn g-btn--primary" disabled={$optBusy || times.etd == null} on:click={() => runOptimise(a, b, ownEta ? (etaOwn ?? times.eta) : null)}><Icon name="bolt" size={15} /> Optimise route</button>
            {#if times.etd == null}<span class="g-status g-status--warn">Set the ETD first (Route → Waypoints).</span>{/if}
        </div>
        {#if $optStatus}<p class="status">{$optStatus}</p>{/if}

        {#if o}
            {#if stale}<p class="stale">The route has changed since this result: optimise again before taking a version.</p>{/if}
            <div class="row">
                <b>Versions</b>
                <Hint title="Reading the versions" width={360}>
                    <p><b>Your route</b> and the GC / RL / composite versions are sailed at <b>one speed</b> that meets the same arrival time; the first optimised row changes speed leg by leg as found.</p>
                    <p>Fuel = your table's fuel per day × hours, weather included (an estimate). <b>Composite</b> = each leg keeps the rhumb line or great circle you chose for that part of your own route.</p>
                    <p>Roll / pitch: the largest estimate on the way, for comparison. With a roll mark set (Settings → Roll and pitch) and "keep out of roll above your mark" on (Settings → Route optimisation), the search checks the roll on the route it found, leaves out the places above the mark and searches again (up to 3 times).</p>
                </Hint>
                <button class="pp-btn pp-btn--ghost small" on:click={() => (fullTable = true)} title="Show the whole table over the map"><Icon name="expand" size={14} /> Full-size table</button>
            </div>
            <OptimiseTable {o} {bestId} {hidden} {stale} onToggle={toggleLine} onTake={take} onCompare={compare} />
            {#if o.res.notes.length}<ul class="notes">{#each o.res.notes as n}<li>{n}</li>{/each}</ul>{/if}
            {#if o.runInfo}<div class="g-prov run"><Icon name="calendar" size={14} /> <span>Weather data: {o.runInfo.air} · waves {o.runInfo.waves} · fetched {o.runInfo.fetched} · {o.points} forecast points over the search area</span></div>{/if}
            {#if fullTable}
                <Overlay onClose={() => (fullTable = false)}>
                    <b slot="head">Optimised routes WP{o.a + 1} → WP{o.b + 1} · times UTC</b>
                    <OptimiseTable full {o} {bestId} {hidden} {stale} onToggle={toggleLine} onTake={take} onCompare={compare} />
                </Overlay>
            {/if}
        {/if}
    {/if}
    </div>
{/if}

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import { onDestroy } from 'svelte';

    import { fmtTime } from '../lib/format';
    import { applyVersion, stretchTimes, type RouteVersion, type VersionId } from '../lib/optimisePlan';
    import { addToCompare, plan, route } from '../state';
    import { optBusy, optOutcome, optStatus, routeKey, runOptimise, takeVersion } from '../windy/optimiseJob';
    import { showPreview } from '../windy/previewLayer';
    import DateTimeField from './DateTimeField.svelte';
    import OptimiseTable from './OptimiseTable.svelte';
    import Overlay from './Overlay.svelte';
    import SpeedPlanPanel from './SpeedPlanPanel.svelte';
    /** Which part is shown (segments in the Optimise section, 2026-11-02) */
    export let mode: 'route' | 'speed' = 'speed';
    import { openSettingsSection } from './SettingsTab.svelte';

    /** Opens a Settings group (the plugin switches to the Settings tab) */
    export let onSettings: (() => void) | null = null;

    let a = 0;
    let b = Math.max(1, $route.waypoints.length - 1);
    $: if (b <= a || b > $route.waypoints.length - 1) b = $route.waypoints.length - 1;
    $: if (a > $route.waypoints.length - 2) a = Math.max(0, $route.waypoints.length - 2);
    let ownEta = false;
    let etaOwn: number | null = null;
    $: times = stretchTimes($plan, a, b);

    $: o = $optOutcome;
    $: stale = !!o && o.key !== keyOf($route);
    const keyOf = (_r: unknown) => routeKey();
    $: bestId = o ? (o.versions.filter(v => v.id !== 'planned' && v.ev.breachH === 0 && v.ev.eta <= o.eta + 61 * 60e3).sort((x, y) => x.ev.fuel - y.ev.fuel)[0]?.id ?? null) : null;

    let hidden = new Set<string>();
    let fullTable = false;
    function toggleLine(id: string) {
        hidden = new Set(hidden.has(id) ? [...hidden].filter(x => x !== id) : [...hidden, id]);
        if (o && !o.taken) showPreview(o.versions, hidden);
    }
    onDestroy(() => showPreview([]));
    // back on this tab with a result not yet taken: draw the lines again
    $: if (o && !o.taken && !stale) showPreview(o.versions, hidden);

    function take(v: RouteVersion) {
        if (!confirm(`Replace WP${o!.a + 2}…WP${o!.b} of your route with "${v.label}" (${v.wps.length - 2} new waypoints)? WP${o!.a + 1} and WP${o!.b + 1} stay. Check the new route on ECDIS.`)) return;
        takeVersion(v.id as VersionId);
    }
    function compare(v: RouteVersion) {
        const r = $route;
        addToCompare({ ...r, name: `${r.name} (${v.label})`, waypoints: applyVersion(r, o!.a, o!.b, v), voyage: null });
        optStatus.set(`"${v.label}" added to the Compare tab.`);
    }
    function openSettings(id: string) {
        openSettingsSection(id);
        onSettings?.();
    }

</script>

<style lang="less">
    .modes {
        display: flex;
        gap: 4px;
        margin-bottom: 8px;
        button {
            flex: 1;
            padding: 6px;
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.06);
            color: inherit;
            cursor: pointer;
            font-size: 12px;
            &.active {
                background: #2f6fd6;
                border-color: #2f6fd6;
                color: #fff;
                font-weight: bold;
            }
        }
    }
    .grid {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }
    .row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        margin: 8px 0;
    }
    .eta {
        margin: 4px 0 4px 22px;
    }
    .status {
        color: #9fd3ff;
        margin: 4px 0;
    }
    .stale {
        color: #ffd28a;
    }
    .notes {
        font-size: 11px;
        opacity: 0.85;
        margin: 4px 0;
        padding-left: 18px;
    }
    .run {
        font-size: 10px;
        color: #9fd3ff;
    }
</style>
