<!-- Safe speed plan (owner, 2026-10-30): keep the track, avoid the chosen weather by slowing down,
     speeding up, or stopping and drifting in open water. Shows each change and why, to help the
     master decide. -->
<div class="g-card">
<div class="g-card__head">
    <span class="g-card__title">Safe speed plan</span>
    <span class="g-chip">decision support: the master decides</span>
    <Hint title="Safe speed plan" width={360}>
        <p>Keeps <b>your track</b> and changes only the <b>speed</b> to keep out of the weather you chose: slow down so it passes ahead, speed up to get past before it comes, or <b>stop and drift</b> in open water until it has gone.</p>
        <p>Speeds come from your RPM table only (fastest = top of the table), never a barred RPM. Weather: the forecast fetched in the Weather section. Land distance is from a coarse world map: no depths, traffic or shelter information.</p>
        <p>Using it adds a waypoint where the speed changes or the ship stops (named e.g. "9.5 kn" or "Wait 12 h"), sets each leg's speed and the stops, and keeps a copy of your route as it was in Compare. Not included: currents, drift while stopped, depths, traffic. It does not replace official weather routing.</p>
    </Hint>
</div>
<div class="set">
    <Icon name="sliders" size={14} /> Avoiding: <b>{avoidedText || 'nothing chosen'}</b> ({$spSettings.level === 1 ? 'amber alerts and red limits' : 'red limits'}) ·
    stops {$spSettings.allowStop ? `allowed ≥ ${$spSettings.minLandNm} nm from land` : 'not allowed'} · changes at most every {$spSettings.stepH} h · fuel when stopped: {$spSettings.stopFuel != null ? `${$spSettings.stopFuel} t/day` : 'not counted'}
    <button class="pp-btn pp-btn--ghost small" on:click={() => openSettings('speedplan')}>Change</button>
</div>

