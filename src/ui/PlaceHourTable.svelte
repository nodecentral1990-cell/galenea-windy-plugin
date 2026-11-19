<!-- Port weather hour by hour (owner, 2026-11-13). Columns grouped with dividers: time · weather · wind · the four
     waves (SWH, Sea, Swell 1, Swell 2: height, period, arrow) · wave power · air / feels like · sea temperature ·
     current · rain · tide (high / low water marked). All times UTC. -->
<table class="ph" class:ph--full={full}>
    <thead>
        <tr>
            <th class="ph__t">UTC</th>
            <th class="g">Weather</th>
            <th class="g" title="Wind speed (arrow: the way it blows; figure: where it comes from) and gusts">Wind kn</th>
            <th>Gust</th>
            {#each WAVES as w}
                <th class="g" title="{w.label}: height m, period s; arrow = the way the waves go"><i class="ph__sw" style="background:{colorOf(w.id)}" />{w.label}</th>
            {/each}
            <th class="g" title="Wave power, kW per metre of wave front">kW/m</th>
            <th class="g">Air °C</th>
            <th title="Feels like: wind chill when cold and windy, heat index when hot and humid">Feels</th>
            <th class="g">Sea °C</th>
            <th class="g" title="Current speed and where it sets (Open-Meteo marine model)">Current kn</th>
            <th class="g">Rain mm</th>
            <th class="g" title="Model sea level, m above mean sea level (not chart datum). HW / LW = high / low water in that hour">Tide m</th>
        </tr>
    </thead>
    <tbody>
        {#each rows as h, i (h.t)}
            {#if i === 0 || dayOf(h.t) !== dayOf(rows[i - 1].t)}
                <tr class="ph__day"><td colspan="17">{dayTxt(h.t)}{#if dayInfo(h.t)}<span class="ph__dayx">{dayInfo(h.t)}</span>{/if}</td></tr>
            {/if}
            <tr class:ph__hw={h.turn?.kind === 'high'} class:ph__lw={h.turn?.kind === 'low'} class:ph__past={h.t < now - 3600e3} class:ph__now={h.t <= now && now < h.t + 3600e3}>
                <td class="ph__t mono">{hm(h.t)}</td>
                <td class="g ph__wx"><WxGlyph kind={h.kind} size={18} title={h.words} /> <span>{h.words}</span></td>
                <td class="g nowrap"><DirArrow from={h.wx?.windDir} /> <b>{f0(h.wx?.windKn)}</b> <small>{d3(h.wx?.windDir)}</small></td>
                <td>{f0(h.wx?.gustKn)}</td>
                {#each placeWaves(h) as w}
                    <td class="g nowrap" class:ph__muted={w.h == null}>
                        {#if w.h != null}<DirArrow from={w.dir} size={12} /> {w.h.toFixed(1)}{w.estimated ? '*' : ''} <small>{w.period != null ? `${w.period.toFixed(0)} s` : ''}</small>{:else}—{/if}
                    </td>
                {/each}
                <td class="g" style={powerStyle(h.wx?.powerKw)}>{f0(h.wx?.powerKw)}</td>
                <td class="g">{f0(h.wx?.airTempC)}</td>
                <td title={h.feelsHow}>{f0(h.feelsC)}</td>
                <td class="g">{f1(h.sstC)}</td>
                <td class="g nowrap">{#if h.curKn != null}<DirArrow toward={h.curKn >= 0.05 ? h.curSet : null} size={12} /> {h.curKn.toFixed(1)} <small>{d3(h.curSet)}</small>{:else}—{/if}</td>
                <td class="g">{h.rainMm == null ? '—' : h.rainMm < 0.05 ? '0' : h.rainMm.toFixed(1)}</td>
                <td class="g nowrap">{h.tideM != null ? h.tideM.toFixed(2) : '—'}{#if h.turn}<b class="ph__turn"> {h.turn.kind === 'high' ? 'HW' : 'LW'} {hm(h.turn.t)}</b>{/if}</td>
            </tr>
        {/each}
    </tbody>
</table>

<script lang="ts">
    import DirArrow from './base/DirArrow.svelte';
    import WxGlyph from './base/WxGlyph.svelte';
    import { placeWaves, type PlaceDay, type PlaceHour } from '../lib/placeWx';
    import { flagColors } from '../state';

    export let rows: PlaceHour[] = [];
    export let days: PlaceDay[] = [];
    export let full = false;

    const WAVES = [
        { id: 'swh', label: 'SWH' },
        { id: 'sea', label: 'Sea' },
        { id: 'sw1', label: 'Swell 1' },
        { id: 'sw2', label: 'Swell 2' },
    ];
    const now = Date.now();
    const colorOf = (id: string) => ({ swh: $flagColors.swh, sea: $flagColors.sea, sw1: $flagColors.swell, sw2: $flagColors.swell2 })[id] ?? '#888';
    const p2 = (n: number) => String(n).padStart(2, '0');
    const hm = (t: number | null) => (t == null ? '—' : `${p2(new Date(t).getUTCHours())}:${p2(new Date(t).getUTCMinutes())}`);
    const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayOf = (t: number) => Math.floor(t / 86400e3);
    const dayTxt = (t: number) => `${DOW[new Date(t).getUTCDay()]} ${new Date(t).getUTCDate()} ${MON[new Date(t).getUTCMonth()]}`;
    function dayInfo(t: number): string {
        const d = days.find(x => dayOf(x.day) === dayOf(t));
        if (!d) return '';
        const sun = d.sun.alwaysUp ? 'sun up all day' : d.sun.alwaysDown ? 'no sunrise' : `sunrise ${hm(d.sun.rise)} · sunset ${hm(d.sun.set)}`;
        return `${sun} · moonrise ${hm(d.moon.rise)} · moonset ${hm(d.moon.set)} · ${d.moonName}`;
    }
    const f0 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v.toFixed(0));
    const f1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v.toFixed(1));
    const d3 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '' : `${String(Math.round(v) % 360).padStart(3, '0')}°`);
    // wave power: same bands as the weather table (plugin bands)
    function powerStyle(p: number | null | undefined): string {
        if (p == null) return '';
        const c = p < 10 ? '' : p < 30 ? 'rgba(77,156,255,.18)' : p < 60 ? 'rgba(77,156,255,.32)' : p < 100 ? 'rgba(160,90,220,.38)' : 'rgba(200,60,160,.45)';
        return c ? `background:${c}` : '';
    }
</script>

<style lang="less">
    .ph {
        border-collapse: collapse;
        font-size: 11.5px;
        width: max-content;
        min-width: 100%;
        th,
        td {
            padding: 3px 5px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.07);
            text-align: left;
            white-space: nowrap;
        }
        th {
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .g {
            border-left: 1px solid rgba(255, 255, 255, 0.22);
        }
        small {
            color: var(--g-text-3);
        }
    }
    .ph--full {
        font-size: 12.5px;
    }
    .ph__t {
        position: sticky;
        left: 0;
        background: var(--g-bg-1);
        z-index: 1;
    }
    th.ph__t {
        z-index: 2;
    }
    .ph__sw {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 2px;
        margin-right: 3px;
    }
    .ph__wx span {
        color: var(--g-text-2);
    }
    .ph__day td {
        background: var(--g-bg-3);
        font-weight: 650;
        color: var(--g-text-1);
        position: sticky;
        left: 0;
    }
    .ph__dayx {
        font-weight: 400;
        color: var(--g-text-2);
        margin-left: 10px;
    }
    .ph__hw td {
        background: rgba(127, 227, 255, 0.09);
    }
    .ph__lw td {
        background: rgba(255, 210, 138, 0.09);
    }
    .ph__past td {
        opacity: 0.55;
    }
    .ph__now td {
        box-shadow: inset 0 1px 0 #3fd07a, inset 0 -1px 0 #3fd07a;
    }
    .ph__turn {
        color: #7fe3ff;
        font-size: 10.5px;
    }
    .ph__lw .ph__turn {
        color: #ffd28a;
    }
    .ph__muted {
        color: var(--g-text-3);
    }
    .nowrap {
        white-space: nowrap;
    }
</style>
