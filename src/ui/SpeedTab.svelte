<div class="g-card">
<div class="g-card__head">
    <span class="g-card__title">Legs: speed, RPM and fuel</span>
    <Hint title="Speed, RPM and fuel">
        <p>Each leg's calm-water speed (SiCW), the RPM and fuel from your RPM / speed / fuel table, the weather loss and (if switched on) the current along the track.</p>
        <p><b>Amber</b> RPM / fuel = outside your table (extrapolated). <b>⛔</b> = RPM in a range the ship must not run at (Settings → Speed, RPM and fuel). Fuel counts steaming hours only (none while stopped).</p>
        <p>Planning aid only: weather, current and fuel figures are estimates.</p>
    </Hint>
</div>
<div class="pp-note set">
    Weather loss: <b>{($route.lossMethod ?? 'manual') === 'kwon' ? 'estimate from the forecast (Kwon, rough)' : 'your allowance per leg'}</b> ·
    currents <b>{$route.useCurrents ? 'included' : 'not included'}</b> · table: <b>{rows.length} rows</b> (Settings → Speed, RPM and fuel)
</div>
{#each $sim.notes as n}<div class="g-status g-status--warn">{n}</div>{/each}

<div class="pp-scroll tw">
    <table class="tbl legs">
        <thead>
            <tr>
                <th>Leg</th><th>Dist</th>
                <th title="Speed in calm water used ({$route.mode === 'eta' ? 'average needed for the ETA' : 'as planned'})">SiCW</th>
                <th>RPM</th><th>Fuel t/d</th>
                <th title="Average weather speed loss">Wx −kn</th>
                <th title="Average current along the track (+ helping)">Cur kn</th>
                <th>SOG</th><th>Hours</th><th>Fuel t</th>
                <th title="Speed in calm water and RPM needed to make good the planned speed over ground in this weather and current">To hold {$route.mode === 'eta' ? 'ETA' : 'speed'}: SiCW / RPM</th>
            </tr>
        </thead>
        <tbody>
            {#each $sim.legs as l}
                {@const leg = $plan.legs[l.legIdx]}
                <tr>
                    <td>WP{l.legIdx + 1}→{l.legIdx + 2}</td>
                    <td>{leg.distNm.toFixed(1)}</td>
                    <td>{l.sicw.toFixed(1)}</td>
                    <td class:warn={l.outsideTable} class:barred={!!barredRange($vessel, l.rpm)} title={barredRange($vessel, l.rpm) ? `Barred RPM: ${barredRange($vessel, l.rpm)?.why || 'in a barred range'}` : ''}>{l.rpm != null ? l.rpm.toFixed(0) : '—'}{barredRange($vessel, l.rpm) ? ' ⛔' : ''}</td>
                    <td class:warn={l.outsideTable}>{l.fuelPerDay != null ? l.fuelPerDay.toFixed(1) : '—'}</td>
                    <td>{l.avgLossKn.toFixed(1)}</td>
                    <td>{l.avgCurAlong >= 0 ? '+' : ''}{l.avgCurAlong.toFixed(1)}</td>
                    <td><b>{l.avgSog.toFixed(1)}</b></td>
                    <td>{l.hours.toFixed(1)}{leg.delayAfterH ? ` +${leg.delayAfterH}h stop` : ''}</td>
                    <td>{l.fuelT != null ? l.fuelT.toFixed(1) : '—'}</td>
                    <td class:warn={l.holdOutsideTable} class:barred={!!barredRange($vessel, l.rpmToHold)}>{l.sicwToHold.toFixed(1)} / {l.rpmToHold != null ? l.rpmToHold.toFixed(0) : '—'}{barredRange($vessel, l.rpmToHold) ? ' ⛔' : ''}</td>
                </tr>
            {/each}
        </tbody>
        {#if $sim.legs.length}
            <tfoot>
                <tr>
                    <td><b>Total</b></td>
                    <td>{$plan.totalNm.toFixed(1)}</td>
                    <td colspan="5" />
                    <td>{$plan.totalHours > 0 ? ($plan.totalNm / $plan.totalHours).toFixed(1) : '—'}</td>
                    <td>{$plan.totalHours.toFixed(1)}{$plan.totalDelayH ? ` +${$plan.totalDelayH}h stops` : ''}</td>
                    <td>{$sim.totalFuelT != null ? $sim.totalFuelT.toFixed(1) : '—'}</td>
                    <td>ETA {fmtTime($plan.eta)} UTC</td>
                </tr>
            </tfoot>
        {/if}
    </table>
</div>
<div class="pp-note">amber = outside your table (extrapolated) · ⛔ = barred RPM</div>
</div>

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import { fmtTime } from '../lib/format';
    import { plan, route, sim, vessel } from '../state';
    import { barredRange } from '../lib/speed';

    $: rows = $vessel.speedTable ?? [];
</script>

<style lang="less">
    .set {
        background: rgba(255, 255, 255, 0.06);
        padding: 4px 6px;
        border-radius: 3px;
    }
    .tw {
        max-height: 320px;
    }
    .tbl {
        border-collapse: collapse;
        font-size: 11px;
        th,
        td {
            padding: 2px 5px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            white-space: nowrap;
            text-align: left;
        }
        th {
            position: sticky;
            top: 0;
            background: #333;
        }
        td.warn {
            color: #ffd400;
        }
        td.barred {
            color: #ff8a8a;
            font-weight: bold;
        }
        tfoot td {
            border-top: 1px solid rgba(255, 255, 255, 0.4);
        }
    }
</style>
