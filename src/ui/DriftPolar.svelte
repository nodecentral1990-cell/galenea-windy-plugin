<!-- Drift polar (owner, 2026-11-26; corrected the same day: "current ... must show the resultant", "arrow length in
     proportion to the polar diagram, and dynamic ... sometimes we drift at 3 kts", "all the weather arrows and their
     periods"). White circle, north up. Speed rings sized to the fastest arrow (0.5 to 8 kn). From the centre, all on the
     same scale, tip exactly at the speed: WIND DRIFT (green, through the water), CURRENT (blue, dashed, where it sets) and the
     RESULTANT drift over the ground (orange, thick). Wind barb inside (from where it blows, gust beside it). Outside the rim
     the SWH, Sea, Swell 1 and Swell 2 flags from where they come, height / period inside (two lanes when close together).
     The ship at its estimated heading in the middle; the other way it may lie, faint. -->
<svg class="dp-svg" viewBox="0 0 {S} {S}" role="img" aria-label="Drift diagram">
    <circle cx={C} cy={C} r={R} fill="#ffffff" stroke="#0b1116" stroke-width="1.5" />
    {#each rings as k, i}
        <circle cx={C} cy={C} r={(k / top) * R} fill="none" stroke="#c9d2da" stroke-width="1" />
        {#if i % (rings.length > 4 ? 2 : 1) === rings.length % 2 || i === rings.length - 1}
            <text x={pt(25, (k / top) * R)[0] + 2} y={pt(25, (k / top) * R)[1] - 2} font-size="10" fill="#5f6d78">{fmtK(k)} kn</text>
        {/if}
    {/each}
    {#each [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] as d}
        {@const a = pt(d, R)}
        {@const b = pt(d, R - (d % 90 ? 5 : 9))}
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#0b1116" stroke-width="1.2" />
    {/each}
    {#each [['N', 0], ['E', 90], ['S', 180], ['W', 270]] as [l, d]}
        {@const p = pt(Number(d), R - 17)}
        <text x={p[0]} y={p[1]} font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#8a97a2">{l}</text>
    {/each}
    {#if other != null}
        <g transform="translate({C} {C}) rotate({other})" opacity="0.35"><path d={HULL} fill="none" stroke="#0b1116" stroke-width="1.4" stroke-dasharray="3 2" /></g>
    {/if}
    {#if heading != null}
        <g transform="translate({C} {C}) rotate({heading})"><path d={HULL} fill={color} fill-opacity="0.85" stroke="#0b1116" stroke-width="1.5" /></g>
    {/if}
    {#if wx}
        {@html art}
    {/if}
</svg>

<script lang="ts">
    import { arrowPoints, barbSvg, flagSvg, type FlagColors } from '../lib/shipGlyph';
    import { wavesOf } from '../lib/weather';
    import type { DriftVel, DriftWx } from '../lib/drift';

    export let wx: DriftWx | null;
    export let vel: DriftVel | null;
    /** Heading of the other way the ship may lie (faint), null = none */
    export let other: number | null = null;
    export let color = '#35d07f';
    export let colors: FlagColors;

    const S = 400;
    const C = S / 2;
    const R = 110;
    const HULL = 'M0,-22 C5,-15 6,-7 6,0 L6,18 L-6,18 L-6,0 C-6,-7 -5,-15 0,-22 Z';
    const pt = (deg: number, r: number): [number, number] => [C + r * Math.sin((deg * Math.PI) / 180), C - r * Math.cos((deg * Math.PI) / 180)];
    const f = (n: number) => n.toFixed(1);
    const fmtK = (k: number) => (k < 1 ? k.toFixed(2).replace(/0$/, '') : Number.isInteger(k) ? String(k) : k.toFixed(1));
    const TOPS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8];
    const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

    $: heading = vel && wx?.windKn != null ? vel.heading : null;
    $: fastest = Math.max(vel?.kn ?? 0, wx?.cur?.kn ?? 0, vel?.leewayKn ?? 0);
    $: top = TOPS.find(x => x >= fastest * 1.12) ?? Math.ceil(fastest * 1.12);
    $: rings = ringsFor(top);
    $: art = draw(wx, vel, top, colors);

    function ringsFor(t: number): number[] {
        const step = t <= 1 ? 0.25 : t <= 2 ? 0.5 : t <= 4 ? 1 : 2;
        const out: number[] = [];
        for (let k = step; k <= t + 1e-9; k += step) out.push(Number(k.toFixed(2)));
        return out;
    }

    function arrow(toward: number, kn: number, topKn: number, w: number, fill: string, dash = false): string {
        const len = (kn / topKn) * R;
        if (len < 1) return '';
        const head = Math.min(13, len * 0.6);
        const pts = arrowPoints(C, C, toward, 0, len, w, head, Math.max(w + 3, head * 0.55));
        const d = pts.map(p => `${f(p[0])},${f(p[1])}`).join(' ');
        return dash
            ? `<polygon points="${d}" fill="${fill}" fill-opacity="0.25" stroke="${fill}" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round"/>`
            : `<polygon points="${d}" fill="${fill}" stroke="#0b1116" stroke-width="1.1" stroke-linejoin="round"/>`;
    }

    function draw(w: DriftWx | null, v: DriftVel | null, topKn: number, fc: FlagColors): string {
        if (!w) return '';
        let s = '';
        // waves outside the rim, from where they come; flags from nearly the same side sit side by side (parallel, so each
        // still points exactly from where its waves come)
        if (w.full) {
            const fill: Record<string, string> = { swh: fc.swh, sea: fc.sea, sw1: fc.swell, sw2: fc.swell2 };
            const placed: { dir: number; shift: number }[] = [];
            for (const wv of wavesOf(w.full)) {
                if (wv.h == null || wv.dir == null || !(wv.h > 0.05)) continue;
                const near = placed.filter(q => angDiff(q.dir, wv.dir as number) < 22);
                // step aside to the side it already lies on (clockwise or anticlockwise of the flag there), never across it
                let shift = 0;
                if (near.length) {
                    const q = near[near.length - 1];
                    const d = ((((wv.dir as number) - q.dir) % 360) + 540) % 360 - 180;
                    shift = q.shift + (d >= 0 ? 18 : -18);
                }
                placed.push({ dir: wv.dir, shift });
                const a = ((wv.dir + 90) * Math.PI) / 180;
                const dx = shift * Math.sin(a);
                const dy = -shift * Math.cos(a);
                const txt = `${wv.h.toFixed(1)}m${wv.period != null && wv.period >= 1 ? ` / ${Math.round(wv.period)}s` : ''}`;
                s += `<g transform="translate(${f(dx)} ${f(dy)})">${flagSvg(C, C, wv.dir, R + 4, R + 72, 8, fill[wv.id], txt, 9.5)}</g>`;
            }
        }
        // wind barb inside, from where it blows; the gust beside it
        if (w.windKn != null && w.windDir != null) {
            s += `<g opacity="0.8">${barbSvg(C, C, w.windDir, w.windKn, '#111111', R * 0.95, 1, false, R * 0.5)}</g>`;
            if (w.gustKn != null) {
                const [gx, gy] = pt(w.windDir + 12, R * 0.42);
                s += `<text x="${f(gx)}" y="${f(gy)}" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#111">G${Math.round(w.gustKn)}</text>`;
            }
        }
        // the parts and the resultant, all from the centre on the speed rings
        if (v && v.leewayKn > 0.01) s += arrow(v.leewayToward, v.leewayKn, topKn, 1.6, '#2e9e5b');
        if (w.cur && w.cur.kn > 0.01) s += arrow(w.cur.set, w.cur.kn, topKn, 2.2, '#1f6fd1', true);
        if (v && v.kn > 0.01) {
            s += arrow(v.toward, v.kn, topKn, 3.4, '#ffb020');
            const [tx, ty] = pt(v.toward, (v.kn / topKn) * R + 12);
            s += `<text x="${f(tx)}" y="${f(ty)}" font-size="11" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#b36b00" stroke="#fff" stroke-width="3" paint-order="stroke">${v.kn.toFixed(1)}</text>`;
        }
        return s;
    }
</script>

<style>
    .dp-svg {
        width: 100%;
        max-width: 400px;
        display: block;
        margin: 0 auto;
    }
</style>