{#if $route.waypoints.length < 2 || $plan.etd == null}
    <div class="g-empty"><Icon name="lifebuoy" size={30} /><p>Make the route and set the ETD first (Route → Waypoints).</p></div>
{:else}
    <div class="arrive">
        <b>Arrive:</b>
        <label><input type="radio" bind:group={arrive} value="planned" /> at the planned ETA {fmtTime($plan.eta)} UTC (or as soon after as is safe)</label>
        <label><input type="radio" bind:group={arrive} value="earliest" /> as early as possible</label>
        <label><input type="radio" bind:group={arrive} value="own" /> by a time I choose</label>
        {#if arrive === 'own'}<div class="eta">Arrive by (UTC) <DateTimeField value={own ?? $plan.eta} clearable={false} on:change={e => (own = e.detail)} /></div>{/if}
    </div>
    <p class="pp-note">Starts {$plan.fix ? 'from your present position' : 'at WP1 at the ETD'}: <b>{fmtTime($plan.fix ? $plan.fix.t : $plan.etd)} UTC</b>.</p>
    <div class="row">
        <button class="pp-btn g-btn--primary" disabled={!wxOk} on:click={() => runSpeedPlan(arrive, own ?? $plan.eta)}><Icon name="lifebuoy" size={15} /> Work out a safe speed plan</button>
        {#if !wxOk}<span class="g-status g-status--warn">Get the forecast first (Weather → Get forecast).</span>{/if}
    </div>
    {#if $spStatus}<p class="status">{$spStatus}</p>{/if}

    {#if o && o.res.ok && o.res.safe}
        {#if stale}<p class="stale">The route has changed since this plan: work it out again before taking it.</p>{/if}
        <div class="pp-scroll tw">
            <table class="tbl cmp">
                <thead><tr><th>Plan</th><th class="g">ETA UTC</th><th>Time</th><th class="g">Fuel {unit}</th><th class="g" title="Hours inside the weather you chose to avoid">Bad-weather hours</th><th class="g">What is met</th></tr></thead>
                <tbody>
                    <tr>
                        <td>Your speeds</td>
                        <td class="g">{fmtTime(o.res.planned.eta)}</td>
                        <td>{dh(o.res.planned.hours)}</td>
                        <td class="g">{o.res.planned.fuel.toFixed(1)}</td>
                        <td class="g" class:bad={o.res.planned.badH > 0}>{o.res.planned.badH.toFixed(0)}</td>
                        <td class="g wrap">{o.res.planned.events.length ? [...new Set(o.res.planned.events.flatMap(e => e.kinds))].join(', ') : 'nothing'}</td>
                    </tr>
                    <tr class="safe">
                        <td><b>🛟 Safe plan</b></td>
                        <td class="g"><b>{fmtTime(o.res.safe.eta)}</b></td>
                        <td>{dh(o.res.safe.hours)} <span class="delta">({sign(o.res.safe.hours - o.res.planned.hours)} h)</span></td>
                        <td class="g">{o.res.safe.fuel.toFixed(1)} <span class="delta">({sign(o.res.safe.fuel - o.res.planned.fuel, 1)})</span></td>
                        <td class="g" class:bad={o.res.safe.badH > 0} class:good={o.res.safe.badH === 0}>{o.res.safe.badH.toFixed(0)}</td>
                        <td class="g wrap">{o.res.mode === 'hard' ? 'nothing you chose to avoid' : 'some: speed alone cannot avoid it all'}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- time strip: speed and stops along the voyage -->
        <div class="strip" title="Speed along the voyage: darker = faster, orange = stopped">
            {#each o.res.segments as seg}
                <span style="flex:{Math.max(0.5, (seg.toMs - seg.fromMs) / 3.6e6)};background:{stripColor(seg)}" title="{fmtTime(seg.fromMs)}–{fmtTime(seg.toMs)} UTC: {seg.action === 'stop' ? 'stopped' : seg.sicw.toFixed(1) + ' kn'}">{seg.action === 'stop' ? '⏸' : seg.sicw.toFixed(0)}</span>
            {/each}
        </div>

        <h4>What to do and why</h4>
        <div class="pp-scroll tw">
            <table class="tbl segs">
                <thead><tr><th>From UTC</th><th>To UTC</th><th class="g">Do</th><th>Speed kn</th><th>RPM</th><th class="g">Where it starts</th></tr></thead>
                <tbody>
                    {#each o.res.segments as seg, i}
                        <tr class="seg" class:stop={seg.action === 'stop'}>
                            <td>{fmtTime(seg.fromMs)}</td>
                            <td>{fmtTime(seg.toMs)}</td>
                            <td class="g"><b>{doText(seg)}</b></td>
                            <td>{seg.action === 'stop' ? '0' : seg.sicw.toFixed(1)}</td>
                            <td>{seg.rpm ?? '—'}</td>
                            <td class="g">{fmtLat(seg.from.lat, 1)} {fmtLon(seg.from.lon, 1)}</td>
                        </tr>
                        <tr class:stop={seg.action === 'stop'}>
                            <td colspan="6" class="why" class:badwhy={seg.badH > 0}>
                                <b>Why:</b> {seg.why}
                                {#if seg.action === 'stop' && o.drift[i]}<br /><i>Drift estimate {o.drift[i]?.kn.toFixed(1)} kn towards {deg(o.drift[i]?.toward)}: about {((o.drift[i]?.kn ?? 0) * (seg.toMs - seg.fromMs) / 3.6e6).toFixed(0)} nm while stopped (wind only; check sea room).</i>{/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        {#if o.res.planned.events.length}
            <p class="pp-note"><b>With your planned speeds you would meet:</b></p>
            <ul class="notes">
                {#each o.res.planned.events as e}<li>{fmtTime(e.fromMs)}–{fmtTime(e.toMs)} UTC near {fmtLat(e.from.lat, 1)} {fmtLon(e.from.lon, 1)}: {e.worst.detail}</li>{/each}
            </ul>
        {/if}
        {#if o.res.notes.length}<ul class="notes">{#each o.res.notes as n}<li>{n}</li>{/each}</ul>{/if}
        {#if o.runInfo}<div class="g-prov"><Icon name="calendar" size={14} /> <span>Weather data: {o.runInfo.air} · waves {o.runInfo.waves} · fetched {o.runInfo.fetched}. Work the plan out again with each new forecast.</span></div>{/if}
        <div class="row">
            <button class="pp-btn g-btn--primary" disabled={stale || o.taken} on:click={take}><Icon name="check" size={15} /> Use this speed plan in my route</button>
            {#if o.taken}<span class="g-status g-status--ok">Taken. The route as it was is in Compare.</span>{/if}
        </div>
    {:else if o && !o.res.ok}
        <ul class="notes">{#each o.res.notes as n}<li>{n}</li>{/each}</ul>
    {/if}
{/if}
</div>

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import { fmtLat, fmtLon, fmtTime } from '../lib/format';
    import type { PlanSegment } from '../lib/speedPlan';
    import { plan, planKey, route, vessel, wxPlanKey, wxSeries } from '../state';
    import { AVOID_LABEL, runSpeedPlan, spOutcome, spRouteKey, spSettings, spStatus, takeSpeedPlan, type AvoidKind } from '../windy/speedPlanJob';
    import DateTimeField from './DateTimeField.svelte';
    import { openSettingsSection } from './SettingsTab.svelte';

    export let onSettings: (() => void) | null = null;

    let arrive: 'planned' | 'earliest' | 'own' = 'planned';
    let own: number | null = null;
    $: wxOk = $wxSeries.length > 0 && $wxPlanKey === $planKey;
    $: o = $spOutcome;
    $: stale = !!o && !o.taken && o.key !== keyOf($route, $plan);
    const keyOf = (_r: unknown, _p: unknown) => spRouteKey();
    $: avoidedText = (Object.keys($spSettings.avoid) as AvoidKind[])
        .filter(k => $spSettings.avoid[k])
        .map(k => AVOID_LABEL[k].split(' (')[0].split(':')[0])
        .join(', ');
    $: unit = ($vessel.speedTable ?? []).some(r => r.fuel != null) ? 't' : '(relative)';
    $: maxV = o ? Math.max(1, ...o.res.segments.map(s => s.sicw)) : 1;

    const deg = (d: number | null | undefined) => (d == null ? '—' : `${String(Math.round(d) % 360).padStart(3, '0')}°`);
    const dh = (h: number) => `${Math.floor(h / 24)}d ${String(Math.round(h % 24)).padStart(2, '0')}h`;
    const sign = (x: number, dp = 0) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(dp)}`;
    function doText(seg: PlanSegment): string {
        if (seg.action === 'stop') return '⏸ Stop and drift';
        const d = seg.sicw - seg.plannedSicw;
        return d < -0.3 ? '▼ Slow down' : d > 0.3 ? '▲ Speed up' : '● As planned';
    }
    function stripColor(seg: PlanSegment): string {
        if (seg.action === 'stop') return '#d95926';
        const f = Math.max(0.15, seg.sicw / maxV);
        return `rgba(57, 135, 229, ${f.toFixed(2)})`;
    }
    function take() {
        if (!o) return;
        const n = o.res.segments.length;
        if (!confirm(`Put this speed plan into your route? Up to ${n} waypoints are added where the speed changes or the ship stops; leg speeds and stops are set. A copy of your route as it is now goes to the Compare tab.`)) return;
        takeSpeedPlan();
    }
    function openSettings(id: string) {
        openSettingsSection(id);
        onSettings?.();
    }
</script>

<style lang="less">
    .set {
        background: var(--g-bg-2);
        padding: 6px 8px;
        border-radius: 6px;
        font-size: 12px;
        color: var(--g-text-2);
        margin-bottom: 10px;
    }
    .sm {
        padding: 1px 6px !important;
        font-size: 11px !important;
    }
    .arrive {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 6px 0;
        label {
            display: flex;
            gap: 4px;
            align-items: center;
        }
    }
    .eta {
        margin: 2px 0 2px 22px;
    }
    .row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        margin: 8px 0;
    }
    .status {
        color: #9fd3ff;
        margin: 4px 0;
    }
    .stale {
        color: #ffd28a;
    }
    .tw {
        max-height: 360px;
    }
    .tbl {
        border-collapse: collapse;
        font-size: 11px;
        width: 100%;
        th,
        td {
            padding: 3px 5px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            text-align: left;
            vertical-align: top;
        }
        th {
            position: sticky;
            top: 0;
            background: #333;
            white-space: nowrap;
        }
        .g {
            border-left: 1px solid rgba(255, 255, 255, 0.25);
        }
        td.bad {
            color: #ff8a8a;
            font-weight: bold;
        }
        td.good {
            color: #7fe39a;
            font-weight: bold;
        }
        tr.safe td {
            background: rgba(57, 135, 229, 0.12);
        }
        tr.stop td {
            background: rgba(217, 89, 38, 0.12);
        }
        .why {
            white-space: normal;
            padding: 0 6px 5px 10px;
            opacity: 0.9;
        }
        .badwhy {
            color: #ffb3b3;
        }
        tr.seg td {
            border-bottom: 0;
            padding-top: 5px;
        }
        td.wrap {
            white-space: normal;
            min-width: 110px;
        }
        td:not(.why):not(.wrap) {
            white-space: nowrap;
        }
    }
    .delta {
        opacity: 0.75;
        font-size: 10px;
    }
    .strip {
        display: flex;
        height: 18px;
        margin: 8px 0 4px;
        border-radius: 3px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.25);
        span {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: #fff;
            overflow: hidden;
            border-right: 1px solid rgba(0, 0, 0, 0.4);
        }
    }
    .notes {
        font-size: 11px;
        opacity: 0.9;
        margin: 4px 0;
        padding-left: 18px;
    }
    .run {
        font-size: 10px;
        color: #9fd3ff;
    }
</style>
