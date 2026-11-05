<!-- Optimised versions side by side, track-list style (one row per route), in the Optimise tab and full size. -->
<div class="tablewrap pp-scroll" class:full>
    <table>
        <thead>
            <tr>
                <th>Map</th>
                <th class="g">Route WP{o.a + 1} → WP{o.b + 1}</th>
                <th class="g">Distance</th>
                <th class="g" title="Speed in calm water to set (one speed, or the range when it changes leg by leg), and the RPM from your table">Speed / RPM</th>
                <th class="g">ETA (UTC) / time</th>
                <th class="g">Fuel {unit}</th>
                <th title="Fuel against your own route at the same arrival time: − = less fuel (green), + = more (red)">vs yours</th>
                <th class="g" title="Hours inside your red weather limits">Limit h</th>
                <th title="Hours with an IMO roll / broaching warning">IMO h</th>
                <th class="g" title="Largest roll / pitch estimate (significant, °) on the way. Estimate only">Roll° / pitch°</th>
                <th class="g" title="Highest latitude reached">Max lat</th>
            </tr>
        </thead>
        <tbody>
            {#each o.versions as v}
                {@const save = v.id === 'planned' ? null : mine.ev.fuel - v.ev.fuel}
                <tr class:taken={o.taken === v.id} class:best={v.id === bestId}>
                    <td>{#if v.id !== 'planned'}<input type="checkbox" checked={!hidden.has(v.id)} on:change={() => onToggle(v.id)} title="Show on the map" />{/if}<i class="sw" style="background:{PREVIEW_COLORS[v.id]}" /></td>
                    <td class="g name">
                        {v.label}{#if v.id === bestId} <span class="chip">least fuel</span>{/if}{#if o.taken === v.id} <span class="chip">taken</span>{/if}
                        {#if v.id !== 'planned'}
                            <div class="acts">
                                <button class="pp-btn small" disabled={stale} on:click={() => onTake(v)}>Use</button>
                                <button class="pp-btn pp-btn--ghost small" on:click={() => onCompare(v)} title="Add this version to the Compare tab">Compare</button>
                            </div>
                        {/if}
                    </td>
                    <td class="g">{Math.round(v.ev.distNm)} nm<div class="sub">{v.wps.length} WPs</div></td>
                    <td class="g">{speedText(v)} kn<div class="sub">{rpmText(v)}</div></td>
                    <td class="g mono" class:late={v.ev.eta > o.eta + 61 * 60e3}>{fmtTime(v.ev.eta)}<div class="sub">{dh(v.ev.hours)}{v.ev.noWxH ? ` · ${v.ev.noWxH.toFixed(0)} h past forecast` : ''}</div></td>
                    <td class="g"><b>{v.ev.fuel.toFixed(1)}</b></td>
                    <td class:good={save != null && save > 0.05} class:bad={save != null && save < -0.05}>{save == null ? '' : `${save > 0 ? '−' : '+'}${Math.abs(save).toFixed(1)}`}<div class="sub">{save == null ? '' : pct(save, mine.ev.fuel)}</div></td>
                    <td class="g" class:bad={v.ev.breachH > 0}>{v.ev.breachH.toFixed(0)}</td>
                    <td class:warn={(v.ev.extra.IMO ?? 0) > 0}>{(v.ev.extra.IMO ?? 0).toFixed(0)}</td>
                    <td class="g">{v.motion ? `${v.motion.roll.toFixed(0)} / ${v.motion.pitch.toFixed(1)}` : '—'}</td>
                    <td class="g">{latText(v.maxLat)}</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<script lang="ts">
    import { fmtTime } from '../lib/format';
    import type { RouteVersion } from '../lib/optimisePlan';
    import type { OptOutcome } from '../windy/optimiseJob';
    import { PREVIEW_COLORS } from '../windy/previewLayer';

    export let o: OptOutcome;
    export let bestId: string | null;
    export let hidden: Set<string>;
    export let stale = false;
    export let full = false;
    export let onToggle: (id: string) => void;
    export let onTake: (v: RouteVersion) => void;
    export let onCompare: (v: RouteVersion) => void;

    $: mine = o.versions[0];
    $: unit = o.res.fuelUnit === 't' ? 't' : '(relative)';

    const dh = (h: number) => `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`;
    const pct = (save: number, base: number) => (base > 0 ? `${((100 * Math.abs(save)) / base).toFixed(1)} %` : '');
    const latText = (lat: number) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;
    function range(s: number[], dec: number, gap: number): string {
        if (!s.length) return '—';
        const lo = Math.min(...s);
        const hi = Math.max(...s);
        return hi - lo < gap ? lo.toFixed(dec) : `${lo.toFixed(dec)}–${hi.toFixed(dec)}`;
    }
    const speedText = (v: RouteVersion) => range(v.ev.legs.map(l => l.sicw), 1, 0.05);
    function rpmText(v: RouteVersion): string {
        const s = v.ev.legs.map(l => l.rpm).filter((x): x is number => x != null);
        return s.length ? `${range(s, 0, 0.5)} rpm` : '';
    }
</script>

<style lang="less">
    .tablewrap {
        max-height: 460px;
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
            padding: 3px 5px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            white-space: nowrap;
            text-align: left;
            vertical-align: top;
        }
        th {
            background: #2a3440;
            position: sticky;
            top: 0;
            white-space: normal;
        }
        .g {
            border-left: 2px solid rgba(255, 255, 255, 0.35);
        }
        tr.taken td {
            background: rgba(57, 255, 20, 0.12);
        }
        tr.best td.name {
            font-weight: bold;
        }
    }
    .full table {
        font-size: 13px;
    }
    .name {
        white-space: normal !important;
        min-width: 120px;
    }
    .acts {
        margin-top: 2px;
        display: flex;
        gap: 4px;
    }
    .sub {
        font-size: 10px;
        opacity: 0.7;
    }
    .sw {
        display: inline-block;
        width: 14px;
        height: 4px;
        margin-left: 3px;
        vertical-align: middle;
        border: 1px solid #000;
    }
    .chip {
        background: #39ff14;
        color: #000;
        border-radius: 3px;
        padding: 0 4px;
        font-size: 10px;
        font-weight: bold;
    }
    .good {
        color: #7fe08a;
        font-weight: bold;
    }
    .bad {
        background: rgba(255, 77, 77, 0.35);
    }
    .warn {
        background: rgba(255, 212, 0, 0.35);
        color: #000;
    }
    .late {
        color: #ffd28a;
    }
    .mono {
        font-family: monospace;
    }
    .small {
        padding: 1px 6px;
        font-size: 10px;
    }
</style>
