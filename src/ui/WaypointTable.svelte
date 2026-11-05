<div class="bar">
    <label class="all" title="Select all / none">
        <input type="checkbox" checked={allChecked} indeterminate={someChecked} on:change={toggleAll} /> All
    </label>
    <button class="pp-btn pp-btn--ghost small" disabled={!$selectedUids.length} on:click={deleteSelected}>
        Delete selected{$selectedUids.length ? ` (${$selectedUids.length})` : ''}
    </button>
    <span class="pp-note">Tick, or <b>Ctrl/⌘</b>-click (here or on the map), to select several. Click an <b>ETA</b> to fix it (📌).</span>
</div>
<div class="tablewrap pp-scroll" class:full>
    <table>
        <thead>
            <tr>
                <th /><th>WP</th><th>Name</th><th>Lat</th><th>Lon</th><th title="Leg arriving at this waypoint">Leg</th><th>Crs</th><th>Dist</th>
                <th title="Speed in calm water (kn) for the leg arriving here. Empty = default">SiCW</th>
                <th title="Your allowance for weather/current (kn slower)">Allow.</th>
                <th title="Grey = suggested from your RPM/speed table (⚙ Settings → Speed, RPM and fuel)">RPM</th><th title="Speed at 0 slip (kn). Empty = from RPM × pitch (⚙ Settings → Ship particulars)">0-slip</th>
                <th title="(speed at 0 slip − expected speed) ÷ speed at 0 slip">Slip</th>
                <th title="Planned ETA (with weather and current once the forecast is fetched). Click to fix a time; 📌 = fixed">ETA UTC</th><th title="Planned stop (drifting) at this waypoint">Delay h</th><th />
            </tr>
        </thead>
        <tbody>
            {#each $route.waypoints as w, i (w.uid)}
                {@const leg = i > 0 ? $plan.legs[i - 1] : null}
                <tr class:sel={$selectedUids.includes(w.uid)} on:click={e => rowClick(e, w.uid)}>
                    <td><input type="checkbox" checked={$selectedUids.includes(w.uid)} on:click|stopPropagation={() => selectWp(w.uid, true)} title="Select" /></td>
                    <td class="nowrap">{i + 1}{#if $landUids.has(w.uid)} <span class="land" title="Above sea level on Windy's elevation data: check the chart">⚠ land?</span>{/if}</td>
                    <td><input class="name" value={w.name} on:change={e => setField(i, 'name', val(e))} /></td>
                    <td><input class="pos" value={fmtLat(w.lat)} on:change={e => setPos(i, 'lat', e)} /></td>
                    <td><input class="pos" value={fmtLon(w.lon)} on:change={e => setPos(i, 'lon', e)} /></td>
                    <td>
                        {#if i > 0}
                            <select value={w.legType} on:change={e => setField(i, 'legType', val(e))}>
                                <option value="RL">RL</option><option value="GC">GC</option>
                            </select>
                        {/if}
                    </td>
                    <td>{leg ? leg.course.toFixed(1).padStart(5, '0') : ''}</td>
                    <td>{leg ? leg.distNm.toFixed(1) : ''}</td>
                    <td class="nowrap">{#if i > 0}<input class="num" type="number" step="0.1" placeholder={String($route.defaultSpeed)} value={w.speed ?? ''} title={leg?.targetSog != null ? 'Your planned speed. Before a fixed ETA the speeds keep these proportions, scaled to arrive on time' : ''} on:change={e => setNum(i, 'speed', e)} />{#if leg?.targetSog != null}<span class="scaled" title="Speed in calm water used to keep the fixed ETA (includes the weather once the forecast is fetched)">→{($sim.legs[i - 1]?.sicw ?? leg.calmSpeed).toFixed(1)}</span>{/if}{/if}</td>
                    <td>{#if i > 0}<input class="num" type="number" step="0.1" value={w.allowance || ''} placeholder="0" on:change={e => setNum(i, 'allowance', e, 0)} />{/if}</td>
                    <td>{#if i > 0}<input class="num" type="number" step="1" value={w.rpm ?? ''} placeholder={suggestRpm(leg?.calmSpeed)} on:change={e => setNum(i, 'rpm', e)} />{/if}</td>
                    <td>{#if i > 0}<input class="num" type="number" step="0.1" value={w.engineSpeed ?? ''} placeholder={leg?.engineSpeed && w.engineSpeed == null ? leg.engineSpeed.toFixed(1) : ''} on:change={e => setNum(i, 'engineSpeed', e)} />{/if}</td>
                    <td>{leg?.slipPct != null ? leg.slipPct.toFixed(1) + '%' : ''}</td>
                    <td class="nowrap">
                        {#if i === 0}
                            <DateTimeField inline fixed={$route.etd != null} value={$route.etd} clearable={false} title="ETD (UTC, 24-hour): click to change" on:change={e => updateRoute(r => (r.etd = e.detail))} />
                        {:else if $plan.etd == null}
                            —
                        {:else}
                            <DateTimeField
                                inline
                                fixed={isFixed(w, i)}
                                value={isFixed(w, i) ? fixedTime(w, i) : (leg?.arriveMs ?? null)}
                                clearable={isFixed(w, i)}
                                clearLabel="Unfix"
                                title={isFixed(w, i) ? 'Fixed ETA: click to change or unfix' : 'Planned ETA: click to fix a time here'}
                                on:change={e => setEta(i, e.detail)}
                            />
                        {/if}
                    </td>
                    <td class="nowrap">
                        {#if i < $route.waypoints.length - 1}
                            <input type="checkbox" title="Stop (drift) at this waypoint" checked={(w.delayH ?? 0) > 0} on:change={e => toggleDelay(i, e)} />
                            {#if (w.delayH ?? 0) > 0}<input class="num" type="number" step="0.5" min="0" value={w.delayH} title="Hours stopped" on:change={e => setNum(i, 'delayH', e, null)} />{/if}
                        {/if}
                    </td>
                    <td class="nowrap">
                        <button class="icon" title="Insert a waypoint after this one" on:click|stopPropagation={() => insertAfter(i)}>＋</button>
                        <button class="icon" title="Delete" on:click|stopPropagation={() => deleteWaypoints([w.uid])}>✕</button>
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<script lang="ts">
    import { get } from 'svelte/store';

    import { fmtLat, fmtLon, parseCoord } from '../lib/format';
    import type { Waypoint } from '../lib/model';
    import { deleteWaypoints, insertWaypoint, landUids, plan, route, selectWp, selectedUids, sim, updateRoute, vessel } from '../state';
    import { fromTable } from '../lib/speed';
    import DateTimeField from './DateTimeField.svelte';

    /** Full-size view: no height limit */
    export let full = false;
    /** Messages for the parent (bad positions etc.) */
    export let onMessage: (text: string, isError: boolean) => void = () => {};

    $: allChecked = $route.waypoints.length > 0 && $selectedUids.length === $route.waypoints.length;
    $: someChecked = $selectedUids.length > 0 && !allChecked;

    const val = (e: Event) => (e.target as HTMLInputElement).value;

    function rowClick(e: MouseEvent, uid: string) {
        const t = e.target as HTMLElement;
        if (t.closest('input, select, button')) return;
        selectWp(uid, e.ctrlKey || e.metaKey);
    }

    function toggleAll() {
        selectedUids.set(allChecked ? [] : get(route).waypoints.map(w => w.uid));
    }

    function deleteSelected() {
        const sel = get(selectedUids);
        if (sel.length > 1 && !confirm(`Delete ${sel.length} waypoints?`)) return;
        deleteWaypoints(sel);
    }

    function setField<K extends keyof Waypoint>(i: number, k: K, v: string) {
        updateRoute(r => {
            (r.waypoints[i] as unknown as Record<string, unknown>)[k as string] = v;
        });
    }

    function suggestRpm(sicw: number | undefined): string {
        if (sicw == null) return '';
        const v = fromTable($vessel.speedTable, sicw);
        return v?.rpm != null ? v.rpm.toFixed(0) : '';
    }

    /** Last waypoint: fixed by the ETA in 'ETD + ETA' mode; others by their own fixed ETA */
    function isFixed(w: Waypoint, i: number): boolean {
        const last = i === $route.waypoints.length - 1;
        return last && $route.mode === 'eta' ? $route.eta != null : w.fixedEta != null;
    }
    function fixedTime(w: Waypoint, i: number): number | null {
        return i === $route.waypoints.length - 1 && $route.mode === 'eta' ? $route.eta : (w.fixedEta ?? null);
    }

    function setEta(i: number, t: number | null) {
        updateRoute(r => {
            const last = i === r.waypoints.length - 1;
            r.waypoints[i].fixedEta = last ? null : t;
            if (last) {
                // Fixing the arrival at the last waypoint = plan by ETD + ETA
                r.mode = t == null ? 'speed' : 'eta';
                if (t != null) r.eta = t;
            }
        });
    }

    function toggleDelay(i: number, e: Event) {
        const on = (e.target as HTMLInputElement).checked;
        updateRoute(r => {
            r.waypoints[i].delayH = on ? 6 : null;
        });
    }

    function setNum(i: number, k: 'speed' | 'allowance' | 'rpm' | 'engineSpeed' | 'delayH', e: Event, empty: number | null = null) {
        const s = val(e).trim();
        const n = s === '' ? empty : Number(s);
        updateRoute(r => {
            (r.waypoints[i] as unknown as Record<string, number | null>)[k] = n != null && isFinite(n) ? n : empty;
        });
    }

    function setPos(i: number, k: 'lat' | 'lon', e: Event) {
        const input = e.target as HTMLInputElement;
        const v = parseCoord(input.value, k);
        if (v == null) {
            onMessage(`Could not read "${input.value}". Use e.g. 16°13.842'N or 061°32.553'W.`, true);
            const w = get(route).waypoints[i];
            input.value = k === 'lat' ? fmtLat(w.lat) : fmtLon(w.lon);
            return;
        }
        updateRoute(r => {
            r.waypoints[i][k] = v;
        });
    }

    function insertAfter(i: number) {
        const r = get(route);
        const a = r.waypoints[i];
        const b = r.waypoints[i + 1];
        if (b) insertWaypoint(i + 1, (a.lat + b.lat) / 2, a.lon + (((b.lon - a.lon + 540) % 360) - 180) / 2);
        else insertWaypoint(i + 1, a.lat, a.lon + 0.5);
    }
</script>

<style lang="less">
    .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        margin: 4px 0;
    }
    .all {
        white-space: nowrap;
    }
    .tablewrap {
        max-height: 420px;
        &.full {
            max-height: none;
        }
    }
    table {
        border-collapse: collapse;
        font-size: 11px;
        th,
        td {
            padding: 2px 3px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            text-align: left;
            white-space: nowrap;
        }
        th {
            position: sticky;
            top: 0;
            background: #333;
        }
        tr.sel td {
            background: rgba(255, 212, 0, 0.18);
        }
        input.name {
            width: 90px;
        }
        input.pos {
            width: 98px;
            font-family: monospace;
        }
        input.num {
            width: 50px;
        }
    }
    .nowrap {
        white-space: nowrap;
    }
    .scaled {
        margin-left: 2px;
        color: #ffd400;
        font-weight: bold;
    }
    .land {
        background: #ffd400;
        color: #000;
        font-weight: bold;
        border-radius: 3px;
        padding: 0 3px;
        font-size: 10px;
    }
    button.icon {
        background: none;
        border: 0;
        color: inherit;
        cursor: pointer;
        padding: 0 3px;
    }
    .small {
        font-size: 11px;
        padding: 1px 6px;
    }
</style>
