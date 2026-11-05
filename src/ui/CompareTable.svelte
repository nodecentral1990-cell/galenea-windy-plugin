<!-- Route comparison in the style of a weather-routing "track list": one row per route,
     columns in groups with dividers. Best value green, worst red (where better/worse is clear). -->
<div class="wrap pp-scroll" class:big>
    <table>
        <thead>
            <tr class="groups">
                <th class="g" colspan="2">Track</th>
                <th class="g" colspan="2">Departure</th>
                <th class="g" colspan="2">Arrival</th>
                <th class="g" colspan="2">Passage</th>
                <th class="g" colspan="4" title="SOG = SiCW + WxF + CuF">Speed (kn)</th>
                <th class="g" colspan="3">Engine</th>
                <th class="g" colspan="4" title="Time (days, hours) with wind / waves over the level, stops included">Weather exposure (D H)</th>
                <th class="g" colspan="2">Check</th>
            </tr>
            <tr>
                <th class="g">Name</th><th>Type</th>
                <th class="g">ETD UTC</th><th>Position</th>
                <th class="g">ETA UTC</th><th>Position</th>
                <th class="g">nm</th><th title="ETD to ETA, stops included">Duration</th>
                <th class="g" title="Speed in calm water used, time-weighted">SiCW</th>
                <th title="Weather factor: average speed lost to weather (−)">WxF</th>
                <th title="Current factor: average current along the track (+ helping, − against). Only if currents were read">CuF</th>
                <th>SOG</th>
                <th class="g" title="From the RPM per leg or your RPM / speed table (⚙ Settings → Speed, RPM and fuel)">RPM</th>
                <th title="Needs propeller pitch (⚙ Settings → Ship particulars) or the 0-slip speed per leg">Slip %</th>
                <th title="From your RPM / speed / fuel table (⚙ Settings → Speed, RPM and fuel), steaming hours only">Fuel t</th>
                <th class="g" title="Wind over {GALE_KN} kn (Beaufort 8 and above)">Wind &gt;{GALE_KN} kn</th>
                <th title="SWH {th.hsLimit ?? '—'} m or the seas / swell limits (red, ⚙ Settings → Weather limits) exceeded">Wave limit</th>
                <th title="Wind limit (red, ⚙ Settings → Weather limits) exceeded for the sector">Wind limit</th>
                <th title="IMO MSC.1/Circ.1228 roll / broaching warnings (advisory)">IMO</th>
                <th class="g" title="Share of the voyage time that had forecast data">Forecast</th><th>Notes</th>
            </tr>
        </thead>
        <tbody>
            {#each routes as s}
                {@const v = summaries.get(s.id)}
                {#if v}
                    <tr>
                        <td class="g name"><i class="sw" style="background:{s.color}" /> {v.name}</td>
                        <td>{s.id === 'live' ? (s.route.voyage ? 'Active' : 'Route tab') : 'Kept'}</td>
                        <td class="g">{#if v.etd != null}{fmtTime(v.etd).slice(0, 6)}<br />{fmtTime(v.etd).slice(7)}{:else}—{/if}</td>
                        <td class="mono pos">{#if v.dep}{fmtLat(v.dep.lat, 1)}<br />{fmtLon(v.dep.lon, 1)}{/if}</td>
                        <td class="g {mark('eta', v)}">{#if v.eta != null}{fmtTime(v.eta).slice(0, 6)}<br />{fmtTime(v.eta).slice(7)}{:else}—{/if}</td>
                        <td class="mono pos">{#if v.arr}{fmtLat(v.arr.lat, 1)}<br />{fmtLon(v.arr.lon, 1)}{/if}</td>
                        <td class="g {mark('dist', v)}">{v.distNm.toFixed(0)}</td>
                        <td class="nowrap {mark('dur', v)}">{v.etd != null ? fmtDH(v.totalH) : '—'}{#if v.stoppedH > 0.05}<br /><span class="sub">stops {fmtDH(v.stoppedH)}</span>{/if}</td>
                        <td class="g">{f(v.avgSicw)}</td>
                        <td class={mark('wx', v)}>{sign(v.avgWxKn)}</td>
                        <td class={mark('cur', v)}>{sign(v.avgCurrentKn)}</td>
                        <td><b>{f(v.avgSog)}</b></td>
                        <td class="g">{f(v.avgRpm, 0)}</td>
                        <td>{v.avgSlipPct != null ? v.avgSlipPct.toFixed(1) : '—'}</td>
                        <td class={mark('fuel', v)}>{v.fuelT != null ? v.fuelT.toFixed(1) : '—'}</td>
                        <td class="g {mark('gale', v)}">{fmtDH(v.galeH)}</td>
                        <td class={mark('wave', v)}>{fmtDH(v.waveLimitH)}</td>
                        <td class={mark('wind', v)}>{fmtDH(v.windLimitH)}</td>
                        <td class={mark('imo', v)}>{fmtDH(v.imoH)}</td>
                        <td class="g">{Math.round(v.wxCover * 100)} %</td>
                        <td class="notes">{v.problems.join(' ')}</td>
                    </tr>
                {/if}
            {/each}
        </tbody>
    </table>
</div>
<p class="pp-note">
    Type: <b>Route tab</b> = the route now in the Route tab (<b>Active</b> once a voyage is started), <b>Kept</b> = a copy kept
    for comparison. "—" in Fuel / RPM / Slip: add your RPM / speed / fuel table (⚙ Settings → Speed, RPM and fuel) and propeller pitch (⚙ Settings → Ship particulars).
</p>

<script lang="ts">
    import { fmtLat, fmtLon, fmtTime } from '../lib/format';
    import { fmtDH, GALE_KN, type RouteSummary } from '../lib/compare';
    import type { SavedRoute } from '../state';
    import type { Thresholds } from '../lib/weather';

    export let summaries: Map<string, RouteSummary>;
    export let routes: SavedRoute[];
    export let th: Thresholds;
    export let big = false;

    const f = (v: number | null, d = 1) => (v == null ? '—' : v.toFixed(d));
    const sign = (v: number | null) => (v == null || Math.abs(v) < 0.005 ? '0.00' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);

    /** What each marked column compares; lower is better unless `higher` */
    const COLS: Record<string, { val: (s: RouteSummary) => number | null; higher?: boolean }> = {
        eta: { val: s => s.eta },
        dist: { val: s => s.distNm },
        dur: { val: s => (s.etd != null ? s.totalH : null) },
        wx: { val: s => s.avgWxKn, higher: true },
        cur: { val: s => s.avgCurrentKn, higher: true },
        fuel: { val: s => s.fuelT },
        gale: { val: s => s.galeH },
        wave: { val: s => s.waveLimitH },
        wind: { val: s => s.windLimitH },
        imo: { val: s => s.imoH },
    };

    function mark(col: string, s: RouteSummary): string {
        const c = COLS[col];
        if (!c || routes.length < 2) return '';
        const vals = routes.map(r => summaries.get(r.id)).filter((x): x is RouteSummary => !!x).map(c.val).filter((v): v is number => v != null && isFinite(v));
        const v = c.val(s);
        if (v == null || vals.length < 2) return '';
        const best = c.higher ? Math.max(...vals) : Math.min(...vals);
        const worst = c.higher ? Math.min(...vals) : Math.max(...vals);
        if (Math.abs(best - worst) < 1e-9) return '';
        return Math.abs(v - best) < 1e-9 ? 'best' : Math.abs(v - worst) < 1e-9 ? 'worst' : '';
    }
</script>

<style lang="less">
    .wrap {
        margin: 6px 0;
        max-height: 420px;
        &.big {
            max-height: none;
        }
    }
    table {
        border-collapse: collapse;
        font-size: 11px;
        th,
        td {
            padding: 3px 5px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            text-align: left;
            white-space: nowrap;
        }
        thead th {
            position: sticky;
            top: 0;
            background: #333;
        }
        tr.groups th {
            text-align: center;
            background: #2a3440;
        }
        thead tr:nth-child(2) th {
            top: 21px;
        }
        .g {
            border-left: 2px solid rgba(255, 255, 255, 0.35);
        }
        tbody tr:nth-child(even) td {
            background-color: rgba(255, 255, 255, 0.035);
        }
        td.best {
            background: rgba(46, 204, 113, 0.35) !important;
        }
        td.worst {
            background: rgba(255, 77, 77, 0.35) !important;
        }
        td.notes {
            white-space: normal;
            min-width: 140px;
            font-size: 10px;
            color: #ffb3b3;
        }
    }
    .big table {
        font-size: 12px;
    }
    td.name {
        white-space: normal;
        min-width: 110px;
        max-width: 180px;
    }
    td.pos,
    .sub {
        font-size: 10px;
    }
    .sub {
        opacity: 0.75;
    }
    .mono {
        font-family: monospace;
    }
    .nowrap {
        white-space: nowrap;
    }
    .sw {
        display: inline-block;
        width: 14px;
        height: 4px;
        border: 1px solid #000;
        vertical-align: middle;
    }
</style>
