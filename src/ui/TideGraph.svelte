<!-- Tide graph (owner, 2026-11-13): model sea level hour by hour, high and low waters marked with time (UTC) and
     height, days marked, present time as a line. Hover to read the height. Heights relative to mean sea level. -->
<div class="tg" bind:clientWidth={W}>
    {#if pts.length > 1}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <svg width={W} height={H} viewBox="0 0 {W} {H}" on:pointerdown={hover} on:pointermove={hover} on:pointerleave={e => e.pointerType === 'mouse' && (hov = null)} role="img" aria-label="Tide graph">
            <rect x={L} y={T} width={pw} height={ph} fill="rgba(57,135,229,0.06)" />
            {#each yTicks as v}
                <line x1={L} x2={L + pw} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.12)" />
                <text x={L - 4} y={y(v) + 3} class="tg__ax" text-anchor="end">{v.toFixed(1)}</text>
            {/each}
            {#each days as d}
                <line x1={x(d)} x2={x(d)} y1={T} y2={T + ph} stroke="rgba(255,255,255,0.25)" />
                <text x={x(d) + 3} y={T + ph + 12} class="tg__ax">{dayLabel(d)}</text>
            {/each}
            <path d={area} fill="rgba(57,135,229,0.28)" />
            <path d={path} fill="none" stroke="#4aa3ff" stroke-width="1.8" />
            {#each shownTurns as tt}
                <circle cx={x(tt.t)} cy={y(tt.h)} r="3" fill={tt.kind === 'high' ? '#7fe3ff' : '#ffd28a'} />
                {#if labels}
                    <text x={x(tt.t)} y={tt.kind === 'high' ? y(tt.h) - 6 : y(tt.h) + 13} class="tg__lbl" text-anchor="middle">{`${hm(tt.t)} ${tt.h.toFixed(1)}`}</text>
                {/if}
            {/each}
            {#if now >= from && now <= to}
                <line x1={x(now)} x2={x(now)} y1={T} y2={T + ph} stroke="#3fd07a" stroke-width="1.2" stroke-dasharray="4 3" />
            {/if}
            {#if hov}
                <line x1={x(hov.t)} x2={x(hov.t)} y1={T} y2={T + ph} stroke="#fff" stroke-opacity="0.5" />
                <circle cx={x(hov.t)} cy={y(hov.h)} r="3.5" fill="#fff" />
                <text x={Math.min(L + pw - 4, Math.max(L + 60, x(hov.t)))} y={T + 11} class="tg__hov" text-anchor="middle">{fmtShort(hov.t)} UTC · {hov.h.toFixed(2)} m</text>
            {/if}
            <text x={L} y={T - 4} class="tg__ax">m (above mean sea level)</text>
        </svg>
    {:else}
        <p class="tg__none">No tide data for this place.</p>
    {/if}
</div>

<script lang="ts">
    import { tideAt, type TideTurn } from '../lib/tides';

    export let ts: number[] = [];
    export let h: (number | null)[] = [];
    export let turns: TideTurn[] = [];
    export let from: number;
    export let to: number;
    export let height = 170;
    /** Write the time and height next to each high / low water */
    export let labels = true;

    const L = 34;
    const R = 8;
    const T = 16;
    const B = 18;
    let W = 480;
    $: H = height;
    $: pw = Math.max(50, W - L - R);
    $: ph = Math.max(40, H - T - B);
    $: pts = ts.map((t, i) => [t, h[i]] as [number, number | null]).filter((p): p is [number, number] => p[1] != null && p[0] >= from && p[0] <= to);
    $: lo = pts.length ? Math.min(...pts.map(p => p[1])) : 0;
    $: hi = pts.length ? Math.max(...pts.map(p => p[1])) : 1;
    $: pad = Math.max(0.15, (hi - lo) * 0.18);
    $: y0 = lo - pad;
    $: y1 = hi + pad;
    $: x = (t: number) => L + ((t - from) / Math.max(1, to - from)) * pw;
    $: y = (v: number) => T + ph - ((v - y0) / Math.max(1e-6, y1 - y0)) * ph;
    $: path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    $: area = pts.length ? `${path}L${x(pts[pts.length - 1][0]).toFixed(1)},${(T + ph).toFixed(1)}L${x(pts[0][0]).toFixed(1)},${(T + ph).toFixed(1)}Z` : '';
    $: yTicks = ticks(y0, y1);
    $: days = Array.from({ length: Math.ceil((to - from) / 86400e3) + 1 }, (_, i) => Math.ceil(from / 86400e3) * 86400e3 + i * 86400e3).filter(d => d >= from && d < to);
    $: shownTurns = turns.filter(t => t.t >= from && t.t <= to);
    const now = Date.now();

    function ticks(a: number, b: number): number[] {
        const span = b - a;
        const step = span > 6 ? 2 : span > 3 ? 1 : span > 1.2 ? 0.5 : 0.2;
        const out: number[] = [];
        for (let v = Math.ceil(a / step) * step; v <= b; v += step) out.push(Math.round(v * 10) / 10);
        return out;
    }
    let hov: { t: number; h: number } | null = null;
    function hover(e: PointerEvent) {
        const r = (e.currentTarget as SVGElement).getBoundingClientRect();
        const t = from + ((e.clientX - r.left - L) / pw) * (to - from);
        const v = tideAt(ts, h, t);
        hov = v != null && t >= from && t <= to ? { t, h: v } : null;
    }
    const p2 = (n: number) => String(n).padStart(2, '0');
    const hm = (t: number) => `${p2(new Date(t).getUTCHours())}:${p2(new Date(t).getUTCMinutes())}`;
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayLabel = (t: number) => `${DOW[new Date(t).getUTCDay()]} ${new Date(t).getUTCDate()}`;
    const fmtShort = (t: number) => `${dayLabel(t)} ${p2(new Date(t).getUTCHours())}:${p2(new Date(t).getUTCMinutes())}`;
</script>

<style lang="less">
    .tg {
        width: 100%;
        svg {
            display: block;
            touch-action: pan-y;
        }
    }
    .tg__ax {
        fill: var(--g-text-3, #9aa4ae);
        font: 10px var(--g-font, sans-serif);
    }
    .tg__lbl {
        fill: var(--g-text-1, #eee);
        font: 600 9.5px var(--g-mono, monospace);
    }
    .tg__hov {
        fill: #fff;
        font: 600 11px var(--g-font, sans-serif);
    }
    .tg__none {
        color: var(--g-text-3, #999);
        font-size: 12px;
    }
</style>
