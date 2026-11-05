<div class="g-card">
    <div class="g-card__head">
        <span class="g-card__title">Route</span>
        <Hint title="Route files and editing">
            <p>Opens <b>RTZ, RT3, GPX, Excel, CSV or text</b> route files and saves in the format chosen. RTZ is the safest choice for ECDIS.</p>
            <p><b>Drag</b> a waypoint to move it. <b>Right-click</b> a waypoint or a course line on the map for more options (insert, delete, change leg type).</p>
            <p>New legs are drawn as rhumb lines or great circles as set in Settings → Route editing.</p>
        </Hint>
        <div class="g-card__actions">
            <button class="pp-btn pp-btn--ghost small" on:click={() => dispatch('fit')} title="Zoom the map to the whole route"><Icon name="map" size={14} /> Show on map</button>
            <button class="pp-btn pp-btn--ghost small" on:click={newRouteClick} title="Start a new, empty route"><Icon name="filePlus" size={14} /> New</button>
        </div>
    </div>
    <div class="g-row">
        <button class="pp-btn g-btn--primary" on:click={() => fileInput.click()}><Icon name="folder" size={15} /> Open route file…</button>
        <input bind:this={fileInput} type="file" accept={IMPORT_ACCEPT} style="display:none" on:change={onFile} />
        <select bind:value={exportFormat} title="File type to save">
            {#each EXPORT_FORMATS as f}
                <option value={f.id}>{f.label}</option>
            {/each}
        </select>
        <button class="pp-btn" disabled={$route.waypoints.length < 2} on:click={save}><Icon name="save" size={15} /> Save</button>
    </div>
    {#if message}<div class="g-status" class:g-status--err={isError} class:g-status--ok={!isError}>{message}</div>{/if}
    {#if exportFormat === 'rt3'}
        <div class="g-status g-status--warn">RT3 export is untested on Navi-Sailor (no public format description). Check it on the ECDIS; RTZ is the safer choice.</div>
    {/if}
    <div class="grid">
        <label>Route name <input bind:value={$route.name} /></label>
        <label>Default calm-water speed (kn) <input type="number" step="0.1" min="0" bind:value={$route.defaultSpeed} /></label>
    </div>
    <label class="check">
        <input type="checkbox" bind:checked={$addMode} />
        Add waypoints by clicking the map (adds to the end of the route)
    </label>
</div>

<div class="g-card">
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

<VoyagePanel />

<div class="g-card">
    <div class="g-card__head">
        <span class="g-card__title">Waypoints</span>
        <Hint title="How the numbers are worked out">
            <p>Distances: WGS84 ellipsoid, waypoint to waypoint, no turn radius, so they can differ slightly from the ECDIS.</p>
            <p>Speeds are calm-water speeds less your allowance (or the weather estimate chosen in Settings). Currents are added only if switched on in Settings → Speed, RPM and fuel.</p>
            <p>Click an <b>ETA</b> to fix the time at that waypoint (📌): the speeds before it are scaled to arrive then (→ in the SiCW column), and the later ETAs and weather follow.</p>
            <p>Right-click a waypoint on the map for options.</p>
        </Hint>
        <div class="g-card__actions">
            <button class="pp-btn pp-btn--ghost small" disabled={!$route.waypoints.length} on:click={() => (fullTable = true)} title="Show the whole table over the map"><Icon name="expand" size={14} /> Full-size table</button>
        </div>
    </div>
    <WaypointTable onMessage={showMessage} />
    {#if $route.waypoints.length === 0}
        <div class="g-empty"><Icon name="route" size={30} /><p>No route yet. Open an RTZ, RT3, GPX, Excel, CSV or text file, or tick "Add waypoints by clicking the map".</p></div>
    {/if}
</div>

{#if fullTable}
    <div class="pp pp-overlay" use:portal>
        <div class="pp-overlay__head">
            <b>{$route.name}</b> · {$route.waypoints.length} waypoints · {$plan.totalNm.toFixed(1)} nm
            {#if $plan.eta != null}· ETA {fmtTime($plan.eta)} UTC{/if}
            <button class="pp-btn" on:click={() => (fullTable = false)}>Close ✕</button>
        </div>
        <div class="pp-overlay__body pp-scroll">
            <WaypointTable full onMessage={showMessage} />
        </div>
    </div>
{/if}

<script lang="ts">
    import Hint from './base/Hint.svelte';
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

    /** Move an element to <body> so it can cover the whole window (outside Windy's side panel). */
    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (fullTable = false);
        document.addEventListener('keydown', onKey);
        return {
            destroy() {
                document.removeEventListener('keydown', onKey);
                node.remove();
            },
        };
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
        if (!list.length || !confirm(`This BVS file also contains:\n\n${list.join('\n')}\n\nCopy these into ⚙ Settings (Ship particulars, Weather limits)?`)) return '';
        vessel.update(x => ({ ...x, ...v }));
        thresholds.update(t => ({ ...t, resonance: { ...t.resonance, ...rs } }));
        return ' Ship particulars and IMO warning heights copied from the file: check ⚙ Settings (Ship particulars, Weather limits).';
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
    .pp-overlay {
        position: fixed;
        inset: 40px;
        z-index: 99999;
        background: rgb(35, 35, 35);
        color: #eee;
        border-radius: 8px;
        box-shadow: 0 6px 30px rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        padding: 10px;
        font-size: 12px;
    }
    .pp-overlay__head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        button {
            margin-left: auto;
        }
    }
    .pp-overlay__body {
        flex: 1;
        min-height: 0;
    }
    .tip {
        background: rgba(255, 255, 255, 0.06);
        border-left: 3px solid #ffd400;
        padding: 4px 6px;
        border-radius: 3px;
    }
</style>
