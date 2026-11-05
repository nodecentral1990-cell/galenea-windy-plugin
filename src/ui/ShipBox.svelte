<!-- Small window at the top left of the map: route name, the times in UTC, the chosen ship symbol
     at the planned position for Windy's slider time, and wind / sea / swell / current.
     One diagram: danger sectors, sea / swell flags, wind barb, current and the ship (RiskPolar). -->
<div class="sb pp" use:toBody data-g-dim={$panelDim ? '' : null} style="left:{x}px;top:{y}px;width:{w}px;{boxH != null ? `height:${boxH}px;` : ''}">
    <div class="sb__head" on:pointerdown={dragStart} title="Drag to move; drag the right or bottom edge to resize">
        <b class="sb__name">{routeName || 'Galenea'}</b>
        <Hint title="Ship window" size={14}>
            <p><b>From</b> = where it comes from, °T (relative to the bow in brackets). <b>Te</b> = encounter period at the course and the speed through the water. Flags and barb point in from where they come; orange dashed: where the current <b>sets</b>.</p>
            <p>Windy's <b>← / →</b> keys step the forecast time; the ship and weather move with it. Drag the title bar to move, the right or bottom edge (or the corner) to resize.</p>
            <p>Sectors: from Sea, Swell 1 and Swell 2 (IMO MSC.1/Circ.1228, advisory). Roll / pitch: the plugin's estimate.</p>
        </Hint>
        {#if onNow}<button class="sb__btn sb__nowbtn" on:click|stopPropagation={onNow} title="Set the map to the present time (computer clock, UTC) with the ship in the middle"><Icon name="clock" size={12} /> Now</button>{/if}
        {#if onSettings}<button class="sb__btn" on:click|stopPropagation={onSettings} title="Display settings (ship symbols, colours, this window)">⚙</button>{/if}
        <button class="sb__btn" on:click|stopPropagation={() => (small = !small)} title={small ? 'Show more' : 'Show less'}>{small ? '▢' : '–'}</button>
        <button class="sb__btn" on:click|stopPropagation={onClose} title="Hide (switch back on in ⚙ Settings → Map display)">✕</button>
    </div>
    <div class="sb__times">
        <div>Map time <b>{fmtFull(mapTs)} UTC</b></div>
        <div class="sb__now">Now {fmtFull(clock)} UTC</div>
    </div>
    {#if !small}
        <!-- the rest scrolls when the window is too short for it (scroll bar only then) -->
        <div class="sb__body pp-scroll" style={boxH != null ? '' : `max-height:${Math.max(120, availH - 62)}px`}>
        {#if pos}
            {#if wx && polar}
                <RiskPolar {wx} heading={pos.course} speed={polar.speed} lbp={polar.lbp} rollPeriod={polar.rollPeriod} settings={polar.settings} size={Math.max(220, w - 18)} {style} {imo} {current} {colors} compact />
            {/if}
            <div class="sb__pos">{fmtLat(pos.lat, 1)} {fmtLon(pos.lon, 1)} · Crs {deg(pos.course)}{#if pos.stopped} · <b>STOPPED</b>{:else if sog != null} · SOG {sog.toFixed(1)} kn{/if}</div>
            {#if wx}
                <table class="sb__list">
                    <tr class="hd"><td /><td /><td>Height</td><td>Period</td><td>From (rel)</td><td title="Encounter period: how often the waves meet the ship at this heading and speed">Te</td></tr>
                    {#each wavesOf(wx) as wv}
                        <tr class:est={wv.estimated}>
                            <td><i style="background:{waveColor(wv.id)}" /></td>
                            <td>{wv.label}</td>
                            <td><b>{wv.h != null ? `${wv.h.toFixed(1)} m` : '—'}</b></td>
                            <td>{wv.period != null ? `${wv.period.toFixed(0)} s` : '—'}</td>
                            <td>{deg(wv.dir)}{wv.dir != null ? ` (${relFrom(wv.dir, pos.course).toFixed(0)})` : ''}</td>
                            <td>{fmtTe(encounterOf(wv.period, wv.dir, pos.course, stw))}</td>
                        </tr>
                    {/each}
                    {#if wx.seaWindy === false || wx.seaWindy == null}<tr class="est"><td /><td colspan="5" class="wrap">Sea worked out from SWH (not read from Windy yet: Weather tab → Read sea)</td></tr>{/if}
                    <tr><td><i style="background:#151515;border-color:#aaa" /></td><td>Wind</td><td><b>{f0(wx.windKn)} kn</b></td><td>{wx.gustKn != null ? `gust ${f0(wx.gustKn)}` : ''}</td><td>{deg(wx.windDir)}{wx.windDir != null ? ` (${relFrom(wx.windDir, pos.course).toFixed(0)})` : ''}</td><td /></tr>
                    <tr><td /><td>Wave power</td><td colspan="2"><b class="pw pw{band(wx.powerKw)}">{f0(wx.powerKw)}{wx.powerCalc ? '*' : ''} kW/m</b></td><td colspan="2">{bandText(wx.powerKw)}</td></tr>
                    {#if icing && icing.cls !== 'none'}<tr class="ice"><td /><td>Icing</td><td colspan="2"><b>{icing.cls}</b></td><td colspan="2">spray · air {f0(wx.airTempC)} °C, sea {f0(wx.seaTempC)} °C</td></tr>{/if}
                    <tr><td /><td>Roll / pitch</td><td colspan="2"><b>{motion ? `${motion.roll.toFixed(0)}° / ${motion.pitch.toFixed(1)}°` : '—'}</b></td><td colspan="2">{motion ? `estimate${calOn ? ' (fine-tuned)' : ''} · max ${motion.rollMax.toFixed(0)}° / ${motion.pitchMax.toFixed(1)}° in 3 h` : 'estimate: ⚙ Settings → Roll and pitch'}</td></tr>
                    <tr><td><i style="background:#ff9f1a" /></td><td>Current</td><td colspan="2"><b>{current ? `${f1(current.kn)} kn` : '—'}</b></td><td colspan="2">{current ? `sets towards ${deg(current.set)}` : 'not read (Weather tab)'}</td></tr>
                </table>
                {#if logging && polar}
                    <RollObsForm {wx} lat={pos.lat} lon={pos.lon} heading={pos.course} speed={stw} {mapTs} resonance={polar.settings} onClose={() => (logging = false)} />
                {:else if polar}
                    <button class="pp-btn pp-btn--ghost small sb__log" on:click={() => (logging = true)} title="Optional: note the roll you see, to fine-tune the estimate (⚙ Settings → Roll and pitch)"><Icon name="log" size={13} /> Log roll</button>
                {/if}
                {#if runInfo}<div class="sb__run">Weather data: {runInfo.air} · waves {runInfo.waves} · fetched {runInfo.fetched}</div>{/if}
            {:else}
                <p class="sb__msg">{hasForecast ? 'Beyond the forecast at this time.' : 'No forecast yet: Weather tab → Get forecast.'}</p>
            {/if}
        {:else}
            <p class="sb__msg">{voyageNote}</p>
        {/if}
        </div>
    {/if}
    <div class="sb__edge sb__edge--r" on:pointerdown={e => resizeStart(e, 'r')} title="Drag to make the window wider or narrower" />
    <div class="sb__edge sb__edge--b" on:pointerdown={e => resizeStart(e, 'b')} title="Drag to make the window taller or shorter" />
    <div class="sb__edge sb__edge--c" on:pointerdown={e => resizeStart(e, 'c')} title="Drag to resize" />
</div>
<svelte:window bind:innerHeight={innerH} />

<script lang="ts">
    import { panelDim } from '../state';
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import { onDestroy } from 'svelte';

    import { fmtLat, fmtLon } from '../lib/format';
    import type { ShipPosition } from '../lib/model';
    import type { ShipStyle } from '../lib/shipSymbols';
    import { fullFlagColors, type FlagColors } from '../lib/shipGlyph';
    import type { ResonanceSettings } from '../lib/circ1228';
    import RiskPolar from './RiskPolar.svelte';
    import RollObsForm from './RollObsForm.svelte';
    import { calibState } from '../lib/motionEstimate';
    import { vessel } from '../state';
    import { graphState } from './graphState';
    import { sprayIcing } from '../lib/icing';
    import { encounterOf, fmtTe, relFrom, wavesOf, type WaveId, type WxPoint } from '../lib/weather';

    export let routeName: string;
    export let onNow: (() => void) | null = null;
    export let mapTs: number;
    export let pos: ShipPosition | null;
    export let wx: WxPoint | null;
    export let current: { kn: number; set: number } | null;
    export let sog: number | null;
    export let style: ShipStyle;
    export let imo = false;
    export let hasForecast = false;
    export let voyageNote = '';
    export let onClose: () => void;
    /** Opens the display settings */
    export let onSettings: (() => void) | null = null;
    /** Which forecast runs the weather comes from */
    export let runInfo: { air: string; waves: string; fetched: string } | null = null;
    export let colors: Partial<FlagColors> = {};
    /** Show the polar diagram below (settings for the IMO checks), or null */
    /** Roll / pitch estimate at this time (null = not available) */
    export let motion: { roll: number; rollMax: number; pitch: number; pitchMax: number } | null = null;
    export let polar: { lbp: number | null; rollPeriod: number | null; settings: ResonanceSettings; speed: number } | null = null;

    $: icing = wx ? sprayIcing(wx.windKn, wx.airTempC, wx.seaTempC) : null;
    $: col = fullFlagColors(colors);
    const waveColor = (id: WaveId) => (id === 'swh' ? col.swh : id === 'sea' ? col.sea : id === 'sw1' ? col.swell : col.swell2);
    /** Speed through the water for the encounter periods (0 when stopped) */
    $: stw = pos?.stopped ? 0 : Math.max(0, polar?.speed ?? sog ?? 0);
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmtFull = (ms: number) => {
        const t = new Date(ms);
        return `${pad(t.getUTCDate())} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
    };
    const band = (p: number | null | undefined) => (p == null ? 0 : p < 10 ? 1 : p < 30 ? 2 : p < 60 ? 3 : p < 100 ? 4 : 5);
    const bandText = (p: number | null | undefined) => ['', 'low', 'moderate', 'high', 'very high', 'severe'][band(p)] + (p != null ? ' (plugin bands)' : '');
    const f0 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(0));
    const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1));
    const deg = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(0).padStart(3, '0')}°`);

    let small = false;
    let logging = false;
    $: calOn = calibState($vessel).applied;
    let innerH = 800;
    // stop above the graph window (owner, 2026-10-29); the rest scrolls
    $: graphSpace = $graphState.open && $graphState.mode !== 'max' ? $graphState.bottom + ($graphState.mode === 'min' ? 34 : $graphState.height) + 8 : 0;
    // position and size, remembered in this browser (owner, 2026-10-30: "make the window adjustable")
    const KEY = 'windy-plugin-passage-plan:shipbox';
    const saved = (() => {
        try {
            return JSON.parse(localStorage.getItem(KEY) ?? '{}') as { x?: number; y?: number; w?: number; h?: number | null };
        } catch {
            return {};
        }
    })();
    let x = saved.x ?? 12;
    let y = saved.y ?? 70;
    let w = saved.w ?? 380;
    /** null = as tall as the contents (up to the space there is) */
    let h: number | null = saved.h ?? null;
    $: availH = Math.max(160, innerH - y - graphSpace - 8);
    $: boxH = h != null ? Math.min(h, availH) : null;
    $: remember(x, y, w, h);
    function remember(..._a: unknown[]) {
        try {
            localStorage.setItem(KEY, JSON.stringify({ x, y, w, h }));
        } catch {
            /* not remembered */
        }
    }
    function resizeStart(e: PointerEvent, edge: 'r' | 'b' | 'c') {
        e.preventDefault();
        e.stopPropagation();
        const sx = e.clientX;
        const sy = e.clientY;
        const w0 = w;
        const box = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
        const h0 = box.getBoundingClientRect().height;
        const move = (ev: PointerEvent) => {
            if (edge !== 'b') w = Math.max(260, Math.min(window.innerWidth - x - 8, w0 + ev.clientX - sx));
            if (edge !== 'r') h = Math.max(160, Math.min(window.innerHeight - y - 8, h0 + ev.clientY - sy));
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }
    let clock = Date.now();
    const timer = setInterval(() => (clock = Date.now()), 20_000);
    onDestroy(() => clearInterval(timer));


    function toBody(node: HTMLElement) {
        document.body.appendChild(node);
        return { destroy: () => node.remove() };
    }

    function dragStart(e: PointerEvent) {
        if ((e.target as HTMLElement).closest('button, .sb__edge')) return;
        const sx = e.clientX - x;
        const sy = e.clientY - y;
        const move = (ev: PointerEvent) => {
            x = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - sx));
            y = Math.max(0, Math.min(window.innerHeight - 30, ev.clientY - sy));
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }
</script>

<style lang="less">
    .sb {
        position: fixed;
        z-index: 1200;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        min-width: 260px;
        background: rgba(24, 28, 33, 0.94);
        color: var(--g-text-1);
        border: 0;
        border-radius: 12px;
        box-shadow: var(--g-shadow);
        backdrop-filter: blur(6px);
        font: 12px var(--g-font);
        padding: 8px 10px;
        user-select: none;
    }
    .sb__body {
        overflow-x: hidden;
        flex: 1 1 auto;
        min-height: 0;
    }
    .sb__edge {
        position: absolute;
        z-index: 2;
        &--r {
            top: 8px;
            bottom: 8px;
            right: -4px;
            width: 8px;
            cursor: ew-resize;
        }
        &--b {
            left: 8px;
            right: 8px;
            bottom: -4px;
            height: 8px;
            cursor: ns-resize;
        }
        &--c {
            right: -5px;
            bottom: -5px;
            width: 14px;
            height: 14px;
            cursor: nwse-resize;
        }
    }
    .sb__head {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: move;
        margin-bottom: 3px;
    }
    .sb__name {
        flex: 1;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .sb__btn.sb__nowbtn {
        background: #2f6fd6;
        color: #fff;
        border-radius: 3px;
        padding: 0 5px;
        margin-right: 2px;
    }
    .sb__btn {
        background: none;
        border: 0;
        color: #ccc;
        cursor: pointer;
        font-size: 12px;
        padding: 0 3px;
    }
    .sb__times b {
        color: #ffd400;
        font-family: monospace;
        font-size: 12px;
    }
    .sb__now {
        opacity: 0.75;
        font-family: monospace;
    }
    .sb__pos {
        text-align: center;
        font-family: monospace;
        margin-bottom: 3px;
    }
    .sb__list {
        width: 100%;
        border-collapse: collapse;
        td {
            padding: 1px 3px;
            white-space: nowrap;
        }
        tr.hd td {
            opacity: 0.65;
            font-size: 10px;
        }
        tr.est td {
            color: #b8b8b8;
            font-style: italic;
        }
        td.wrap {
            white-space: normal;
        }
        i {
            display: inline-block;
            width: 12px;
            height: 4px;
            border: 1px solid #000;
            vertical-align: middle;
        }
    }
    .ice td {
        color: #9fd3ff;
    }
    .sb__src,
    .sb__tip {
        opacity: 0.65;
        font-size: 10px;
        margin: 3px 0 0;
    }
    .pw {
        padding: 0 3px;
        border-radius: 2px;
    }
    .pw2 {
        background: rgba(80, 160, 255, 0.4);
    }
    .pw3 {
        background: rgba(150, 90, 230, 0.6);
    }
    .pw4 {
        background: rgba(210, 60, 200, 0.75);
    }
    .pw5 {
        background: rgba(140, 0, 100, 0.95);
    }
    .sb__run {
        font-size: 10px;
        margin-top: 3px;
        color: #9fd3ff;
    }
    .sb__msg {
        margin: 6px 0;
        color: #ffd28a;
    }
</style>
