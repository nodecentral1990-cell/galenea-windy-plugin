<!-- The weather-along-route table (used in the Weather tab and in its full-size view). -->
<div class="tablewrap pp-scroll" class:full>
    <table>
        <thead>
            <tr class="groups">
                <th class="g" colspan="3">Date / time (UTC)</th>
                <th class="g" colspan="2">Position</th>
                <th class="g" colspan={hasStops ? 6 : 5} title="SOG = SiCW − weather loss + current along the track">Ship</th>
                <th class="g" colspan="4">Wind</th>
                <th class="g" colspan="5" title="Significant wave height: sea and swell together, and the wave power (energy)">SWH</th>
                <th class="g" colspan="4" title="Sea (wind waves): Windy's wind-wave layer, read along the route. Until it is read: worked out from SWH and the swells, direction from the wind, no period (shown in grey)">Sea</th>
                <th class="g" colspan="4" title="Main swell">Swell 1</th>
                <th class="g" colspan="4" title="Second swell, if any">Swell 2</th>
                {#if hasMotion}<th class="g" colspan="2" title="Roll and pitch ESTIMATE (linear method, see ⚙ Settings → Roll and pitch). Parametric roll is not predicted: see the IMO warnings">Roll / pitch (est.)</th>{/if}
                {#if hasWind100}<th class="g" colspan="1">100 m</th>{/if}
                <th class="g" colspan="3" title="Air and sea temperature, and spray icing on deck (Overland method). Windy has no sea-ice data">Temp °C / icing</th>
                <th class="g" colspan="2">Vis / rain</th>
                <th class="g" colspan="2">Other</th>
            </tr>
            <tr>
                <th class="g">Date</th><th>Time</th><th>WP</th>
                <th class="g">Lat</th><th>Lon</th>
                <th class="g" title="Course over ground">Crs</th>
                <th title="Speed in calm water used: your planned speed, or what a fixed ETA needs">SiCW</th>
                <th title="Speed lost to weather (your allowance, or the estimate chosen in ⚙ Settings)">Wx loss</th>
                <th title="Ocean current: speed (kn) and the direction it sets TOWARDS (Windy's currents layer)">Current</th>
                <th title="Speed over ground">SOG</th>
                {#if hasStops}<th title="Drift while stopped: speed and direction towards (current + wind drift)">Drift</th>{/if}
                <th class="g">kn</th><th title="Direction it comes from, °T (relative to the bow)">from</th><th>Gust</th><th>Bf</th>
                <th class="g">m</th><th>s</th><th title="From °T (relative to the bow)">from</th><th title="Encounter period, s: how often the waves meet the ship at the planned course and speed through the water (IMO MSC.1/Circ.1228). ∞ = the waves never pass">Te</th>
                <th title="Wave power (energy flux), kW per metre of wave front. Colour: light under 10, then 10–30, 30–60, 60–100, over 100 (plugin's bands, not Windy's exact legend). * = worked out from SWH and period">Power kW/m</th>
                <th class="g">m</th><th>s</th><th title="From °T (relative to the bow)">from</th><th title="Encounter period, s: how often the waves meet the ship at the planned course and speed through the water (IMO MSC.1/Circ.1228). ∞ = the waves never pass">Te</th>
                <th class="g">m</th><th>s</th><th>from</th><th title="Encounter period, s: how often the waves meet the ship at the planned course and speed through the water (IMO MSC.1/Circ.1228). ∞ = the waves never pass">Te</th>
                <th class="g">m</th><th>s</th><th>from</th><th title="Encounter period, s: how often the waves meet the ship at the planned course and speed through the water (IMO MSC.1/Circ.1228). ∞ = the waves never pass">Te</th>
                {#if hasMotion}<th class="g" title="Significant roll to one side, ° (likely largest in 3 h)">Roll°</th><th title="Significant pitch, ° (likely largest in 3 h)">Pitch°</th>{/if}
                {#if hasWind100}<th class="g">kn / from</th>{/if}
                <th class="g">Air</th><th title="Sea surface temperature: one value per forecast point from Windy, not hourly">Sea</th><th title="Spray icing (Overland): light < 0.7 cm/h, moderate 0.7–2, heavy 2–4, extreme > 4 cm/h">Icing</th>
                <th class="g" title="Visibility, nautical miles (Windy's visibility layer). >7 = more than 7 nm">Vis nm</th><th>Rain mm</th>
                <th class="g">hPa</th><th>Warnings</th>
            </tr>
        </thead>
        <tbody>
            {#each rows as r}
                {@const lv = levelsOf(r)}
                <tr class:wp={r.atWaypoint != null} class:now={isNow(r)} class:past={r.time < Date.now() - 1800e3} on:click={() => onRowClick(r)}>
                    <td class="g nowrap">{fmtTime(r.time).slice(0, 6)}{#if r.src}<span class="srcmk" class:om={r.src.kind === 'openmeteo'} title={r.src.label}>{r.src.kind === 'openmeteo' ? 'OM' : 'E'}</span>{/if}</td>
                    <td class="mono">{fmtTime(r.time).slice(7)}</td>
                    <td>{#if r.atWaypoint != null}<b>WP{r.atWaypoint + 1}</b>{/if}</td>
                    <td class="g mono">{fmtLat(r.pos.lat, 1)}</td>
                    <td class="mono">{fmtLon(r.pos.lon, 1)}</td>
                    {#if r.stopped}
                        <td class="g" colspan="3"><span class="chip stop">STOPPED</span></td>
                        <td class="nowrap">{cur(r)}</td>
                        <td>0</td>
                    {:else}
                        <td class="g">{dir(r.pos.course)}</td>
                        <td>{f1(r.sicw)}</td>
                        <td>{r.lossKn ? '−' + f1(r.lossKn) : '0'}</td>
                        <td class="nowrap">{cur(r)}</td>
                        <td class="nowrap"><b>{f1(r.sog ?? r.speedKn)}</b></td>
                    {/if}
                    {#if hasStops}<td class="nowrap">{r.stopped && r.drift ? `${r.drift.kn.toFixed(1)} → ${dir(r.drift.toward)}` : ''}</td>{/if}
                    {#if r.wx}
                        {@const w = r.wx}
                        <td class="g lv{lv.Wind}">{f0(w.windKn)}</td>
                        <td>{dir(w.windDir)}<span class="rel">{rel(w.windDir, r.pos.course)}</span></td>
                        <td>{f0(w.gustKn)}</td>
                        <td>{beaufort(w.windKn) ?? ''}</td>
                        <td class="g lv{lv.SWH}">{f1(w.hs)}</td>
                        <td>{f0(w.hsPeriod)}</td>
                        <td>{dir(w.hsDir)}<span class="rel">{rel(w.hsDir, r.pos.course)}</span></td>
                        <td class="te">{te(r, w.hsPeriod, w.hsDir)}</td>
                        <td class="pw pw{band(w.powerKw)}">{f0(w.powerKw)}{w.powerCalc ? '*' : ''}</td>
                        <td class="g lv{lv.Sea}" class:est={!w.seaWindy}>{f1(w.seaHs)}</td>
                        <td>{w.seaWindy ? f0(w.seaPeriod) : ''}</td>
                        <td class:est={!w.seaWindy}>{dir(seaDirOf(w))}<span class="rel">{rel(seaDirOf(w), r.pos.course)}</span></td>
                        <td class="te">{w.seaWindy ? te(r, w.seaPeriod, seaDirOf(w)) : ''}</td>
                        <td class="g lv{lv['Swell 1']}">{f1(w.sw1)}</td>
                        <td>{f0(w.sw1Period)}</td>
                        <td>{dir(w.sw1Dir)}<span class="rel">{rel(w.sw1Dir, r.pos.course)}</span></td>
                        <td class="te">{te(r, w.sw1Period, w.sw1Dir)}</td>
                        <td class="g lv{lv['Swell 2']}">{f1(w.sw2)}</td>
                        <td>{f0(w.sw2Period)}</td>
                        <td>{dir(w.sw2Dir)}<span class="rel">{rel(w.sw2Dir, r.pos.course)}</span></td>
                        <td class="te">{te(r, w.sw2Period, w.sw2Dir)}</td>
                        {#if hasMotion}
                            {@const m = motionOf(r)}
                            <td class="g nowrap" class:lv1={m != null && $vessel.rollLimitDeg != null && m.roll >= $vessel.rollLimitDeg}>{m ? m.roll.toFixed(0) : ''}<span class="rel">{m ? ` (${m.rollMax.toFixed(0)})` : ''}</span></td>
                            <td class="nowrap" class:lv1={m != null && $vessel.pitchLimitDeg != null && m.pitch >= $vessel.pitchLimitDeg}>{m ? m.pitch.toFixed(1) : ''}<span class="rel">{m ? ` (${m.pitchMax.toFixed(1)})` : ''}</span></td>
                        {/if}
                        {#if hasWind100}<td class="g">{w.wind100Kn != null ? `${f0(w.wind100Kn)} / ${dir(w.wind100Dir ?? null)}` : ''}</td>{/if}
                        <td class="g lv{lv['Air temp'] ?? 0}">{f0(w.airTempC)}</td>
                        <td class="lv{lv['Sea temp'] ?? 0}">{f0(w.seaTempC)}</td>
                        {@const ic = sprayIcing(w.windKn, w.airTempC, w.seaTempC)}
                        <td class="lv{lv.Icing ?? 0}">{ic && ic.cls !== 'none' ? ic.cls : ''}</td>
                        <td class="g" class:poor={w.visNm != null && w.visNm < 2}>{vis(w.visNm)}</td>
                        <td>{w.precipMm != null && w.precipMm > 0 ? f1(w.precipMm) : ''}{w.fog ? ' fog' : ''}{w.thunder ? ' ⚡' : ''}</td>
                        <td class="g">{f0(w.pressureHpa)}</td>
                        <td class="warn">
                            {#each r.resonance as h}<span class="chip {h.phenomenon}" title={h.detail}>{SHORT[h.phenomenon]}</span>{/each}
                        </td>
                    {:else}
                        <td colspan={28 + (hasWind100 ? 1 : 0) + (hasMotion ? 2 : 0)} class="g pp-note">{r.beyond ? 'beyond forecast' : 'no data'}</td>
                    {/if}
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<script lang="ts">
    import { fmtLat, fmtLon, fmtTime } from '../lib/format';
    import { beaufort, encounterOf, relFrom, seaDirOf, type WxRow } from '../lib/weather';
    import type { Phenomenon } from '../lib/circ1228';
    import { motionAt, motionMissing } from '../lib/motionEstimate';
    import { sprayIcing } from '../lib/icing';
    import { vessel } from '../state';

    export let rows: WxRow[];
    export let isNow: (r: WxRow) => boolean;
    export let onRowClick: (r: WxRow) => void;
    /** Full-size view: no height limit */
    export let full = false;

    const SHORT: Record<Phenomenon, string> = { parametric: 'PR', synchronous: 'SR', highWaves: 'HW', surf: 'BR' };
    $: hasWind100 = rows.some(r => r.wx?.wind100Kn != null);
    $: hasStops = rows.some(r => r.stopped);
    $: hasMotion = !motionMissing($vessel);
    const motionOf = (r: WxRow) => (r.stopped ? motionAt(r.wx, r.pos.course, 0, $vessel) : motionAt(r.wx, r.pos.course, r.speedKn, $vessel));

    const f0 = (v: number | null | undefined) => (v == null ? '' : v.toFixed(0));
    const f1 = (v: number | null | undefined) => (v == null ? '' : v.toFixed(1));
    const dir = (d: number | null) => (d == null ? '' : d.toFixed(0).padStart(3, '0') + '°');
    /** Visibility in nm; anything over 7 nm is shown as ">7" */
    const vis = (v: number | null | undefined) => (v == null ? '—' : v > 7 ? '>7' : v < 1 ? v.toFixed(1) : v.toFixed(0));
    const rel = (d: number | null, crs: number) => (d == null ? '' : ` (${relFrom(d, crs).toFixed(0)})`);
    /** Wave power colour band */
    const band = (p: number | null | undefined) => (p == null ? 0 : p < 10 ? 1 : p < 30 ? 2 : p < 60 ? 3 : p < 100 ? 4 : 5);
    /** Encounter period at the planned course and speed (0 kn when stopped) */
    const te = (r: WxRow, period: number | null | undefined, from: number | null) => {
        const t = encounterOf(period, from, r.pos.course, r.stopped ? 0 : r.speedKn);
        return t == null ? '' : !isFinite(t) || t > 999 ? '∞' : t.toFixed(1);
    };
    const cur = (r: WxRow) => (r.wx?.currentKn != null ? `${f1(r.wx.currentKn)} → ${dir(r.wx.currentSet ?? null)}` : '—');

    function levelsOf(r: WxRow): Record<string, number> {
        const out: Record<string, number> = {};
        for (const h of r.limits) out[h.what] = Math.max(out[h.what] ?? 0, h.level);
        return out;
    }
</script>

<style lang="less">
    .tablewrap {
        max-height: 520px;
        &.full {
            max-height: none;
            height: 100%;
        }
    }
    table {
        border-collapse: collapse;
        font-size: 11px;
        th,
        td {
            padding: 2px 4px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            white-space: nowrap;
        }
        th {
            position: sticky;
            top: 0;
            background: #333;
            text-align: left;
        }
        tr {
            cursor: pointer;
        }
        .g {
            border-left: 2px solid rgba(255, 255, 255, 0.35);
        }
        tr.groups th {
            text-align: center;
            background: #2a3440;
            top: 0;
        }
        thead tr:nth-child(2) th {
            top: 19px;
        }
        tbody tr:nth-child(even) td {
            background-color: rgba(255, 255, 255, 0.035);
        }
        td.te {
            color: #9fd3ff;
        }
        .rel {
            opacity: 0.6;
            font-size: 10px;
        }
        tr.wp td {
            border-top: 1px solid rgba(255, 255, 255, 0.35);
        }
        tr.now td {
            background: rgba(255, 212, 0, 0.15);
        }
        td.lv1 {
            background: rgba(255, 212, 0, 0.55);
            color: #000;
        }
        td.pw1 {
            background: rgba(120, 200, 255, 0.18);
        }
        td.pw2 {
            background: rgba(80, 160, 255, 0.4);
        }
        td.pw3 {
            background: rgba(150, 90, 230, 0.55);
        }
        td.pw4 {
            background: rgba(210, 60, 200, 0.7);
            color: #fff;
        }
        td.pw5 {
            background: rgba(120, 0, 90, 0.9);
            color: #fff;
            font-weight: bold;
        }
        td.est {
            opacity: 0.6;
            font-style: italic;
        }
        td.poor {
            background: rgba(255, 212, 0, 0.55);
            color: #000;
        }
        td.lv2 {
            background: rgba(255, 77, 77, 0.75);
            color: #000;
        }
    }
    .mono {
        font-family: monospace;
    }
    .nowrap {
        white-space: nowrap;
    }
    .chip {
        display: inline-block;
        padding: 0 4px;
        margin-right: 2px;
        border-radius: 3px;
        color: #fff;
        font-weight: bold;
        font-size: 10px;
        &.parametric {
            background: #e53935;
        }
        &.synchronous {
            background: #9c27b0;
        }
        &.highWaves {
            background: #1e9e4a;
        }
        &.surf {
            background: #3949ab;
        }
        &.stop {
            background: #9aa0a6;
        }
    }
    tr.past td {
        opacity: 0.78;
    }
    .srcmk {
        display: inline-block;
        margin-left: 3px;
        padding: 0 3px;
        border-radius: 3px;
        font-size: 8.5px;
        font-weight: 700;
        line-height: 12px;
        background: #5b6b84;
        color: #fff;
        vertical-align: 1px;
        &.om {
            background: #2f7d6d;
        }
    }
</style>
