<div class="g-card">
    <div class="g-card__head">
        <span class="g-card__title">Route</span>
        <Hint title="Route files and editing">
            <p>Opens <b>RTZ, RT3, GPX, Excel, CSV or text</b> route files and saves in the format chosen. RTZ is the safest choice for ECDIS.</p>
            <p><b>Drag</b> a waypoint to move it. <b>Right-click</b> a waypoint or a course line on the map for more options (insert, delete, change leg type).</p>
            <p>New legs are drawn as rhumb lines or great circles: the gear beside this (Route editing). Right-click on open water: port weather, tides or a waypoint there.</p>
        </Hint>
        <Gear host="route" chips={[{ id: 'route', label: 'Route editing' }, { id: 'map', part: 'ships', label: 'On the map: ships and colours' }]} />
        <div class="g-card__actions">
            <button class="pp-btn pp-btn--ghost small" on:click={() => dispatch('fit')} title="Zoom the map to the whole route"><Icon name="map" size={14} /> Show on map</button>
            <button class="pp-btn pp-btn--ghost small" on:click={newRouteClick} title="Start a new, empty route"><Icon name="filePlus" size={14} /> New</button>
        </div>
    </div>
    <div class="g-row">
        <button class="pp-btn g-btn--primary" on:click={() => fileInput.click()}><Icon name="folder" size={15} /> Open route file…</button>
        <input bind:this={fileInput} type="file" data-g="route-file" accept={IMPORT_ACCEPT} style="display:none" on:change={onFile} />
        <select bind:value={exportFormat} title="File type to save">
            {#each EXPORT_FORMATS as f}
                <option value={f.id}>{f.label}</option>
            {/each}
        </select>
        <button class="pp-btn" disabled={$route.waypoints.length < 2} on:click={save}><Icon name="save" size={15} /> Save</button>
    </div>
    <SettingsFold host="route" />
    {#if message}<div class="g-status" class:g-status--err={isError} class:g-status--ok={!isError}>{message}</div>{/if}
    {#if exportFormat === 'rt3'}
        <div class="g-status g-status--warn">RT3 export is untested on Navi-Sailor (no public format description). Check it on the ECDIS; RTZ is the safer choice.</div>
    {/if}
    <div class="grid">
        <label>Route name <input bind:value={$route.name} /></label>
        <label>Default calm-water speed (kn) <input type="number" step="0.1" min="0" bind:value={$route.defaultSpeed} /></label>
    </div>
    <div class="rt-add">
        <label class="check">
            <input type="checkbox" bind:checked={$addMode} />
            Add waypoints by clicking the map (adds to the end of the route)
        </label>
        <Gear host="route-add" line chips={[{ id: 'route' }]} />
    </div>
    <p class="g-phone-note">Clicking the map needs the map on screen. On a phone Windy shows the plugin over the whole screen (the map is hidden while it is open): add or change waypoints in the table below, or open a route file.</p>
    <SettingsFold host="route-add" />
</div>

<div class="g-card" data-g="times-card">
    <div class="g-card__head">
        <span class="g-card__title">Times (UTC)</span>
        <Hint title="Times">
            <p>All times are <b>UTC</b>. <b>Speed per leg → ETA</b>: you give the speeds, the plugin works out the ETAs. <b>ETD + ETA → required speed</b>: you give both times, the plugin works out the speed needed.</p>
            <p>Windy's <b>← / →</b> keys step the forecast time; the ships and weather on the map move with it.</p>
            <p>You can also fix an ETA at any waypoint in the table (📌).</p>
        </Hint>
    </div>
    <div class="grid">
        <label
            >Plan by
            <select bind:value={$route.mode}>
                <option value="speed">Speed per leg → ETA</option>
                <option value="eta">ETD + ETA → required speed</option>
            </select>
        </label>
        <div class="field">ETD at WP1 (UTC, 24 h) <DateTimeField value={$route.etd} on:change={e => setTime('etd', e.detail)} /></div>
        {#if $route.mode === 'eta'}
            <div class="field">ETA at last WP (UTC, 24 h) <DateTimeField value={$route.eta} on:change={e => setTime('eta', e.detail)} /></div>
        {/if}
    </div>
    <div class="summary">
        <b>{$plan.totalNm.toFixed(1)} nm</b> · {fmtDuration($plan.totalHours)} steaming{#if $plan.totalDelayH}{` + ${fmtDuration($plan.totalDelayH)} stopped`}{/if}
        {#if $sim.totalFuelT != null}· fuel <b>{$sim.totalFuelT.toFixed(1)} t</b>{/if}
        {#if $plan.requiredSog != null}· average SOG needed <b>{$plan.requiredSog.toFixed(2)} kn</b>{/if}
        {#if $plan.eta != null}
            · ETA <b>{fmtTime($plan.eta)} UTC</b>
        {/if}
        {#each $plan.problems as p}<div class="pp-err">{p}</div>{/each}
    </div>
</div>

{#if $route.voyage}
    <!-- a voyage is running: the present position is the daily job, so it comes first -->
    <VoyagePanel />
{/if}

<div class="g-card">
    <div class="g-card__head">
        <span class="g-card__title">Waypoints</span>
        <Hint title="How the numbers are worked out">
            <p>Distances: WGS84 ellipsoid, waypoint to waypoint, no turn radius, so they can differ slightly from the ECDIS.</p>
            <p>Speeds are calm-water speeds less your allowance (or the weather estimate). Currents are added only if switched on. Both: the gear beside this (Speed, RPM and fuel).</p>
            <p>Click an <b>ETA</b> to fix the time at that waypoint (📌): the speeds before it are scaled to arrive then (→ in the SiCW column), and the later ETAs and weather follow.</p>
            <p>Right-click a waypoint on the map for options.</p>
            <p><b>Undo / redo</b>: Ctrl+Z (⌘Z on a Mac) takes back the last change of the route (a waypoint dragged, added or deleted, a speed, a time…), as many times as you like; Ctrl+Y (⌘⇧Z) puts it back again. Not kept after a reload.</p>
        </Hint>
        <Gear host="wps" chips={[{ id: 'speed', part: 'table', label: 'RPM / speed / fuel table' }, { id: 'speed', part: 'loss', label: 'Weather loss and currents' }, { id: 'route', label: 'Route editing' }, { id: 'ship', part: 'particulars', label: 'Ship (propeller pitch)' }]} />
        <div class="g-card__actions">
            <!-- undo / redo of route changes, no limit (owner, 2026-11-23) -->
            <button class="pp-btn pp-btn--ghost small rt-undo" disabled={!$historyCount.undo} on:click={() => { if (undo()) logEvent('route', 'Undo (button)'); }} title={`Undo the last change of the route (Ctrl+Z / ⌘Z) · ${$historyCount.undo} step(s) back`}>↶ Undo</button>
            <button class="pp-btn pp-btn--ghost small rt-redo" disabled={!$historyCount.redo} on:click={() => { if (redo()) logEvent('route', 'Redo (button)'); }} title={`Redo (Ctrl+Y / ⌘⇧Z) · ${$historyCount.redo} step(s) forward`}>↷ Redo</button>
            <button class="pp-btn pp-btn--ghost small" disabled={!$route.waypoints.length} on:click={() => (fullTable = true)} title="Show the whole table over the map"><Icon name="expand" size={14} /> Full-size table</button>
        </div>
    </div>
    <SettingsFold host="wps" />
    <WaypointTable onMessage={showMessage} />
    {#if $route.waypoints.length === 0}
        <div class="g-empty">
            <Icon name="route" size={30} />
            <p>No route yet. Open an RTZ, RT3, GPX, Excel, CSV or text file from the ECDIS, or add waypoints by clicking the map.</p>
            <button class="pp-btn g-btn--primary" on:click={() => fileInput.click()}><Icon name="folder" size={15} /> Open route file…</button>
            <button class="pp-btn" class:pp-on={$addMode} on:click={() => addMode.update(x => !x)}><Icon name="crosshair" size={15} /> {$addMode ? 'Clicking the map adds waypoints' : 'Add waypoints on the map'}</button>
        </div>
    {/if}
</div>

{#if !$route.voyage}
    <VoyagePanel />
{/if}

{#if fullTable}
    <Overlay key="waypointtable" onClose={() => (fullTable = false)}>
        <svelte:fragment slot="head"><b>{$route.name}</b> · {$route.waypoints.length} waypoints · {$plan.totalNm.toFixed(1)} nm
            {#if $plan.eta != null}· ETA {fmtTime($plan.eta)} UTC{/if}</svelte:fragment>
        <div class="pp-scroll" style="flex:1;min-height:0">
            <WaypointTable full onMessage={showMessage} />
        </div>
    </Overlay>
{/if}

<script lang="ts">
    import Gear from './base/Gear.svelte';
    import SettingsFold from './settings/SettingsFold.svelte';
    import Hint from './base/Hint.svelte';
    import Overlay from './Overlay.svelte';
    import Icon from './base/Icon.svelte';
    import { createEventDispatcher, onDestroy } from 'svelte';
    import { get } from 'svelte/store';

    import { EXPORT_FORMATS, IMPORT_ACCEPT, exportRoute, importRoute, type ExportFormat } from '../lib/formats';
    import { fmtDuration, fmtTime } from '../lib/format';
    import { newRoute, type Route } from '../lib/model';
    import { bvsShipInfo } from '../lib/formats/bvs';
    import { addMode, plan, route, selectedUids, sim, thresholds, updateRoute, vessel } from '../state';
    import { downloadFile } from './download';
    import WaypointTable from './WaypointTable.svelte';
    import { logEvent } from '../lib/activityLog';
    import { historyCount, redo, undo } from '../routeHistory';
    import DateTimeField from './DateTimeField.svelte';
    import VoyagePanel from './VoyagePanel.svelte';

    const dispatch = createEventDispatcher<{ fit: void }>();
    let fileInput: HTMLInputElement;
    let exportFormat: ExportFormat = 'rtz';
    let message = '';
    let isError = false;
    let fullTable = false;


    function showMessage(text: string, err: boolean) {
        message = text;
        isError = err;
    }

    onDestroy(() => (fullTable = false));

    async function onFile(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
            const data = new Uint8Array(await file.arrayBuffer());
            const r = importRoute(file.name, data);
            const prev = get(route);
            if (r.etd == null) r.etd = prev.etd;
            route.set(r);
            selectedUids.set([]);
            const skipped = (r.source as { skippedRows?: number[] } | undefined)?.skippedRows ?? [];
            const shipNote = offerShipInfo(r);
            showMessage(`Opened ${file.name}: ${r.waypoints.length} waypoints${skipped.length ? `, ${skipped.length} lines without a position skipped` : ''}.${shipNote}`, false);
            dispatch('fit');
        } catch (err) {
            showMessage(`Could not open ${file.name}: ${(err as Error).message}`, true);
        }
    }

    function save() {
        try {
            const f = exportRoute(exportFormat, get(route), get(plan), { vessel: get(vessel), thresholds: get(thresholds) });
            downloadFile(f.data, f.mime, f.name);
            showMessage(`Saved ${f.name}. Check it ${exportFormat === 'bvs' ? 'in BVS' : 'on the ECDIS'} before use.`, false);
        } catch (err) {
            showMessage(`Could not save: ${(err as Error).message}`, true);
        }
    }

    /** BVS files carry ship particulars and IMO warning heights: offer to copy them in. */
    function offerShipInfo(r: Route): string {
        const info = bvsShipInfo(r);
        if (!info) return '';
        const v = info.vessel;
        const rs = info.resonance;
        const list = [
            v.name && `ship ${v.name}`,
            v.lbp != null && `length ${v.lbp} m (used as LBP)`,
            v.breadth != null && `beam ${v.breadth} m`,
            v.draftFwd != null && `drafts ${v.draftFwd}/${v.draftAft} m`,
            v.gm != null && `GM ${v.gm} m`,
            v.rollPeriod != null && `roll period ${v.rollPeriod} s`,
            Object.keys(rs).length && `IMO warning wave heights (parametric ${rs.parametric ?? '-'}, synchronous ${rs.synchronous ?? '-'}, high waves ${rs.highWaves ?? '-'}, broaching ${rs.broaching ?? '-'} m)`,
        ].filter(Boolean);
        if (!list.length || !confirm(`This BVS file also contains:\n\n${list.join('\n')}\n\nCopy these into Settings (Ship particulars, Weather limits)?`)) return '';
        vessel.update(x => ({ ...x, ...v }));
        thresholds.update(t => ({ ...t, resonance: { ...t.resonance, ...rs } }));
        return ' Ship particulars and IMO warning heights copied from the file: check Settings (Ship particulars, Weather limits).';
    }

    function newRouteClick() {
        if (get(route).waypoints.length && !confirm('Start a new, empty route? The current route will be cleared.')) return;
        const r = newRoute();
        r.defaultSpeed = get(route).defaultSpeed;
        route.set(r);
        selectedUids.set([]);
        addMode.set(true);
        showMessage('New route: click the map to add waypoints.', false);
    }

    function setTime(which: 'etd' | 'eta', v: number | null) {
        updateRoute(r => {
            r[which] = v;
        });
    }
</script>

<style lang="less">
    .rt-add {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        margin-bottom: 4px;
    }
    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 10px;
        margin: 6px 0;
        label,
        .field {
            display: flex;
            flex-direction: column;
            font-size: 11px;
            opacity: 0.95;
        }
    }
    .check {
        display: block;
        margin: 6px 0;
    }
    .summary {
        background: var(--g-bg-2);
        padding: 8px 10px;
        border-radius: 6px;
        margin-top: 10px;
        color: var(--g-text-2);
    }
    .small {
        font-size: 11px;
        padding: 1px 6px;
    }
    .tip {
        background: rgba(255, 255, 255, 0.06);
        border-left: 3px solid #ffd400;
        padding: 4px 6px;
        border-radius: 3px;
    }
</style>
