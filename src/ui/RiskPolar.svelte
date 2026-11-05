<!-- One diagram (owner, 2026-10-27/28), in the style of weather-routing tools: white circle with speed
     rings (kn), IMO MSC.1/Circ.1228 danger sectors in ONE colour per warning type (stripes where two
     apply at once; only real warnings unless pale zones are switched on), SWH, sea, swell 1 and swell 2
     flags outside the circle pointing in from where they come (height and period written in them;
     flags from the same direction are lined up, not on top of each other) (owner, 2026-10-30),
     the current (dashed, where it sets) and the wind barb inside, and the ship with its heading and
     speed (yellow). North up. -->
<div class="rp">
    <svg width={size} height={size} viewBox="0 0 {size} {size}" role="img" aria-label="Polar diagram">
        <defs>
            {#each patterns as p}
                <pattern id={p.id} patternUnits="userSpaceOnUse" width={p.kinds.length * 5} height={p.kinds.length * 5} patternTransform="rotate(45)">
                    {#each p.kinds as k, i}<rect x={i * 5} y="0" width="5" height={p.kinds.length * 5} fill={ZONE_COLORS[k]} />{/each}
                </pattern>
            {/each}
        </defs>
        <circle cx={C} cy={C} r={R} fill="#ffffff" stroke="#9aa4ad" />
        {#each zonePaths as z}
            <path class="zone" d={z.d} fill={z.fill} fill-opacity={z.opacity} />
        {/each}
        {#each RINGS as v}
            <circle cx={C} cy={C} r={rad(v)} fill="none" stroke="rgba(0,0,0,0.22)" />
            {#if big || v % 10 === 0}<text x={C + 2} y={C - rad(v) + 9} class="t in">{v}</text>{/if}
        {/each}
        {#each SPOKES as a}
            <line x1={C} y1={C} x2={pt(a, R)[0]} y2={pt(a, R)[1]} stroke="rgba(0,0,0,0.13)" />
            {#if big}
                <text x={pt(a, labelR)[0]} y={pt(a, labelR)[1] + 3} class="t" text-anchor={anchor(a)}>{a}°</text>
            {:else if a % 90 === 0}
                <text x={pt(a, R - 8)[0]} y={pt(a, R - 8)[1] + 3} class="t b in" text-anchor="middle">{['N', 'E', 'S', 'W'][a / 90]}</text>
            {/if}
        {/each}
        {@html marks}
        <!-- ship heading and speed -->
        <!-- one shape: shaft and head drawn together, tip exactly on the speed ring value -->
        <polygon class="hdg" points={arrowPts} fill="#ffd400" stroke="#000" stroke-width={big ? 1.4 : 1.1} stroke-linejoin="round" />
        <g transform="translate({C - S / 2},{C - S / 2}) rotate({heading} {S / 2} {S / 2})">{@html shipSymbolSvg(style, S, imo)}</g>
    </svg>
    {#if !compact}
        <!-- the key: own class names (Windy styles its own ".legend", which hid this text before 0.17.0) -->
        <table class="rp-key">
            <tr class="hd"><td /><td /><td>Height</td><td>Period</td><td>From</td><td title="Encounter period at this heading and speed">Encounter (Te)</td></tr>
            {#each wavesOf(wx) as wv}
                <tr class:est={wv.estimated}>
                    <td><i style="background:{waveColor(wv.id)}" /></td>
                    <td>{wv.label}</td>
                    <td>{wv.h != null ? `${wv.h.toFixed(1)} m` : '—'}</td>
                    <td>{wv.period != null ? `${wv.period.toFixed(0)} s` : '—'}</td>
                    <td>{deg(wv.dir)}</td>
                    <td>{fmtTe(encounterOf(wv.period, wv.dir, heading, speed))}</td>
                </tr>
            {/each}
            {#if wx.windKn != null}<tr><td><i style="background:#111;border-color:#bbb" /></td><td>Wind</td><td>{f0(wx.windKn)} kn</td><td /><td>{deg(wx.windDir)}</td><td /></tr>{/if}
            {#if current}<tr><td><i style="background:#ff9f1a" /></td><td>Current</td><td>{f1(current.kn)} kn</td><td /><td>sets {deg(current.set)}</td><td /></tr>{/if}
        </table>
    {/if}
    <div class="zlegend">
        {#each PHENOMENA.filter(k => zones.causes[k]?.length) as k}
            <div class="zrow">
                <i class="zone" style="background:{ZONE_COLORS[k]}" /><b>{ZONE_LABEL[k]}</b>
                <span class="zc">{zones.causes[k]?.map(c => `${c.label} ${c.height.toFixed(1)} m ${c.period.toFixed(0)} s${c.strong ? '' : ' (if higher)'}`).join(' · ')}</span>
            </div>
        {/each}
        {#if multi}<div class="zrow"><i class="zone stripes" />Striped = two warnings at the same heading and speed</div>{/if}
        {#if !wx.seaWindy}<div class="zrow sub">Sectors from SWH, Swell 1 and Swell 2 (sea not read from Windy yet: Weather → Read sea).</div>{/if}
        {#if !zones.runs.length}<div class="zrow ok">✓ No IMO warning at any heading or speed with these waves.</div>{/if}
    </div>
    <div class="arrowinfo"><i class="ya" /><b>{deg(heading)} · {Math.max(0, speed).toFixed(1)} kn</b> through the water (tip on the speed rings{speed > VMAX ? `; above ${VMAX} kn: drawn at the rim` : ''})</div>
    <div class="rp-note">
        {#if !compact}
            <Hint title="What the colours mean" size={14}>
                <p>Coloured: headings and speeds where the IMO MSC.1/Circ.1228 checks warn <b>with the waves now</b> (at or above your warning heights, Settings → Weather limits), one colour per warning. The <b>darker middle</b> is closer to the exact condition (e.g. encounter period nearer the roll period): closeness, not a probability.{#if $polarPale} Pale: would warn if the waves were higher.{/if}</p>
                <p>Sectors come from {wx.seaWindy ? 'Sea' : 'SWH'}, Swell 1 and Swell 2{wx.seaWindy ? ' (the SWH flag is for reference: it is sea and swell together)' : ''}.</p>
            </Hint>
        {/if}
        {#if hiddenKinds.length}<b>Switched off here:</b> {hiddenKinds.map(k => ZONE_LABEL[k]).join(', ')} (still checked and listed).{/if}
        Advisory only.{#if !rollPeriod} No roll period set: no rolling checks.{/if}{#if !lbp} No LBP set: no surf-riding / high-wave checks.{/if}
    </div>
</div>

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import type { Phenomenon, ResonanceSettings } from '../lib/circ1228';
    import { dangerZones, PHENOMENA, zoneOpacity, ZONE_COLORS, ZONE_LABEL } from '../lib/dangerZones';
    import { arrowPoints, barbSvg, textOn } from '../lib/shipGlyph';
    import { shipSymbolSvg, type ShipStyle } from '../lib/shipSymbols';
    import { encounterOf, fmtTe, wavesOf, type WaveId, type WxPoint } from '../lib/weather';
    import { fullFlagColors, type FlagColors } from '../lib/shipGlyph';
    import { polarPale, polarShow } from '../state';

    export let wx: WxPoint;
    export let heading: number;
    export let speed: number;
    export let lbp: number | null;
    export let rollPeriod: number | null;
    export let settings: ResonanceSettings;
    export let size = 250;
    export let style: ShipStyle = 'classic';
    export let imo = false;
    export let current: { kn: number; set: number } | null = null;
    export let colors: Partial<FlagColors> = {};
    /** Ship window: no weather legend (the window lists the weather) and a short note */
    export let compact = false;

    const VMAX = 25;
    const RINGS = [5, 10, 15, 20, 25];
    const SPOKES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

    // degree labels round the rim only in the big diagram of the Polar tab (the ship window stays compact)
    $: big = !compact && size >= 320;
    $: col = fullFlagColors(colors);
    $: waveColor = (id: WaveId) => (id === 'swh' ? col.swh : id === 'sea' ? col.sea : id === 'sw1' ? col.swell : col.swell2);
    $: C = size / 2;
    // flags outside the circle; a flag from (nearly) the same direction as another goes in a second,
    // outer lane. Room for two lanes is always kept, so the circle never changes size (owner, 2026-10-28)
    // flags made longer so height and period read well (owner, 2026-10-30)
    $: lane = big ? 46 : Math.max(34, Math.round(size * 0.105));
    $: placed = placeFlags(flags, big ? 16 : 22);
    const lanes = 2;
    $: R = C - lanes * lane - (big ? 26 : 4);
    $: labelR = R + lanes * lane + (big ? 2 : 3);
    $: S = big ? 30 : 22;
    $: rad = (v: number) => (Math.min(v, VMAX) / VMAX) * R;
    $: pt = (b: number, r: number): [number, number] => [C + r * Math.sin((b * Math.PI) / 180), C - r * Math.cos((b * Math.PI) / 180)];
    $: tip = (b: number, r: number, sz: number): string => {
        const [x, y] = pt(b, r);
        const [lx, ly] = pt(b - 155, sz);
        const [rx, ry] = pt(b + 155, sz);
        return `${x},${y} ${x + lx - C},${y + ly - C} ${x + rx - C},${y + ry - C}`;
    };
    $: arrowPts = arrowPoints(C, C, heading, 0, rad(Math.min(Math.max(0, speed), VMAX)), big ? 2.6 : 2, big ? 14 : 11, big ? 7.5 : 6)
        .map(p => p.map(n => n.toFixed(1)).join(','))
        .join(' ');
    const anchor = (a: number) => (a > 10 && a < 170 ? 'start' : a > 190 && a < 350 ? 'end' : 'middle');

    $: zones = dangerZones(wx, lbp, rollPeriod, settings, { show: $polarShow, pale: $polarPale });
    $: hiddenKinds = (Object.keys($polarShow) as Phenomenon[]).filter(k => !$polarShow[k]);
    // One path per warning (or pair of warnings) and shade: the slices overlap a little and are
    // filled as one shape, so there are no seams or darker stripes between them
    const uid = `pz${Math.random().toString(36).slice(2, 8)}`;
    $: groups = (() => {
        const m = new Map<string, { kinds: Phenomenon[]; strong: boolean; core: boolean; d: string[] }>();
        for (const r of zones.runs) {
            const key = `${r.kinds.join('+')}|${r.strong}|${r.core}`;
            const g = m.get(key) ?? { kinds: r.kinds, strong: r.strong, core: r.core, d: [] };
            g.d.push(wedge(r.h, r.v0, r.v1));
            m.set(key, g);
        }
        // pale first, real warnings on top
        return [...m.values()].sort((a, b) => Number(a.strong) - Number(b.strong));
    })();
    $: patterns = [...new Set(groups.filter(g => g.kinds.length > 1).map(g => g.kinds.join('+')))].map(k => ({ id: `${uid}-${k.replace(/\+/g, '-')}`, kinds: k.split('+') as Phenomenon[] }));
    $: multi = patterns.length > 0;
    $: zonePaths = groups.map(g => ({
        d: g.d.join(''),
        fill: g.kinds.length > 1 ? `url(#${uid}-${g.kinds.join('-')})` : ZONE_COLORS[g.kinds[0]],
        opacity: zoneOpacity(g.strong, g.core),
    }));

    function wedge(h: number, v0: number, v1: number): string {
        // 1° slices, a little wider so neighbouring slices meet without a gap
        const a0 = h - 0.65;
        const a1 = h + 0.65;
        const r0 = rad(v0);
        const r1 = rad(v1);
        const f = (n: number) => n.toFixed(1);
        const [x0, y0] = pt(a0, r0);
        const [x1, y1] = pt(a0, r1);
        const [x2, y2] = pt(a1, r1);
        const [x3, y3] = pt(a1, r0);
        return `M${f(x0)},${f(y0)}L${f(x1)},${f(y1)}A${f(r1)},${f(r1)} 0 0 1 ${f(x2)},${f(y2)}L${f(x3)},${f(y3)}A${f(r0)},${f(r0)} 0 0 0 ${f(x0)},${f(y0)}Z`;
    }

    interface Flag {
        dir: number;
        color: string;
        /** Height and period, written on two lines inside the flag */
        lines: string[];
    }
    const txt = (h: number, p: number | null | undefined) => [`${h.toFixed(1)}m`, ...(p != null ? [`${p.toFixed(0)}s`] : [])];
    // all four wave kinds (owner, 2026-10-30): swell 1, swell 2, sea, SWH (swell 2 from 0.3 m)
    $: flags = wavesOf(wx)
        .filter(wv => wv.h != null && wv.dir != null && wv.h > (wv.id === 'sw2' ? 0.3 - 1e-9 : 0.05))
        .sort((a, b) => ['sw1', 'sw2', 'sea', 'swh'].indexOf(a.id) - ['sw1', 'sw2', 'sea', 'swh'].indexOf(b.id))
        .map(wv => ({ dir: wv.dir as number, color: waveColor(wv.id), lines: txt(wv.h as number, wv.period) }));

    /**
     * Lane per flag: inner lane unless a flag already there comes from within `gap` degrees, then the
     * outer lane; when both are taken the flag is turned aside, a little more each time, so no two overlap.
     */
    function placeFlags(list: Flag[], gap: number): { f: Flag; lane: number; nudge: number }[] {
        const out: { f: Flag; lane: number; nudge: number }[] = [];
        const clash = (d: number, l: number) => out.some(o => o.lane === l && Math.abs(((d - o.f.dir - o.nudge + 540) % 360) - 180) < gap);
        for (const f of list) {
            let done = false;
            for (const n of [0, gap, -gap, 2 * gap, -2 * gap, 3 * gap, -3 * gap]) {
                for (const l of [0, 1]) {
                    if (!clash(f.dir + n, l)) {
                        out.push({ f, lane: l, nudge: n });
                        done = true;
                        break;
                    }
                }
                if (done) break;
            }
            if (!done) out.push({ f, lane: 1, nudge: 4 * gap });
        }
        return out;
    }

    $: marks =
        placed.map(({ f, lane: l, nudge }) => flagSvg(f.dir + nudge, R + 2 + l * lane, R + (l + 1) * lane, f)).join('') +
        // inside the circle, in line: current near the ship, wind barb further out, so both stay visible
        (current && current.kn > 0.05 ? currentArrow(current.set) : '') +
        (wx.windKn != null && wx.windDir != null ? barbSvg(C, C, wx.windDir, wx.windKn, '#111111', R * 0.96, big ? 1.3 : 1, false, R * 0.5) : '');

    /** Windy-style flag pointing in at the circle from where the waves come, text along the flag */
    function flagSvg(dir: number, r0: number, rEnd: number, f: Flag): string {
        const half = big ? 12 : Math.max(9, size * 0.028);
        const font = big ? 10.5 : Math.max(8, size * 0.025);
        const p = (r: number, s: number) => {
            const a = (dir * Math.PI) / 180;
            return [C + r * Math.sin(a) + s * Math.cos(a), C - r * Math.cos(a) + s * Math.sin(a)].map(n => n.toFixed(1)).join(',');
        };
        const poly = `<polygon points="${[p(r0, 0), p(r0 + half * 1.3, -half), p(rEnd, -half), p(rEnd, half), p(r0 + half * 1.3, half)].join(' ')}" fill="${f.color}" stroke="rgba(0,0,0,0.8)" stroke-width="1" stroke-linejoin="round"/>`;
        const [tx, ty] = p((r0 + half * 1.1 + rEnd) / 2, 0).split(',');
        const ang = ((dir % 360) + 360) % 360 < 180 ? dir - 90 : dir + 90; // never upside down
        const dy = f.lines.length > 1 ? [-0.55, 0.55] : [0];
        const spans = f.lines.map((l, i) => `<tspan x="0" y="${(dy[i] * font * 1.05).toFixed(1)}">${l}</tspan>`).join('');
        return `${poly}<text transform="translate(${tx},${ty}) rotate(${ang.toFixed(1)})" text-anchor="middle" dominant-baseline="central" font-size="${font}" font-weight="bold" font-family="sans-serif" fill="${textOn(f.color)}">${spans}</text>`;
    }

    function currentArrow(set: number): string {
        const [x0, y0] = pt(set, S / 2 + 3);
        const [x1, y1] = pt(set, R * 0.42);
        return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#e67e00" stroke-width="2.5" stroke-dasharray="4 3"/><polygon points="${tip(set, R * 0.46, 8)}" fill="#e67e00"/>`;
    }

    const f0 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(0));
    const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1));
    const deg = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(0).padStart(3, '0')}°`);
</script>

<style lang="less">
    .rp {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    svg {
        display: block;
    }
    .t {
        fill: rgba(255, 255, 255, 0.8);
        font: 9px sans-serif;
    }
    .t.in {
        fill: #333;
    }
    .t.b {
        font-weight: bold;
    }
    .arrowinfo {
        font-size: 10.5px;
        margin-top: 3px;
        .ya {
            display: inline-block;
            width: 16px;
            height: 5px;
            margin-right: 4px;
            background: #ffd400;
            border: 1px solid #000;
            vertical-align: middle;
        }
    }
    .zlegend {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 10.5px;
        margin-top: 4px;
        align-self: stretch;
        .zrow {
            display: flex;
            align-items: baseline;
            gap: 5px;
            flex-wrap: wrap;
        }
        .zc {
            opacity: 0.8;
        }
        i.zone {
            display: inline-block;
            width: 14px;
            height: 10px;
            border: 1px solid #000;
            flex: none;
            align-self: center;
        }
        i.stripes {
            background: repeating-linear-gradient(45deg, #e53935 0 4px, #9c27b0 4px 8px);
        }
        .ok {
            color: #7fe08a;
        }
        .sub {
            opacity: 0.75;
            font-style: italic;
        }
    }
    .rp-key {
        border-collapse: collapse;
        font-size: 10.5px;
        margin-top: 4px;
        color: inherit;
        background: none;
        td {
            padding: 1px 5px;
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
        i {
            display: inline-block;
            width: 14px;
            height: 6px;
            border: 1px solid #000;
            vertical-align: middle;
        }
    }
    .rp-note {
        font-size: 10px;
        opacity: 0.7;
        margin-top: 3px;
        text-align: center;
    }
</style>
