<!-- Route comparison: keep several routes and compare them side by side. -->
<div class="g-card">
<div class="g-card__head">
    <span class="g-card__title">Routes to compare</span>
    <Hint title="Comparing routes">
        <p>Keep several routes (yours, optimised versions, files) and compare them side by side with the same forecast.</p>
        <p>Change the route (e.g. a more southerly track) and add it again to compare. "Open" puts a route back into Route → Waypoints.</p>
    </Hint>
</div>
<div class="row">
    <button class="pp-btn g-btn--primary" disabled={$route.waypoints.length < 2} on:click={addCurrent}><Icon name="plus" size={15} /> Add the route from the Route tab</button>
    <button class="pp-btn pp-btn--ghost" on:click={() => fileInput.click()}><Icon name="folder" size={15} /> Open route files…</button>
    <input bind:this={fileInput} type="file" accept={IMPORT_ACCEPT} multiple hidden on:change={onFiles} />
    {#if $activeCompareId && entry($activeCompareId)}
        <button class="pp-btn pp-btn--ghost" on:click={saveBack} title="Copy the route now in the Route tab (with your changes) back into this comparison entry">⤓ Save Route tab changes to "{entry($activeCompareId)?.route.name}"</button>
    {/if}
</div>
{#if message}<div class="pp-note" class:pp-err={isError}>{message}</div>{/if}

{#if all.length}
    <div class="bar">
        <label class="all"><input type="checkbox" checked={allChecked} indeterminate={sel.length > 0 && !allChecked} on:change={toggleAll} /> All</label>
        <button class="pp-btn pp-btn--ghost small" disabled={!sel.length} on:click={deleteSelected}>Delete selected{sel.length ? ` (${sel.length})` : ''}</button>
        <span class="pp-note">Tick, or <b>Ctrl/⌘</b>-click, to select several.</span>
    </div>
    <div class="pp-scroll list">
        <table class="tbl">
            <thead><tr><th /><th /><th>Name</th><th>WPs</th><th>nm</th><th title="Draw this route on the map">Map</th><th /></tr></thead>
            <tbody>
                {#if live}
                    <tr class="live">
                        <td />
                        <td><i class="sw" style="background:{live.color}" /></td>
                        <td title="Always included: the route now in the Route tab, kept up to date">{$route.name} <span class="pp-note">(Route tab, live)</span></td>
                        <td>{$route.waypoints.length}</td>
                        <td>{summaries.get('live')?.distNm.toFixed(0) ?? ''}</td>
                        <td>✓</td>
                        <td />
                    </tr>
                {/if}
                {#each $savedRoutes as s (s.id)}
                    <tr class:sel={sel.includes(s.id)} class:active={$activeCompareId === s.id} on:click={e => rowClick(e, s.id)}>
                        <td><input type="checkbox" checked={sel.includes(s.id)} on:click|stopPropagation={() => toggle(s.id)} /></td>
                        <td><i class="sw" style="background:{s.color}" /></td>
                        <td><input class="name" value={s.route.name} on:change={e => rename(s.id, e)} /></td>
                        <td>{s.route.waypoints.length}</td>
                        <td>{summaries.get(s.id)?.distNm.toFixed(0) ?? ''}</td>
                        <td><input type="checkbox" checked={s.show} on:change={e => setShow(s.id, e)} title="Show on the map" /></td>
                        <td class="nowrap">
                            <button class="icon" title="Open in the Route tab to view or edit" on:click|stopPropagation={() => openInRouteTab(s.id)}>Open</button>
                            <button class="icon" title="Remove from the comparison" on:click|stopPropagation={() => remove([s.id])}>✕</button>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>

{:else}
    <div class="g-empty"><Icon name="compare" size={30} /><p>No routes yet. Press <b>Add the route from the Route tab</b>, or open several route files at once.</p></div>
{/if}
</div>
{#if all.length}
    <div class="g-card">
    <div class="g-card__head">
        <span class="g-card__title">Compare</span>
        <Hint title="Reading the comparison" width={360}>
            <p>Green = best, red = worst of the routes. Durations count time with wind or waves over the level, stops included. Wind over {GALE_KN} kn = Beaufort 8 and above. Wave and wind limits are your red limits (Settings → Weather limits).</p>
            <p>"Forecast covers" shows how much of each voyage had forecast data: past the end of the forecast nothing is counted.</p>
            <p>Weather: ECMWF / ECMWF-WAM via Windy (Open-Meteo where Windy has nothing, if switched on); each route uses its own speeds, fixed ETAs and weather-loss setting; currents only if read. All times UTC.</p>
        </Hint>
    </div>
    <div class="row">
        <label class="check"><input type="radio" name="etdmode" checked={$compareEtd != null} on:change={() => compareEtd.set($route.etd ?? Math.ceil(Date.now() / 3600e3) * 3600e3)} /> Same ETD for all routes</label>
        <label class="check"><input type="radio" name="etdmode" checked={$compareEtd == null} on:change={() => compareEtd.set(null)} /> Each route's own ETD</label>
    </div>
    {#if $compareEtd != null}
        <div class="etd">ETD for all (UTC, 24 h) <DateTimeField value={$compareEtd} clearable={false} on:change={e => compareEtd.set(e.detail)} /></div>
    {/if}
    <div class="row">
        <button class="pp-btn g-btn--primary" disabled={busy} on:click={getAllForecasts}><Icon name="refresh" size={15} /> Get forecast for all routes</button>
        {#if busy}<button class="pp-btn pp-btn--ghost" on:click={() => (signal.cancelled = true)}>Stop</button>{/if}
        <label class="check" title="Steps Windy's time slider with the currents layer for each route: about 1–2 s per step, so this takes a while">
            <input type="checkbox" bind:checked={withCurrents} /> also read currents (slow)
        </label>
        <button class="pp-btn pp-btn--ghost" on:click={() => (full = true)}>⤢ Full-size table</button>
    </div>
    {#if progress}<div class="pp-note">{progress}</div>{/if}

    <CompareTable {summaries} routes={all} {th} />
    <div class="pp-note">Green = best, red = worst · all times UTC · planning aid only</div>
    </div>
{/if}

{#if full}
    <Overlay onClose={() => (full = false)}>
        <svelte:fragment slot="head"><b>Route comparison</b> · {all.length} routes · all times UTC</svelte:fragment>
        <div class="pp-scroll" style="flex:1;min-height:0">
            <CompareTable {summaries} routes={all} {th} big />
        </div>
    </Overlay>
{/if}

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import { get } from 'svelte/store';

    import { IMPORT_ACCEPT, importRoute } from '../lib/formats';
    import { computePlan, positionAt, type Route } from '../lib/model';
    import { simulate } from '../lib/speed';
    import { nearestSweep, routePoints, weatherAt } from '../lib/weather';
    import { GALE_KN, summarize, type RouteSummary } from '../lib/compare';
    import { fetchSeries, runLimited, sweep } from '../windy/forecast';
    import { activeCompareId, addToCompare, compareEtd, compareWx, planKey, route, savedRoutes, selectedUids, thresholds, vessel, workEnd, workProgress, workStart, wxPlanKey, wxSeries, wxSweepValid, type SavedRoute } from '../state';
    import DateTimeField from './DateTimeField.svelte';
    import CompareTable from './CompareTable.svelte';
    import Overlay from './Overlay.svelte';

    let fileInput: HTMLInputElement;
    let message = '';
    let isError = false;
    let sel: string[] = [];
    let busy = false;
    let progress = '';
    let signal = { cancelled: false };
    let withCurrents = false;
    let full = false;

    $: th = $thresholds;
    $: allChecked = $savedRoutes.length > 0 && sel.length === $savedRoutes.length;
    $: sel = sel.filter(id => $savedRoutes.some(s => s.id === id));

    const entry = (id: string) => $savedRoutes.find(s => s.id === id);

    // Recomputed whenever routes, ship, limits, ETD choice or fetched weather change
    let summaries = new Map<string, RouteSummary>();
    // The Route tab's route is always the first column, kept up to date
    let live: SavedRoute | null = null;
    $: live = $route.waypoints.length >= 2 ? { id: 'live', route: { ...$route, name: `${$route.name} (Route tab)` }, color: $route.color ?? '#ff2d95', show: true } : null;
    $: all = live ? [live, ...$savedRoutes] : $savedRoutes;
    $: liveWx = $wxSeries.length && $wxPlanKey === $planKey ? { series: $wxSeries, sweep: $wxSweepValid } : null;

    $: summaries = new Map(
        all.map(s => {
            const w = s.id === 'live' ? (liveWx ?? $compareWx.get('live')) : $compareWx.get(s.id);
            const env = {
                wx: (p: { lat: number; lon: number }, t: number) => (w ? weatherAt(w.series, p, t) : null),
                current: (_p: { lat: number; lon: number }, t: number) => {
                    const c = w ? nearestSweep(w.sweep, t, 'currentKn') : null;
                    return c && c.currentKn != null && c.currentSet != null ? { kn: c.currentKn, set: c.currentSet } : null;
                },
            };
            return [s.id, summarize(s.route, $vessel, $thresholds, env, { etd: $compareEtd })];
        }),
    );

    function say(text: string, err = false) {
        message = text;
        isError = err;
    }

    function addCurrent() {
        const r = get(route);
        const id = addToCompare(r);
        activeCompareId.set(id);
        say(`Added "${r.name}". Change the route in the Route tab and add it again to compare another option.`);
        if ($compareEtd == null && $savedRoutes.length === 1 && r.etd != null) compareEtd.set(r.etd);
    }

    async function onFiles(e: Event) {
        const input = e.target as HTMLInputElement;
        const files = Array.from(input.files ?? []);
        input.value = '';
        const done: string[] = [];
        const failed: string[] = [];
        for (const f of files) {
            try {
                const r = importRoute(f.name, new Uint8Array(await f.arrayBuffer()));
                if (r.etd == null) r.etd = get(route).etd;
                addToCompare(r);
                done.push(f.name);
            } catch (err) {
                failed.push(`${f.name} (${(err as Error).message})`);
            }
        }
        say(`${done.length ? `Added ${done.length} route${done.length > 1 ? 's' : ''}.` : ''}${failed.length ? ` Could not open: ${failed.join('; ')}` : ''}`, failed.length > 0);
    }

    function toggle(id: string) {
        sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
    }
    function rowClick(e: MouseEvent, id: string) {
        if ((e.target as HTMLElement).closest('input, button')) return;
        if (e.ctrlKey || e.metaKey) toggle(id);
        else sel = [id];
    }
    function toggleAll() {
        sel = allChecked ? [] : $savedRoutes.map(s => s.id);
    }
    function remove(ids: string[]) {
        savedRoutes.update(list => list.filter(s => !ids.includes(s.id)));
        compareWx.update(m => {
            const n = new Map(m);
            ids.forEach(id => n.delete(id));
            return n;
        });
        if (ids.includes(get(activeCompareId) ?? '')) activeCompareId.set(null);
    }
    function deleteSelected() {
        if (sel.length > 1 && !confirm(`Remove ${sel.length} routes from the comparison?`)) return;
        remove(sel);
        sel = [];
    }
    function rename(id: string, e: Event) {
        const name = (e.target as HTMLInputElement).value.trim() || 'Route';
        savedRoutes.update(list => list.map(s => (s.id === id ? { ...s, route: { ...s.route, name } } : s)));
    }
    function setShow(id: string, e: Event) {
        const show = (e.target as HTMLInputElement).checked;
        savedRoutes.update(list => list.map(s => (s.id === id ? { ...s, show } : s)));
    }
    function openInRouteTab(id: string) {
        const s = entry(id);
        if (!s) return;
        route.set(JSON.parse(JSON.stringify(s.route)) as Route);
        selectedUids.set([]);
        activeCompareId.set(id);
        say(`"${s.route.name}" is now in the Route tab. After changes, come back and press "Save Route tab changes".`);
    }
    function saveBack() {
        const id = get(activeCompareId);
        if (!id) return;
        const r = JSON.parse(JSON.stringify(get(route))) as Route;
        savedRoutes.update(list => list.map(s => (s.id === id ? { ...s, route: r } : s)));
        compareWx.update(m => {
            const n = new Map(m);
            n.delete(id);
            return n;
        });
        say(`Saved. Press "Get forecast for all routes" again for this route's weather.`);
    }

    async function getAllForecasts() {
        busy = true;
        signal = { cancelled: false };
        const list = all.map(s => ({ ...s, route: s.id === 'live' ? get(route) : s.route }));
        const label = (k: number, what: string) => `${k + 1}. ${list[k].route.name}: ${what}`;
        workStart(
            'Getting the weather for the compared routes',
            list.flatMap((_, k) => [label(k, 'forecast'), ...(withCurrents ? [label(k, 'currents')] : [])]),
            signal,
        );
        try {
            for (let k = 0; k < list.length && !signal.cancelled; k++) {
                const s = list[k];
                const etd = get(compareEtd);
                const r: Route = etd != null ? { ...s.route, etd } : s.route;
                const base = computePlan(r, get(vessel));
                const pts = routePoints(base);
                const res = await runLimited(
                    pts.map(p => () => fetchSeries(p.lat, p.lon, 3, base.etd != null && base.eta != null ? { start: base.etd, end: base.eta } : undefined)),
                    6,
                    n => {
                        progress = `Route ${k + 1}/${list.length} "${r.name}": forecast ${n} / ${pts.length}…`;
                        workProgress(label(k, 'forecast'), n, pts.length);
                    },
                    signal,
                );
                const series = res.filter((x): x is NonNullable<typeof x> => !!x);
                let sw = new Map();
                if (withCurrents && series.length && base.etd != null && !signal.cancelled) {
                    const sim = simulate(r, base, get(vessel), { wx: (p, t) => weatherAt(series, p, t), current: () => null });
                    const times: { t: number; pos: NonNullable<ReturnType<typeof positionAt>> }[] = [];
                    for (let t = sim.plan.etd as number; t <= (sim.plan.eta as number); t += 6 * 3600e3) {
                        const pos = positionAt(r, sim.plan, t);
                        if (pos && weatherAt(series, pos, t)) times.push({ t, pos });
                    }
                    sw = await sweep(
                        'currents',
                        times,
                        n => {
                            progress = `Route ${k + 1}/${list.length} "${r.name}": currents ${n} / ${times.length}…`;
                            workProgress(label(k, 'currents'), n, times.length);
                        },
                        signal,
                    );
                }
                compareWx.update(m => new Map(m).set(s.id, { series, sweep: sw }));
            }
            progress = signal.cancelled ? 'Stopped.' : `Done: forecast for ${list.length} routes.`;
        } catch (err) {
            progress = `Could not get the forecast: ${(err as Error).message}`;
        } finally {
            busy = false;
            workEnd();
        }
    }
</script>

<style lang="less">
    .row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        margin: 4px 0;
    }
    .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        margin: 6px 0 2px;
    }
    .all,
    .check {
        display: flex;
        gap: 4px;
        align-items: center;
        white-space: nowrap;
    }
    .etd {
        display: flex;
        flex-direction: column;
        font-size: 11px;
        max-width: 280px;
        margin-bottom: 4px;
    }
    .list {
        max-height: 260px;
    }
    .tbl {
        border-collapse: collapse;
        font-size: 11px;
        width: 100%;
        th,
        td {
            padding: 2px 4px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            text-align: left;
        }
        th {
            position: sticky;
            top: 0;
            background: #333;
        }
        tr.live td {
            background: rgba(255, 45, 149, 0.1);
        }
        tr.sel td {
            background: rgba(255, 212, 0, 0.18);
        }
        tr.active td:nth-child(3) input {
            border-color: #ffd400;
        }
        input.name {
            width: 150px;
        }
    }
    .sw {
        display: inline-block;
        width: 16px;
        height: 4px;
        border: 1px solid #000;
        vertical-align: middle;
    }
    .nowrap {
        white-space: nowrap;
    }
    button.icon {
        background: none;
        border: 0;
        color: inherit;
        cursor: pointer;
        padding: 0 3px;
        text-decoration: underline;
    }
    .small {
        font-size: 11px;
        padding: 1px 6px;
    }
</style>
