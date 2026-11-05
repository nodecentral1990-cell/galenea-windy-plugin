<!-- Voyage graphs at the bottom of the map (owner, 2026-10-29): time along the bottom (UTC), up to 3
     graphs, each with its own list box of values. Drag the top / right edge to resize, the title bar to
     move; – minimise, ▢ maximise, ✕ close (reopen with 📈 Graphs in the plugin). Hover to read the
     values, click to set Windy's time there. -->
<div class="gp pp" data-g-dim={$panelDim ? '' : null} class:gp--max={st.mode === 'max'} class:gp--phone={$phone} class:gp--min={st.mode === 'min'} use:toBody style={boxStyle}>
    {#if st.mode === 'normal'}
        <div class="gp__edge gp__edge--top" on:pointerdown={e => resizeStart(e, 'top')} title="Drag to make the graphs taller or shorter" />
        <div class="gp__edge gp__edge--right" on:pointerdown={e => resizeStart(e, 'right')} title="Drag to make the window wider or narrower" />
    {/if}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="gp__head" on:pointerdown={moveStart} title="Drag to move" on:dblclick={() => setMode(st.mode === 'max' ? 'normal' : 'max')}>
        <b class="gp__title">📈 Graphs</b>
        {#each [0, 1, 2] as i}
            <div class="gp__lb">
                <label class="gp__sw" title={st.off[i] ? `Graph ${i + 1} is off: switch on` : `Switch graph ${i + 1} off (its choices are kept)`}
                    ><input type="checkbox" checked={!st.off[i]} on:change={() => toggleGraph(i)} /><span class="knob" /></label
                >
                <button class="gp__pick" class:open={openSlot === i} on:click|stopPropagation={e => togglePick(i, e)} title="Choose what graph {i + 1} shows (tick one or more)">
                    <span class="gp__n">{i + 1}</span>
                    {st.slots[i].length ? st.slots[i].map(id => seriesById(id)?.label.split(' (')[0] ?? id).join(', ') : 'choose…'} ▾
                </button>
            </div>
        {/each}
        <span class="gp__sp" />
        <button class="gp__btn gp__now" on:click|stopPropagation={goToNow} title="Set the map and the plugin to the present time (computer clock, UTC) with the ship in the middle">🕒 Now</button>
        <button class="gp__btn" on:click|stopPropagation={() => setMode(st.mode === 'min' ? 'normal' : 'min')} title={st.mode === 'min' ? 'Restore' : 'Minimise'}>{st.mode === 'min' ? '▴' : '–'}</button>
        <button class="gp__btn" on:click|stopPropagation={() => setMode(st.mode === 'max' ? 'normal' : 'max')} title={st.mode === 'max' ? 'Restore size' : 'Maximise'}>{st.mode === 'max' ? '❐' : '▢'}</button>
        <button class="gp__btn" on:click|stopPropagation={close} title="Close (reopen with 📈 Graphs at the top of the plugin)">✕</button>
    </div>
    {#if openSlot != null}
        <div class="gp__pop pp-scroll" style={popStyle} on:pointerdown|stopPropagation>
            <div class="gp__pophead">
                Graph {openSlot + 1}: switch on as many as you like · same unit = same axis
                <button class="gp__clear" on:click={() => setSlot(openSlot ?? 0, [])}>All off</button>
            </div>
            {#each GROUPS as g}
                <div class="gp__grp">{g}</div>
                {#each GRAPH_SERIES.filter(s => s.group === g) as s}
                    <label class="gp__opt gp__sw">
                        <input type="checkbox" checked={st.slots[openSlot].includes(s.id)} on:change={() => toggleSeries(openSlot ?? 0, s.id)} /><span class="knob" />
                        <span>{s.label} <span class="gp__unit">{s.unit === '° roll/pitch' ? '°' : s.unit}</span></span>
                    </label>
                {/each}
            {/each}
        </div>
    {/if}
    {#if st.mode !== 'min'}
        <div class="gp__body" bind:clientWidth={bodyW} bind:clientHeight={bodyH}>
            {#if !rows.length}
                <p class="gp__msg">{$route.waypoints.length < 2 ? 'Make or load a route first (Route tab).' : 'Set the ETD in the Route tab to see the voyage graphs.'}</p>
            {:else if !graphs.length}
                <p class="gp__msg">{st.slots.some((x, i) => x.length && st.off[i]) ? 'All graphs are switched off: use the switches next to the list boxes.' : 'Choose what to show in the list boxes 1, 2, 3 above.'}</p>
            {:else}
                <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
                <div class="gp__plots" on:pointermove={hover} on:pointerleave={() => (hoverT = null)} on:click={clickTime}>
                    {#each graphs as g (g.slot)}
                        <div class="gp__legend">
                            {#each g.items as it}
                                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
                                <label class="gp__li gp__sw gp__sw--sm" class:off={it.hidden} title={it.hidden ? 'Off: click to show' : 'Click to hide for a moment (stays in the list box)'} on:click|stopPropagation
                                    ><input type="checkbox" checked={!it.hidden} on:change={() => toggleHidden(g.slot, it.s.id)} /><span class="knob" /><i style="background:{it.color}" class:dot={it.s.dots} />{it.s.label.split(' (')[0]} <b>{fmtVal(valueAt(it.vals, readT), it.s)}</b></label
                                >
                            {/each}
                            {#if g.extra.length}<span class="gp__li gp__muted">({g.extra.map(u => `${unitName(u)} ${fmtRange(g.plan.ranges[u])}`).join(' · ')}, no axis)</span>{/if}
                        </div>
                        <svg width={plotW} height={graphH} class="gp__svg">
                            {#each xTicks as t}<line x1={xOf(t)} x2={xOf(t)} y1={TOP} y2={graphH} class="gp__grid" />{/each}
                            {#if g.plan.left && g.plan.ranges[g.plan.left]}
                                {#each yTicks(g.plan.left, g.plan.ranges[g.plan.left]) as v}
                                    <line x1={ML} x2={plotW - MR} y1={yOf(v, g.plan.ranges[g.plan.left])} y2={yOf(v, g.plan.ranges[g.plan.left])} class="gp__grid" />
                                    <text x={ML - 4} y={yOf(v, g.plan.ranges[g.plan.left]) + 3} class="gp__ax" text-anchor="end">{fmtTick(v)}</text>
                                {/each}
                                <text x={4} y={TOP - 3} class="gp__ax gp__unitlbl">{unitName(g.plan.left)}</text>
                            {/if}
                            {#if g.plan.right && g.plan.ranges[g.plan.right]}
                                {#each yTicks(g.plan.right, g.plan.ranges[g.plan.right]) as v}
                                    <text x={plotW - MR + 4} y={yOf(v, g.plan.ranges[g.plan.right]) + 3} class="gp__ax">{fmtTick(v)}</text>
                                {/each}
                                <text x={plotW - 4} y={TOP - 3} class="gp__ax gp__unitlbl" text-anchor="end">{unitName(g.plan.right)}</text>
                            {/if}
                            {#each g.items.filter(x => !x.hidden) as it}
                                {#if it.s.dots}
                                    {#each it.vals as val, k}{#if val != null}<circle cx={xOf(times[k])} cy={yOf(val, g.plan.ranges[it.s.unit])} r="3" fill={it.color} class="gp__dot" />{/if}{/each}
                                {:else}
                                    <path d={pathOf(it.vals, g.plan.ranges[it.s.unit])} stroke={it.color} class="gp__line" />
                                {/if}
                            {/each}
                            {#if nowX != null}<line x1={nowX} x2={nowX} y1={TOP} y2={graphH} class="gp__nowline" />{/if}
                            {#if mapX != null}<line x1={mapX} x2={mapX} y1={TOP} y2={graphH} class="gp__mapline" />{/if}
                            {#if hoverT != null}<line x1={xOf(hoverT)} x2={xOf(hoverT)} y1={TOP} y2={graphH} class="gp__hover" />{/if}
                        </svg>
                    {/each}
                    <svg width={plotW} height={XAXIS_H} class="gp__svg">
                        {#each xTicks as t}
                            <text x={xOf(t)} y={12} class="gp__ax" text-anchor="middle">{tickLabel(t)}</text>
                        {/each}
                    </svg>
                </div>
                <div class="gp__foot">
                    <span><b>{readT === hoverT ? 'At pointer' : 'At map time'}: {fmtTime(readT)} UTC</b> · yellow line = map time, green dashed = now · click to set the map there</span>
                    <span class="gp__muted">{runInfo ? `Weather: ${runInfo.air} · waves ${runInfo.waves} · fetched ${runInfo.fetched}` : 'No forecast for this plan yet: Weather tab → Get forecast (ship values only).'} RPM, power, slip, fuel from your speed table; roll / pitch are estimates. Planning aid only.</span>
                </div>
            {/if}
        </div>
    {/if}
</div>
<svelte:window on:pointerdown={closePick} bind:innerWidth={winW} bind:innerHeight={winH} />

<script lang="ts">
    import { panelDim, phone } from '../state';
    import { phoneGraphOpen } from './graphState';
    import store from '@windy/store';
    import { onDestroy } from 'svelte';

    import { graphState, type GraphMode } from './graphState';
    import { axisPlan, GRAPH_SERIES, niceTicks, seriesById, type GraphCtx, type GraphSeries } from '../lib/graphSeries';
    import { buildRows, forecastInfo, type WxRow } from '../lib/weather';
    import { motionAt } from '../lib/motionEstimate';
    import { fmtTime } from '../lib/format';
    import { plan, planKey, route, thresholds, timelineTs, vessel, wxPlanKey, wxSeries, wxSweepValid } from '../state';
    import { goToNow } from '../windy/nowTime';
    import { logEvent } from '../lib/activityLog';

    const GROUPS = [...new Set(GRAPH_SERIES.map(s => s.group))];
    // Series colours in fixed order (validated categorical palette for dark surfaces; red left out:
    // it is the warning colour)
    const COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#008300'];
    const ML = 44;
    const MR = 44;
    const TOP = 12;
    const XAXIS_H = 16;
    const LEGEND_H = 17;
    const FOOT_H = 30;

    let st = $graphState;
    $: st = $graphState;
    let winW = 1200;
    let winH = 800;
    let bodyW = 600;
    let bodyH = 200;

    // ---- data -------------------------------------------------------------------------------------
    $: wxOk = $wxSeries.length > 0 && $wxPlanKey === $planKey;
    $: hours = $plan.etd != null && $plan.eta != null ? ($plan.eta - $plan.etd) / 3.6e6 : 0;
    $: stepH = hours <= 96 ? 1 : 3;
    $: rows =
        st.open && st.mode !== 'min' && $plan.etd != null && $plan.eta != null && $route.waypoints.length > 1
            ? buildRows($route, $plan, $vessel, $thresholds, stepH, wxOk ? $wxSeries : [], wxOk ? $wxSweepValid : undefined)
            : ([] as WxRow[]);
    $: times = rows.map(r => r.time);
    $: runInfo = wxOk ? forecastInfo($wxSeries) : null;
    $: ctx = {
        vessel: $vessel,
        motion: (r: WxRow) => (r.wx && !r.stopped ? motionAt(r.wx, r.pos.course, r.speedKn, $vessel) : null),
    } as GraphCtx;

    interface Item {
        s: GraphSeries;
        color: string;
        vals: (number | null)[];
        /** switched off for a moment (legend switch) */
        hidden: boolean;
    }
    interface Graph {
        slot: number;
        items: Item[];
        plan: ReturnType<typeof axisPlan>;
        extra: string[];
    }
    let graphs: Graph[] = [];
    $: graphs = st.slots
        .map((ids, slot) => {
            const sorted = GRAPH_SERIES.filter(s => ids.includes(s.id));
            const hid = st.hidden[slot] ?? [];
            const items = sorted.map((s, k) => ({ s, color: COLORS[k % COLORS.length], vals: rows.map(r => s.get(r, ctx)), hidden: hid.includes(s.id) }));
            const shown = items.filter(it => !it.hidden);
            const values: Record<string, (number | null)[]> = {};
            for (const it of shown) values[it.s.id] = it.vals;
            const plan = axisPlan(shown.map(it => it.s.id), values);
            const extra = Object.keys(plan.ranges).filter(u => u !== plan.left && u !== plan.right);
            return { slot, items, plan, extra };
        })
        .filter(g => g.items.length > 0 && !st.off[g.slot]);

    // ---- geometry ---------------------------------------------------------------------------------
    $: plotW = Math.max(200, bodyW);
    $: graphH = graphs.length ? Math.max(40, Math.floor((bodyH - XAXIS_H - FOOT_H - 6) / graphs.length) - LEGEND_H) : 60;
    $: t0 = times[0] ?? 0;
    $: t1 = times[times.length - 1] ?? 1;
    $: xOf = (t: number) => ML + ((t - t0) / Math.max(1, t1 - t0)) * (plotW - ML - MR);
    $: tOf = (x: number) => t0 + ((x - ML) / Math.max(1, plotW - ML - MR)) * (t1 - t0);
    // reactive (0.23.4): the drawing must follow the window size, which is only known after the first draw
    $: yOf = (v: number, r: [number, number] | undefined) => (r ? TOP + (1 - (v - r[0]) / (r[1] - r[0] || 1)) * (graphH - TOP - 2) : 0);
    $: yTicks = (u: string, r: [number, number]) => (u === '°' ? [0, 90, 180, 270, 360] : niceTicks(r[0], r[1], Math.max(2, Math.min(5, Math.floor(graphH / 28)))));
    $: pathOf = (vals: (number | null)[], r: [number, number] | undefined): string => {
        let d = '';
        let pen = false;
        vals.forEach((v, k) => {
            if (v == null || !r) {
                pen = false;
                return;
            }
            d += `${pen ? 'L' : 'M'}${xOf(times[k]).toFixed(1)},${yOf(v, r).toFixed(1)}`;
            pen = true;
        });
        return d;
    };
    $: xTicks = timeTicks(t0, t1, plotW - ML - MR);
    function timeTicks(a: number, b: number, w: number): number[] {
        if (!(b > a)) return [];
        const want = Math.max(2, Math.floor(w / 80));
        const stepH = [1, 3, 6, 12, 24, 48, 96].find(h => (b - a) / 3.6e6 / h <= want) ?? 96;
        const step = stepH * 3.6e6;
        const out: number[] = [];
        for (let t = Math.ceil(a / step) * step; t <= b; t += step) out.push(t);
        return out;
    }
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    function tickLabel(t: number): string {
        const d = new Date(t);
        const hh = `${String(d.getUTCHours()).padStart(2, '0')}:00`;
        return d.getUTCHours() === 0 ? `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}` : hh;
    }

    // ---- reading values ---------------------------------------------------------------------------
    let hoverT: number | null = null;
    let clock = Date.now();
    const timer = setInterval(() => (clock = Date.now()), 60_000);
    onDestroy(() => clearInterval(timer));
    $: inRange = (t: number) => times.length > 1 && t >= t0 && t <= t1;
    $: nowX = inRange(clock) ? xOf(clock) : null;
    $: mapX = inRange($timelineTs) ? xOf($timelineTs) : null;
    $: readT = hoverT ?? (inRange($timelineTs) ? $timelineTs : t0);
    function valueAt(vals: (number | null)[], t: number): number | null {
        if (!times.length) return null;
        let k = 0;
        for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - t) < Math.abs(times[k] - t)) k = i;
        return vals[k] ?? null;
    }
    function hover(e: PointerEvent) {
        const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - box.left;
        hoverT = x >= ML && x <= plotW - MR ? tOf(x) : null;
    }
    function clickTime() {
        if (hoverT == null) return;
        store.set('timestamp', Math.round(hoverT));
        logEvent('graph', `Graph: map time set to ${fmtTime(hoverT)} UTC`);
    }
    const unitName = (u: string) => (u === '° roll/pitch' ? '° roll/pitch' : u === 'icing' ? 'icing predictor' : u);
    const fmtTick = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(0) : String(Math.round(v * 10) / 10));
    const fmtRange = (r: [number, number] | undefined) => (r ? `${fmtTick(r[0])}–${fmtTick(r[1])}` : '');
    function fmtVal(v: number | null, s: GraphSeries): string {
        if (v == null) return '—';
        const u = s.unit === '° roll/pitch' ? '°' : s.unit === 'icing' ? '' : s.unit;
        const n = s.unit === '°' ? String(Math.round(v)).padStart(3, '0') : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
        return `${n}${u === '°' ? '°' : u ? ' ' + u : ''}`;
    }

    // ---- list boxes -------------------------------------------------------------------------------
    let openSlot: number | null = null;
    let popStyle = '';
    function togglePick(i: number, e: MouseEvent) {
        if (openSlot === i) {
            openSlot = null;
            return;
        }
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const up = r.top > window.innerHeight / 2;
        popStyle = up
            ? `left:${Math.min(r.left, window.innerWidth - 330)}px;bottom:${window.innerHeight - r.top + 4}px;max-height:${r.top - 12}px`
            : `left:${Math.min(r.left, window.innerWidth - 330)}px;top:${r.bottom + 4}px;max-height:${window.innerHeight - r.bottom - 12}px`;
        openSlot = i;
    }
    function closePick(e: PointerEvent) {
        if (openSlot != null && !(e.target as HTMLElement).closest?.('.gp__pick')) openSlot = null;
    }
    function setSlot(i: number, ids: string[]) {
        graphState.update(s => ({ ...s, slots: s.slots.map((x, k) => (k === i ? ids : x)) }));
    }
    function toggleGraph(i: number) {
        graphState.update(s => ({ ...s, off: s.off.map((x, k) => (k === i ? !x : x)) }));
    }
    function toggleHidden(i: number, id: string) {
        graphState.update(s => ({ ...s, hidden: s.hidden.map((x, k) => (k === i ? (x.includes(id) ? x.filter(y => y !== id) : [...x, id]) : x)) }));
    }
    function toggleSeries(i: number, id: string) {
        const cur = st.slots[i];
        setSlot(i, cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
    }

    // ---- window: move, resize, minimise, maximise, close ------------------------------------------
    const RIGHT_GAP = 540; // the plugin panel on the right
    $: autoW = Math.max(360, winW - st.left - RIGHT_GAP);
    $: w = st.mode === 'max' ? Math.max(360, winW - 20 - RIGHT_GAP) : (st.width ?? autoW);
    $: boxStyle = $phone
        ? `left:0;top:0;width:${winW}px;height:${winH}px`
        : st.mode === 'max'
            ? `left:10px;top:60px;bottom:${st.bottom}px;width:${w}px`
            : st.mode === 'min'
              ? `left:${st.left}px;bottom:${st.bottom}px;width:${Math.min(w, 760)}px`
              : `left:${st.left}px;bottom:${st.bottom}px;width:${w}px;height:${st.height}px`;
    // Keep the wave chart legend above the graph window
    $: legendBottom = st.mode === 'max' ? null : st.bottom + (st.mode === 'min' ? 34 : st.height) + 8;
    $: setLegendSpace(legendBottom);
    function setLegendSpace(px: number | null) {
        if (px == null) document.body.style.removeProperty('--pp-legend-bottom');
        else document.body.style.setProperty('--pp-legend-bottom', `${Math.max(110, px)}px`);
    }
    onDestroy(() => setLegendSpace(null));

    function setMode(m: GraphMode) {
        graphState.update(s => ({ ...s, mode: m }));
    }
    function close() {
        if ($phone) return phoneGraphOpen.set(false);
        graphState.update(s => ({ ...s, open: false }));
    }
    function drag(e: PointerEvent, onMove: (dx: number, dy: number) => void) {
        e.preventDefault();
        const sx = e.clientX;
        const sy = e.clientY;
        const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy);
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }
    function moveStart(e: PointerEvent) {
        if ((e.target as HTMLElement).closest('button, label, input') || st.mode === 'max') return;
        const { left, bottom } = st;
        drag(e, (dx, dy) =>
            graphState.update(s => ({
                ...s,
                left: Math.max(0, Math.min(window.innerWidth - 120, left + dx)),
                bottom: Math.max(0, Math.min(window.innerHeight - 60, bottom - dy)),
            })),
        );
    }
    function resizeStart(e: PointerEvent, edge: 'top' | 'right') {
        const { height } = st;
        const width = w;
        drag(e, (dx, dy) =>
            graphState.update(s =>
                edge === 'top'
                    ? { ...s, height: Math.max(130, Math.min(window.innerHeight - s.bottom - 40, height - dy)) }
                    : { ...s, width: Math.max(360, Math.min(window.innerWidth - s.left - 10, width + dx)) },
            ),
        );
    }
    function toBody(node: HTMLElement) {
        document.body.appendChild(node);
        return { destroy: () => node.remove() };
    }
</script>

<style lang="less">
    .gp {
        position: fixed;
        z-index: 1150;
        background: rgba(24, 28, 33, 0.95);
        color: var(--g-text-1);
        border: 0;
        border-radius: 12px;
        box-shadow: var(--g-shadow);
        backdrop-filter: blur(6px);
        display: flex;
        flex-direction: column;
        font: 12px var(--g-font);
        box-sizing: border-box;
        min-width: 360px;
    }
    .gp__edge {
        position: absolute;
        z-index: 2;
        &--top {
            left: 0;
            right: 0;
            top: -4px;
            height: 8px;
            cursor: ns-resize;
        }
        &--right {
            top: 0;
            bottom: 0;
            right: -4px;
            width: 8px;
            cursor: ew-resize;
        }
    }
    .gp__head {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        cursor: move;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        user-select: none;
        min-width: 0;
    }
    .gp__title {
        white-space: nowrap;
    }
    .gp__lb {
        min-width: 0;
        flex: 0 1 210px;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    /* on / off switch (same look as in Settings) */
    .gp__sw {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        input {
            position: absolute;
            opacity: 0;
            width: 0;
            height: 0;
        }
        .knob {
            position: relative;
            flex: 0 0 auto;
            width: 26px;
            height: 14px;
            border-radius: 7px;
            background: #666;
            transition: background 0.15s;
            &::after {
                content: '';
                position: absolute;
                left: 2px;
                top: 2px;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #fff;
                transition: left 0.15s;
            }
        }
        input:checked + .knob {
            background: #2e9e4f;
            &::after {
                left: 14px;
            }
        }
        input:focus-visible + .knob {
            outline: 2px solid #9fd3ff;
        }
    }
    .gp__sw--sm .knob {
        width: 20px;
        height: 11px;
        &::after {
            width: 7px;
            height: 7px;
        }
    }
    .gp__sw--sm input:checked + .knob::after {
        left: 11px;
    }
    .gp__li.off {
        opacity: 0.45;
    }
    .gp__pick {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: left;
        background: rgba(0, 0, 0, 0.35);
        color: inherit;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 3px;
        padding: 2px 6px;
        cursor: pointer;
        font: inherit;
        &.open {
            border-color: #ffd400;
        }
    }
    .gp__n {
        display: inline-block;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
        padding: 0 4px;
        margin-right: 3px;
        font-weight: bold;
    }
    .gp__sp {
        flex: 1;
    }
    .gp__btn {
        background: rgba(255, 255, 255, 0.12);
        color: inherit;
        border: 0;
        border-radius: 3px;
        padding: 2px 7px;
        cursor: pointer;
        font: inherit;
        white-space: nowrap;
    }
    .gp__now {
        background: #2f6fd6;
        color: #fff;
        font-weight: bold;
    }
    .gp__pop {
        position: fixed;
        z-index: 1300;
        width: 320px;
        background: #2b2b2b;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
        padding: 4px 8px 6px;
    }
    .gp__pophead {
        font-size: 10px;
        opacity: 0.85;
        padding: 2px 0 4px;
        display: flex;
        gap: 6px;
        align-items: flex-start;
    }
    .gp__clear {
        margin-left: auto;
        background: rgba(255, 255, 255, 0.12);
        color: inherit;
        border: 0;
        border-radius: 3px;
        cursor: pointer;
        font: inherit;
    }
    .gp__grp {
        font-weight: bold;
        margin-top: 5px;
        opacity: 0.8;
    }
    .gp__opt {
        display: flex;
        padding: 2px 0 2px 4px;
    }
    .gp__unit {
        opacity: 0.6;
    }
    .gp__body {
        flex: 1;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        padding: 2px 0 0;
    }
    .gp__plots {
        cursor: crosshair;
    }
    .gp__legend {
        height: 17px;
        display: flex;
        gap: 12px;
        padding-left: 44px;
        align-items: center;
        white-space: nowrap;
        overflow: hidden;
    }
    .gp__li i {
        display: inline-block;
        width: 14px;
        height: 3px;
        margin-right: 4px;
        vertical-align: middle;
        &.dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
        }
    }
    .gp__muted {
        opacity: 0.6;
    }
    .gp__svg {
        display: block;
    }
    .gp__grid {
        stroke: rgba(255, 255, 255, 0.1);
        stroke-width: 1;
    }
    .gp__ax {
        fill: rgba(255, 255, 255, 0.7);
        font-size: 10px;
    }
    .gp__unitlbl {
        font-weight: bold;
    }
    .gp__line {
        fill: none;
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
    }
    .gp__dot {
        stroke: rgba(26, 26, 25, 0.9);
        stroke-width: 1;
    }
    .gp__mapline {
        stroke: #ffd400;
        stroke-width: 1.5;
    }
    .gp__nowline {
        stroke: #4cdf7c;
        stroke-width: 1.5;
        stroke-dasharray: 4 3;
    }
    .gp__hover {
        stroke: rgba(255, 255, 255, 0.6);
        stroke-width: 1;
    }
    .gp__foot {
        height: 30px;
        padding: 1px 8px;
        display: flex;
        flex-direction: column;
        font-size: 10px;
        overflow: hidden;
        span {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    }
    .gp__msg {
        padding: 10px;
        opacity: 0.8;
    }
    /* phone: the whole screen, above the plugin panel (owner, 2026-11-02) */
    .gp.gp--phone {
        min-width: 0;
        border-radius: 0;
        z-index: 100001;
        .gp__legend {
            overflow-x: auto;
            overflow-y: hidden;
            padding-left: 8px;
        }
        .gp__li {
            flex: none;
        }
        /* list boxes on their own row, full width (3 side by side) */
        .gp__head {
            flex-wrap: wrap;
            cursor: default;
        }
        .gp__title {
            order: 0;
        }
        .gp__lb {
            order: 2;
            flex: 1 1 30%;
            min-width: 0;
        }
        .gp__sp {
            order: 1;
        }
        .gp__btn {
            order: 1;
        }
    }
</style>
