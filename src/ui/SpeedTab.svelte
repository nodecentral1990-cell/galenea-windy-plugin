<div class="g-card">
<div class="g-card__head">
    <span class="g-card__title">Legs: speed, RPM and fuel</span>
    <Hint title="Speed, RPM and fuel">
        <p>Each leg's calm-water speed (SiCW), the RPM and fuel from your RPM / speed / fuel table, the weather loss and (if switched on) the current along the track.</p>
        <p><b>Amber</b> RPM / fuel = outside your table (extrapolated). <b>⛔</b> = RPM in a range the ship must not run at, <b>▲ / ▼</b> = above your max / below your min RPM (the gear beside this, Speed, RPM and fuel); "→" shows the RPM advised instead and the warnings above the table say why. Fuel counts steaming hours only (none while stopped).</p>
        <p>Planning aid only: weather, current and fuel figures are estimates.</p>
    </Hint>
    <Gear host="speed" chips={SPEED_CHIPS} />
</div>
<SettingsFold host="speed" />
<div class="pp-note set">
    Weather loss: <b>{lossMethodOf($route) === 'kwon' ? 'estimate from the forecast (Kwon, rough)' : 'your allowance per leg'}</b> ·
    currents <b>{currentsOn($route) ? 'included' : 'not included'}</b> · table: <b>{rows.length} rows</b>
    <Gear host="speed-line" line chips={[{ id: 'speed', part: 'loss', label: 'Weather loss and currents' }, { id: 'speed', part: 'table', label: 'RPM / speed / fuel table' }]} />
</div>
<SettingsFold host="speed-line" />
{#if !rows.length}<div class="g-status">No RPM / speed / fuel table yet, so no RPM or fuel figures. <Gear host="speed-line" line chips={[{ id: 'speed', part: 'table', label: 'RPM / speed / fuel table' }]} /></div>{/if}
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
                {@const ar = adviseRpm($vessel, l.rpm)}
                {@const ah = adviseRpm($vessel, l.rpmToHold)}
                <tr>
                    <td>WP{l.legIdx + 1}→{l.legIdx + 2}</td>
                    <td>{leg.distNm.toFixed(1)}</td>
                    <td>{l.sicw.toFixed(1)}</td>
                    <td class:warn={l.outsideTable} class:barred={!!ar?.issue} title={rpmAdviceText($vessel, l.rpm, 'planned')}>{l.rpm != null ? l.rpm.toFixed(0) : '—'}{ar?.issue ? ` ${MARK[ar.issue]} → ${ar.rpm}` : ''}</td>
                    <td class:warn={l.outsideTable}>{l.fuelPerDay != null ? l.fuelPerDay.toFixed(1) : '—'}</td>
                    <td>{l.avgLossKn.toFixed(1)}</td>
                    <td>{l.avgCurAlong >= 0 ? '+' : ''}{l.avgCurAlong.toFixed(1)}</td>
                    <td><b>{l.avgSog.toFixed(1)}</b></td>
                    <td>{l.hours.toFixed(1)}{leg.delayAfterH ? ` +${leg.delayAfterH}h stop` : ''}</td>
                    <td>{l.fuelT != null ? l.fuelT.toFixed(1) : '—'}</td>
                    <td class:warn={l.holdOutsideTable} class:barred={!!ah?.issue} title={rpmAdviceText($vessel, l.rpmToHold, 'needed')}>{l.sicwToHold.toFixed(1)} / {l.rpmToHold != null ? l.rpmToHold.toFixed(0) : '—'}{ah?.issue ? ` ${MARK[ah.issue]} → ${ah.rpm}` : ''}</td>
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
<div class="pp-note">amber = outside your table (extrapolated) · ⛔ = barred RPM · ▲ = above your max RPM · ▼ = below your min RPM · "→ 66" = the RPM advised instead (reasons above the table)</div>
</div>

<script lang="ts">
    import { currentsOn, lossMethodOf } from '../lib/model';
    import Gear from './base/Gear.svelte';
    import SettingsFold from './settings/SettingsFold.svelte';
    import Hint from './base/Hint.svelte';
    import { fmtTime } from '../lib/format';
    import { plan, route, sim, vessel } from '../state';
    import { adviseRpm, rpmAdviceText, type RpmIssue } from '../lib/speed';
    const MARK: Record<RpmIssue, string> = { barred: '⛔', aboveMax: '▲', belowMin: '▼' };

    $: rows = $vessel.speedTable ?? [];
    const SPEED_CHIPS = [
        { id: 'speed', label: 'Speed, RPM and fuel' },
        { id: 'ship', part: 'particulars', label: 'Ship (propeller pitch, Cb)' },
    ];
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
