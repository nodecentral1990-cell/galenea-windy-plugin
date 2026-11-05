<!-- Route › Distances (owner, 2026-11-02, point 8): port-to-port distances (great circle, rhumb line, along the sea
     lanes, canals passed) and the ports / canals / straits near the planned route, all shown on the map. -->
<div class="g-card">
    <div class="g-card__head">
        <span class="g-card__title">Port to port</span>
        <Hint title="Port-to-port distances">
            <p><b>Great circle</b> = shortest on the globe; <b>rhumb line</b> = constant course. Both straight from place to place, over land if it is in the way.</p>
            <p><b>Sea lanes</b> = along a network of shipping lanes (Eurostat SeaRoute / MARNET, EUPL-1.2), with canals and straits, so it goes round land. <b>Approximate</b>: built for statistics, not for navigation; real distances depend on the routeing, pilot stations and the berth.</p>
            <p>Port positions are approximate (open "sea-ports" list, MIT licence; about 1,600 ports). Pilot boarding places and traffic separation schemes: switch on the OpenSeaMap seamarks (Settings → Nautical charts and places).</p>
        </Hint>
        <div class="g-card__actions">
            <button class="g-btn g-btn--s" disabled={!rows.length} on:click={() => exportRows('xlsx')} title="Download as Excel"><Icon name="download" size={14} /> Excel</button>
            <button class="g-btn g-btn--s" disabled={!rows.length} on:click={() => exportRows('csv')}>CSV</button>
        </div>
    </div>
    <div class="ds-pick">
        <PlacePicker label="From" bind:place={from} {routeEnds} />
        <button class="g-ibtn ds-swap" title="Swap" aria-label="Swap from and to" on:click={swap}>⇄</button>
        <PlacePicker label="To" bind:place={to} {routeEnds} />
        <button class="g-btn g-btn--primary ds-add" disabled={!from || !to || busy} on:click={add}><Icon name="plus" size={15} /> Add</button>
    </div>
    {#if status}<div class="g-status" class:g-status--warn={statusWarn}>{status}</div>{/if}
    {#if rows.length}
        <div class="pp-scroll ds-tw">
            <table class="ds-tbl">
                <thead>
                    <tr>
                        <th><input type="checkbox" checked={sel.size === rows.length} on:change={allSel} title="Select all" aria-label="Select all" /></th>
                        <th>From</th><th>To</th>
                        <th class="g num" title="Great circle">GC nm</th><th class="num" title="Rhumb line">RL nm</th>
                        <th class="g num" title="Along the sea lanes (approximate)">Sea lanes nm</th><th>Via</th>
                        <th class="g num" title="Days at {speed} kn along the sea lanes">Days @ {speed} kn</th>
                    </tr>
                </thead>
                <tbody>
                    {#each rows as r, i}
                        <tr class:on={sel.has(i)} on:click={e => rowClick(i, e)} title="Click to show on the map; Ctrl/⌘-click to select several">
                            <td><input type="checkbox" checked={sel.has(i)} on:click|stopPropagation={() => toggle(i)} aria-label="Select row" /></td>
                            <td>{r.from}</td><td>{r.to}</td>
                            <td class="g num">{r.gcNm.toFixed(0)}</td><td class="num">{r.rlNm.toFixed(0)}</td>
                            <td class="g num"><b>{r.sea ? r.sea.distNm.toFixed(0) : '—'}</b></td>
                            <td class="via">{r.sea?.via.join(' · ') || '—'}</td>
                            <td class="g num">{r.sea && speed > 0 ? (r.sea.distNm / speed / 24).toFixed(1) : '—'}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <div class="g-row ds-actions">
            <button class="g-btn g-btn--s" on:click={() => show([...sel].length ? [...sel] : rows.map((_, i) => i))}><Icon name="map" size={14} /> Show on map</button>
            <button class="g-btn g-btn--s" disabled={sel.size !== 1 || !rows[[...sel][0]]?.sea} on:click={makeRoute} title="Make a new route along the sea lanes for the selected row (then check it on ECDIS)"><Icon name="route" size={14} /> Make a route of it</button>
            <button class="g-btn g-btn--s g-btn--danger" disabled={!sel.size} on:click={del}><Icon name="trash" size={14} /> Delete ({sel.size})</button>
            <button class="g-btn g-btn--s g-btn--ghost" on:click={clearMap}><Icon name="eyeOff" size={14} /> Clear map</button>
        </div>
        <div class="pp-note">Tick, or Ctrl/⌘-click, to select several. Map: <span class="k k--gc">GC</span> dashed · <span class="k k--rl">RL</span> dotted · <span class="k k--sea">sea lanes</span> solid.</div>
    {:else}
        <p class="pp-note">Pick two ports (type a name or UN/LOCODE, e.g. "Rotterdam" or "NLRTM"), or the start / end of your route, and press Add.</p>
    {/if}
</div>

<div class="g-card">
    <div class="g-card__head">
        <span class="g-card__title">Along my route</span>
        <Hint title="Places along the route">
            <p>Ports within {portNm} nm of the planned track and the canals, straits and capes it passes, in order, with the distance from the first waypoint, the distance to go and the ETA at the planned speeds (UTC).</p>
            <p>Positions are approximate: a guide to where you are, not a pilot book.</p>
        </Hint>
        <div class="g-card__actions">
            <label class="ds-within">within <select bind:value={portNm}>{#each [10, 25, 50, 100] as n}<option value={n}>{n} nm</option>{/each}</select></label>
        </div>
    </div>
    {#if !$plan.legs.length}
        <p class="pp-note">Make a route first (Waypoints).</p>
    {:else if !along.length}
        <p class="pp-note">No ports, canals or straits within {portNm} nm of the route.</p>
    {:else}
        <div class="pp-scroll ds-tw">
            <table class="ds-tbl">
                <thead>
                    <tr><th>Place</th><th>Type</th><th class="g num">From start nm</th><th class="num">To go nm</th><th class="num">Off track nm</th><th class="g">ETA (UTC)</th></tr>
                </thead>
                <tbody>
                    {#each along as p}
                        <tr on:click={() => map.panTo([p.lat, p.lon])} title="Click to centre the map here">
                            <td>{p.name}{p.code ? ` (${p.code})` : ''}</td>
                            <td><span class="g-chip" class:g-chip--info={p.kind !== 'port'}>{p.kind}</span></td>
                            <td class="g num">{p.alongNm.toFixed(0)}</td>
                            <td class="num">{p.toGoNm.toFixed(0)}</td>
                            <td class="num">{p.offNm.toFixed(0)}</td>
                            <td class="g mono">{p.etaMs != null ? fmtTime(p.etaMs) : '—'}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <div class="g-row ds-actions">
            <button class="g-btn g-btn--s" on:click={() => placesLayers.update(c => ({ ...c, ports: true, canals: true }))}><Icon name="anchor" size={14} /> Show ports and canals on the map</button>
        </div>
    {/if}
    <div class="g-prov"><Icon name="info" size={14} /> Approximate, for planning and orientation only: not for navigation. Sea lanes: Eurostat SeaRoute / MARNET. Ports: sea-ports list. Distances worked out by the plugin.</div>
</div>

<script lang="ts">
    import { map } from '@windy/map';
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import PlacePicker, { type Place } from './PlacePicker.svelte';
    import { placesAlongRoute } from '../lib/distances';
    import { distanceRow } from '../lib/seaNet';
    import { fmtTime } from '../lib/format';
    import { logEvent } from '../lib/activityLog';
    import { writeXlsx } from '../lib/formats/xlsx';
    import { writeCsv } from '../lib/formats/table';
    import { downloadFile } from './download';
    import { newRoute, newWaypoint } from '../lib/model';
    import { placesLayers, plan, route } from '../state';
    import { clearDistances, drawDistances } from '../windy/placesLayer';
    import { DIST_ROWS } from './distanceState';

    let from: Place | null = null;
    let to: Place | null = null;
    let busy = false;
    let status = '';
    let statusWarn = false;
    let portNm = 25;
    let sel = new Set<number>();

    $: rows = $DIST_ROWS.map(x => x.row);
    $: speed = $route.defaultSpeed || 12;
    $: routeEnds = $route.waypoints.length >= 2 ? { first: $route.waypoints[0], last: $route.waypoints[$route.waypoints.length - 1] } : null;
    $: along = $plan.legs.length ? placesAlongRoute($plan, portNm) : [];

    function swap() {
        [from, to] = [to, from];
    }
    async function add() {
        if (!from || !to) return;
        busy = true;
        status = 'Working out…';
        await new Promise(r => setTimeout(r, 20));
        try {
            const t0 = performance.now();
            const r = distanceRow(from.name, from, to.name, to);
            DIST_ROWS.update(l => [...l, { row: r, a: { ...from! }, b: { ...to! } }]);
            statusWarn = !r.sea;
            status = r.sea
                ? `${from.name} → ${to.name}: ${r.sea.distNm.toFixed(0)} nm along the sea lanes${r.sea.via.length ? ` via ${r.sea.via.join(', ')}` : ''} (${((performance.now() - t0) / 1000).toFixed(1)} s).`
                : 'No way along the sea lanes was found: only the great-circle and rhumb-line distances are shown.';
            logEvent('distance', status);
            show([$DIST_ROWS.length - 1]);
        } finally {
            busy = false;
        }
    }
    function show(idx: number[]) {
        const l = $DIST_ROWS;
        drawDistances(
            idx.map(i => l[i].row),
            idx.map(i => ({ a: l[i].a, b: l[i].b })),
        );
    }
    function clearMap() {
        clearDistances();
    }
    function toggle(i: number) {
        sel = new Set(sel.has(i) ? [...sel].filter(x => x !== i) : [...sel, i]);
    }
    function rowClick(i: number, e: MouseEvent) {
        if (e.ctrlKey || e.metaKey) toggle(i);
        else {
            sel = new Set([i]);
            show([i]);
        }
    }
    function allSel() {
        sel = sel.size === rows.length ? new Set() : new Set(rows.map((_, i) => i));
    }
    function del() {
        DIST_ROWS.update(l => l.filter((_, i) => !sel.has(i)));
        sel = new Set();
        clearDistances();
    }
    function makeRoute() {
        const i = [...sel][0];
        const d = $DIST_ROWS[i];
        if (!d?.row.sea) return;
        if ($route.waypoints.length && !confirm(`Replace the route in the Waypoints view ("${$route.name}") with a route along the sea lanes from ${d.a.name} to ${d.b.name}? Save your route first if you need it.`)) return;
        const pts = simplify(d.row.sea.path, 8);
        const r = newRoute(`${d.a.name} – ${d.b.name}`);
        r.waypoints = pts.map((p, k) => newWaypoint(p.lat, ((((p.lon + 180) % 360) + 360) % 360) - 180, 'RL', k === 0 ? d.a.name : k === pts.length - 1 ? d.b.name : ''));
        r.defaultSpeed = $route.defaultSpeed;
        route.set(r);
        status = `New route with ${pts.length} waypoints along the sea lanes. Approximate: check and adjust it on ECDIS (traffic separation, pilot stations, depths).`;
        statusWarn = true;
        logEvent('distance', `Route made from the sea lanes: ${d.a.name} – ${d.b.name}, ${pts.length} waypoints`);
    }
    /** Fewer points: Douglas–Peucker on a flat projection (tolerance in nm, roughly) */
    function simplify(path: { lat: number; lon: number }[], tolNm: number): { lat: number; lon: number }[] {
        if (path.length < 3) return path;
        const keep = new Uint8Array(path.length);
        keep[0] = keep[path.length - 1] = 1;
        const xy = path.map(p => [p.lon * 60 * Math.cos((p.lat * Math.PI) / 180), p.lat * 60]);
        const stack: [number, number][] = [[0, path.length - 1]];
        while (stack.length) {
            const [a, b] = stack.pop() as [number, number];
            let best = -1;
            let bd = tolNm;
            const [x1, y1] = xy[a];
            const [x2, y2] = xy[b];
            const L = Math.hypot(x2 - x1, y2 - y1) || 1;
            for (let k = a + 1; k < b; k++) {
                const d = Math.abs((x2 - x1) * (y1 - xy[k][1]) - (x1 - xy[k][0]) * (y2 - y1)) / L;
                if (d > bd) {
                    bd = d;
                    best = k;
                }
            }
            if (best > 0) {
                keep[best] = 1;
                stack.push([a, best], [best, b]);
            }
        }
        return path.filter((_, k) => keep[k]);
    }
    function exportRows(kind: 'xlsx' | 'csv') {
        const head = ['From', 'To', 'Great circle nm', 'Rhumb line nm', 'Sea lanes nm (approx.)', 'Via', `Days at ${speed} kn`];
        const body = rows.map(r => [r.from, r.to, Math.round(r.gcNm), Math.round(r.rlNm), r.sea ? Math.round(r.sea.distNm) : '', r.sea?.via.join(', ') ?? '', r.sea && speed > 0 ? Number((r.sea.distNm / speed / 24).toFixed(1)) : '']);
        const all = [['Distances (approximate, not for navigation). Sea lanes: Eurostat SeaRoute / MARNET; ports: sea-ports list.'], head, ...body];
        if (kind === 'xlsx') downloadFile(writeXlsx(all, 'Distances'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'distances.xlsx');
        else downloadFile(writeCsv(all), 'text/csv', 'distances.csv');
    }
</script>

<style lang="less">
    .ds-pick {
        display: grid;
        grid-template-columns: 1fr auto 1fr auto;
        gap: 6px;
        align-items: end;
    }
    .ds-swap {
        margin-bottom: 1px;
        font-size: 16px;
    }
    .ds-add {
        margin: 0 0 1px !important;
    }
    .ds-tw {
        max-height: 320px;
        margin-top: 8px;
    }
    .ds-tbl {
        width: 100%;
        th,
        td {
            padding: 4px 6px;
            text-align: left;
            white-space: nowrap;
        }
        th {
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .num {
            text-align: right;
        }
        .g {
            border-left: 1px solid var(--g-border-strong);
        }
        .via {
            white-space: normal;
            min-width: 120px;
            color: var(--g-text-2);
        }
        tbody tr {
            cursor: pointer;
        }
        tr.on td {
            background: var(--g-accent-soft);
        }
        .mono {
            font-family: var(--g-mono);
        }
    }
    .ds-actions {
        margin-top: 8px;
    }
    .ds-within {
        font-size: 12px;
        display: flex;
        gap: 4px;
        align-items: center;
    }
    .k {
        font-weight: 650;
    }
    .k--gc {
        color: #ffd400;
    }
    .k--rl {
        color: #ff8fd0;
    }
    .k--sea {
        color: #38e1ff;
    }
    @media (max-width: 460px) {
        .ds-pick {
            grid-template-columns: 1fr;
        }
    }
</style>
