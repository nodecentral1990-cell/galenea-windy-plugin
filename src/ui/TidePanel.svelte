<!-- Weather › Tides (owner, 2026-11-13): tide for any point on the map: graph, high and low waters with time and
     height, hourly heights, PDF. Model sea level (Open-Meteo marine, Météo-France) relative to MEAN SEA LEVEL, not
     chart datum: a guide, not official tide tables. All times UTC. -->
<PlaceCard />

{#if d}
    <div class="g-card">
        <div class="g-card__head">
            <span class="g-card__title">Tides: {d.point.name || (d.point.nearest ? `near ${d.point.nearest.name}` : 'at sea')}</span>
            <span class="mono tp__pos">{fmtLat(d.point.lat, 1)} {fmtLon(d.point.lon, 1)}</span>
            <Hint title="Tides" width={340}>
                <p>From Open-Meteo's marine data (Météo-France model, about 8 km grid): the <b>model sea level</b>, which includes the tide, relative to <b>mean sea level</b>, not chart datum, so the heights are not the ones in the tide tables.</p>
                <p>High and low waters are found from the hourly heights (time to the minute, worked out between the hours). Open-Meteo says it is "not suitable for coastal navigation and does not replace your nautical almanac". Near the coast, in estuaries and harbours the model can be far out: use the official tide tables (Admiralty / the national hydrographic office).</p>
            </Hint>
            <div class="g-card__actions">
                <button class="g-btn g-btn--s" disabled={!d.tide} on:click={pdf} title="Download as a PDF file"><Icon name="download" size={14} /> PDF</button>
            </div>
        </div>
        <div class="g-prov"><Icon name="calendar" size={14} /> <span>{placeSources(d)[1]}</span></div>
        <div class="g-status g-status--warn tp__warn">Model sea level above mean sea level, not chart datum. Not official tide tables.</div>
        {#if !d.tide}
            <div class="g-status g-status--warn">No tide for this place: {d.marine.error || 'no answer from Open-Meteo'}.</div>
        {:else}
            <div class="g-seg tp__span" role="tablist">
                {#each [1, 3, 7] as n}<button class="g-seg__opt" class:is-on={span === n} role="tab" aria-selected={span === n} on:click={() => (span = n)}>{n === 1 ? 'Today' : `${n} days`}</button>{/each}
            </div>
            <TideGraph ts={d.tide.ts} h={d.tide.h} turns={d.turns} from={d.startDay} to={d.startDay + span * 86400e3} height={span === 7 ? 220 : 190} labels={span < 7} />
            <h4>High and low waters <small class="pp-note">UTC · m above mean sea level</small></h4>
            <div class="pp-scroll">
                <table class="tp__tbl">
                    <thead><tr><th>Day</th><th class="g">High water</th><th class="g">Low water</th><th class="g" title="Highest minus lowest water of the day">Range m</th></tr></thead>
                    <tbody>
                        {#each d.days as day}
                            <tr>
                                <td class="nowrap"><b>{DOW[new Date(day.day).getUTCDay()]}</b> {new Date(day.day).getUTCDate()} {MON[new Date(day.day).getUTCMonth()]}</td>
                                <td class="g hw">{#each day.turns.filter(t => t.kind === 'high') as t}<span>{hm(t.t)} <b>{t.h.toFixed(2)}</b></span>{:else}—{/each}</td>
                                <td class="g lw">{#each day.turns.filter(t => t.kind === 'low') as t}<span>{hm(t.t)} <b>{t.h.toFixed(2)}</b></span>{:else}—{/each}</td>
                                <td class="g">{range(day)}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            <h4>Every hour <small class="pp-note">m above mean sea level · HW / LW = high / low water in that hour</small></h4>
            <div class="pp-scroll tp__gw">
                <table class="tp__grid">
                    <thead><tr><th>UTC</th>{#each d.days as day}<th>{DOW[new Date(day.day).getUTCDay()]} {new Date(day.day).getUTCDate()}</th>{/each}</tr></thead>
                    <tbody>
                        {#each HOURS as hr}
                            <tr>
                                <td class="mono">{p2(hr)}:00</td>
                                {#each d.days as day}
                                    {@const row = byT.get(day.day + hr * 3600e3)}
                                    <td class:hwc={row?.turn?.kind === 'high'} class:lwc={row?.turn?.kind === 'low'}>{row?.tideM != null ? row.tideM.toFixed(2) : '—'}{#if row?.turn}<small> {row.turn.kind === 'high' ? 'HW' : 'LW'}</small>{/if}</td>
                                {/each}
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
{:else if !$placeBusy}
    <div class="g-empty"><Icon name="motion" size={30} /><p>Choose a place above: tide graph, high and low waters and the height every hour for 7 days.</p></div>
{/if}

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import PlaceCard from './PlaceCard.svelte';
    import TideGraph from './TideGraph.svelte';
    import { downloadFile } from './download';
    import { fmtLat, fmtLon } from '../lib/format';
    import { tidePdf } from '../lib/placePdf';
    import type { PlaceDay } from '../lib/placeWx';
    import { logEvent } from '../lib/activityLog';
    import { placeBusy, placeData, placeSources } from '../windy/placeJob';

    $: d = $placeData;
    let span = 3;
    $: byT = new Map((d?.hours ?? []).map(h => [h.t, h]));
    const HOURS = Array.from({ length: 24 }, (_, i) => i);
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const p2 = (n: number) => String(n).padStart(2, '0');
    const hm = (t: number) => `${p2(new Date(t).getUTCHours())}:${p2(new Date(t).getUTCMinutes())}`;
    function range(day: PlaceDay): string {
        const hs = day.turns.filter(t => t.kind === 'high').map(t => t.h);
        const ls = day.turns.filter(t => t.kind === 'low').map(t => t.h);
        return hs.length && ls.length ? (Math.max(...hs) - Math.min(...ls)).toFixed(2) : '—';
    }
    function pdf() {
        if (!d) return;
        const name = (d.point.name || `${d.point.lat.toFixed(2)}_${d.point.lon.toFixed(2)}`).replace(/[^\w.-]+/g, '_');
        downloadFile(tidePdf({ ...d, sources: placeSources(d).slice(1, 2) }), 'application/pdf', `tides-${name}-${new Date().toISOString().slice(0, 10)}.pdf`);
        logEvent('place', 'Tide PDF saved');
    }
</script>

<style lang="less">
    .tp__pos {
        font-family: var(--g-mono);
        color: var(--g-accent-hover);
        font-size: 12px;
    }
    .tp__warn {
        margin: 4px 0 8px;
    }
    .tp__span {
        margin: 4px 0 6px;
    }
    .tp__tbl,
    .tp__grid {
        border-collapse: collapse;
        font-size: 12px;
        width: 100%;
        th,
        td {
            padding: 3px 6px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.07);
            text-align: left;
        }
        .g {
            border-left: 1px solid rgba(255, 255, 255, 0.22);
        }
    }
    .tp__tbl {
        .hw span,
        .lw span {
            margin-right: 10px;
            white-space: nowrap;
        }
        .hw b {
            color: #7fe3ff;
        }
        .lw b {
            color: #ffd28a;
        }
    }
    .tp__gw {
        max-height: 420px;
    }
    .tp__grid {
        td,
        th {
            white-space: nowrap;
            text-align: right;
        }
        td:first-child,
        th:first-child {
            text-align: left;
        }
        .hwc {
            background: rgba(127, 227, 255, 0.14);
        }
        .lwc {
            background: rgba(255, 210, 138, 0.14);
        }
        small {
            color: var(--g-text-3);
        }
    }
    .nowrap {
        white-space: nowrap;
    }
</style>
