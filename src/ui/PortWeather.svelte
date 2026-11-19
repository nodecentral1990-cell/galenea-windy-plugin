<!-- Weather › Port weather (owner, 2026-11-13): for any place (click on the map, or a port by name) the weather for
     the next 7 days, every hour: wind, gust, the four waves, wave power, air / feels-like, sea temperature, current,
     rain, weather in words, tide with high and low water; each day sunrise / sunset and moonrise / moonset. Export
     to PDF. All times UTC. Planning aid only. -->
<PlaceCard />

{#if d}
    <div class="g-card">
        <div class="g-card__head">
            <span class="g-card__title">{d.point.name || (d.point.nearest ? `Near ${d.point.nearest.name}` : 'At sea')}</span>
            <span class="mono pw__pos">{fmtLat(d.point.lat, 1)} {fmtLon(d.point.lon, 1)}</span>
            <Hint title="Port weather" width={360}>
                <p><b>Weather and waves:</b> Windy's point forecast (ECMWF and ECMWF-WAM) for this point{d.stepH === 3 ? '; Windy gives it 3-hourly here, the hours between are worked out in between' : ''}. Times Windy does not cover come from Open-Meteo (free) when that is switched on (the gear beside this, Weather reading).</p>
                <p><b>Tide, current, sea temperature, sea (wind waves when Windy's is not read):</b> Open-Meteo marine (Météo-France model, about 8 km grid). Tide = model sea level relative to <b>mean sea level, not chart datum</b>. Open-Meteo says it is "not suitable for coastal navigation and does not replace your nautical almanac": use the official tide tables.</p>
                <p><b>Feels like</b>: wind chill when cold and windy, heat index when hot and humid. <b>Sun and moon</b>: worked out by the plugin (to a minute or two; the moon a few minutes). Arrows: wind and waves point the way they go (figures: where they come from); current: where it sets.</p>
            </Hint>
            <Gear host="portwx" chips={[{ id: 'weather' }]} />
            <div class="g-card__actions">
                <button class="g-btn g-btn--s" on:click={() => (full = true)} title="All days and columns in a big window"><Icon name="expand" size={14} /> Full size</button>
                <button class="g-btn g-btn--s" on:click={pdf} title="Download as a PDF file"><Icon name="download" size={14} /> PDF</button>
            </div>
        </div>
        <SettingsFold host="portwx" />
        <div class="g-prov"><Icon name="calendar" size={14} /> <span>{provText(d)}</span></div>
        {#if !d.marine.ok}<div class="g-status g-status--warn">Tide, current and sea temperature not available: {d.marine.error || 'no answer from Open-Meteo'}.</div>{/if}

        <div class="pw__days" role="tablist">
            {#each d.days as day, i}
                <button class="pw__day" class:is-on={sel === i} role="tab" aria-selected={sel === i} on:click={() => (sel = i)}>
                    <span class="pw__dname">{i === 0 ? 'Today' : DOW[new Date(day.day).getUTCDay()]} <small>{new Date(day.day).getUTCDate()} {MON[new Date(day.day).getUTCMonth()]}</small></span>
                    <span class="pw__dwx"><WxGlyph kind={day.kind} size={30} title={day.words} /><span>{day.words}</span></span>
                    <span class="pw__dl"><b>{f0(day.windMax)}</b> kn <small>gust {f0(day.gustMax)}</small></span>
                    <span class="pw__dl">SWH <b>{f1(day.swhMax)}</b> m</span>
                    <span class="pw__dl"><b>{f0(day.tMin)}–{f0(day.tMax)}</b> °C · rain <b>{f1(day.rainMm)}</b> mm</span>
                    <span class="pw__dl pw__dt">{#each day.turns as t}<span class:hw={t.kind === 'high'} class:lw={t.kind === 'low'}>{t.kind === 'high' ? 'HW' : 'LW'} {hm(t.t)}</span>{/each}</span>
                </button>
            {/each}
        </div>

        {#if dsel}
            <div class="pw__sky">
                <span title="Sunrise and sunset (UTC)"><i class="pw__sun" />{dsel.sun.alwaysUp ? 'Sun up all day' : dsel.sun.alwaysDown ? 'No sunrise' : `Sunrise ${hm(dsel.sun.rise)} · sunset ${hm(dsel.sun.set)}`}</span>
                <span title="Moonrise and moonset (UTC)"><i class="pw__moon" />Moonrise {hm(dsel.moon.rise)} · moonset {hm(dsel.moon.set)} · {dsel.moonName} ({dsel.moonPct} %)</span>
            </div>
            {#if d.tide}
                <div class="pw__tide">
                    <div class="pw__th">
                        <b>Tide</b>
                        <button type="button" class="g-btn g-btn--s g-btn--ghost pw__tg" on:click={() => goScreen({ tab: 'weather', seg: 'tides' })} title="The tide graph for several days, for this place"><Icon name="tide" size={14} /> Tide graph</button>
                        {#each dsel.turns as t}<span class:hw={t.kind === 'high'} class:lw={t.kind === 'low'}>{t.kind === 'high' ? 'HW' : 'LW'} {hm(t.t)} <b>{t.h.toFixed(2)} m</b></span>{/each}
                        {#if dayRange}<span class="pp-note">highest {dayRange.hi.toFixed(2)} · lowest {dayRange.lo.toFixed(2)} m</span>{/if}
                    </div>
                    <TideGraph ts={d.tide.ts} h={d.tide.h} turns={d.turns} from={dsel.day} to={dsel.day + 86400e3} height={130} />
                    <p class="pp-note">Model sea level above mean sea level, not chart datum. Not official tide tables.</p>
                </div>
            {/if}
            <div class="pp-scroll pw__tw">
                <PlaceHourTable rows={d.hours.filter(h => h.t >= dsel.day && h.t < dsel.day + 86400e3)} days={d.days} />
            </div>
            <p class="pp-note">Every hour, UTC. Arrows: wind and waves point the way they go (figures: where they come from); current: where it sets. * = sea worked out from SWH and the swells. Click "Full size" to see all {d.days.length} days.</p>
        {/if}
    </div>
    {#if full}
        <Overlay key="portweather" onClose={() => (full = false)}>
            <svelte:fragment slot="head"
                ><b>Port weather: {d.point.name || 'position'}</b> <span class="mono">{fmtLat(d.point.lat, 1)} {fmtLon(d.point.lon, 1)}</span> · {d.days.length} days, every hour · all times UTC
                <button class="pp-btn small" on:click={pdf}><Icon name="download" size={13} /> PDF</button></svelte:fragment
            >
            <div class="g-prov"><span>{provText(d)}</span></div>
            <div class="pp-scroll" style="flex:1;min-height:0">
                <PlaceHourTable rows={d.hours} days={d.days} full />
            </div>
        </Overlay>
    {/if}
{:else if !$placeBusy}
    <div class="g-empty"><Icon name="weather" size={30} /><p>Choose a place above: the weather there, every hour for 7 days, with the tide, sunrise and moonrise.</p></div>
{/if}

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import Gear from './base/Gear.svelte';
    import SettingsFold from './settings/SettingsFold.svelte';
    import { goScreen } from './nav';
    import Icon from './base/Icon.svelte';
    import WxGlyph from './base/WxGlyph.svelte';
    import Overlay from './Overlay.svelte';
    import PlaceCard from './PlaceCard.svelte';
    import PlaceHourTable from './PlaceHourTable.svelte';
    import TideGraph from './TideGraph.svelte';
    import { downloadFile } from './download';
    import { fmtLat, fmtLon } from '../lib/format';
    import { portWeatherPdf } from '../lib/placePdf';
    import { logEvent } from '../lib/activityLog';
    import { placeBusy, placeData, placeSources, type PlaceResult } from '../windy/placeJob';

    $: d = $placeData;
    let sel = 0;
    let full = false;
    $: if (d && sel >= d.days.length) sel = 0;
    $: dsel = d?.days[sel] ?? null;
    $: dayRange = (() => {
        if (!d?.tide || !dsel) return null;
        const v = d.hours.filter(h => h.t >= dsel.day && h.t < dsel.day + 86400e3 && h.tideM != null).map(h => h.tideM as number);
        const ex = dsel.turns.map(t => t.h);
        const all = [...v, ...ex];
        return all.length ? { hi: Math.max(...all), lo: Math.min(...all) } : null;
    })();

    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const p2 = (n: number) => String(n).padStart(2, '0');
    const hm = (t: number | null) => (t == null ? '—' : `${p2(new Date(t).getUTCHours())}:${p2(new Date(t).getUTCMinutes())}`);
    const f0 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v.toFixed(0));
    const f1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v.toFixed(1));
    const provText = (x: PlaceResult) => placeSources(x).join(' · ');

    function pdf() {
        if (!d) return;
        const name = (d.point.name || `${d.point.lat.toFixed(2)}_${d.point.lon.toFixed(2)}`).replace(/[^\w.-]+/g, '_');
        downloadFile(portWeatherPdf({ ...d, sources: placeSources(d) }), 'application/pdf', `port-weather-${name}-${new Date().toISOString().slice(0, 10)}.pdf`);
        logEvent('place', 'Port weather PDF saved');
    }
</script>

<style lang="less">
    .pw__pos {
        font-family: var(--g-mono);
        color: var(--g-accent-hover);
        font-size: 12px;
    }
    .pw__days {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
        gap: 6px;
        margin: 10px 0 8px;
    }
    .pw__day {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        padding: 7px 8px;
        border-radius: var(--g-r-m);
        border: 1px solid var(--g-border);
        background: var(--g-bg-2);
        color: var(--g-text-2);
        font: 11.5px var(--g-font);
        text-align: left;
        cursor: pointer;
        &:hover {
            border-color: var(--g-border-strong);
        }
        &.is-on {
            border-color: var(--g-accent);
            background: var(--g-accent-soft);
        }
        b {
            color: var(--g-text-1);
        }
        small {
            color: var(--g-text-3);
        }
    }
    .pw__dt {
        display: flex;
        flex-wrap: wrap;
        gap: 0 6px;
        font-size: 10.5px;
        .hw {
            color: #7fe3ff;
        }
        .lw {
            color: #ffd28a;
        }
    }
    .pw__dname {
        font-weight: 650;
        color: var(--g-text-1);
    }
    .pw__dwx {
        display: flex;
        align-items: center;
        gap: 4px;
        min-height: 32px;
        span {
            line-height: 1.15;
        }
    }
    .pw__sky {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 14px;
        font-size: 12px;
        color: var(--g-text-2);
        margin: 4px 0 8px;
        i {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 5px;
            vertical-align: -1px;
        }
    }
    .pw__sun {
        background: #ffc83d;
    }
    .pw__moon {
        background: #cfd6de;
    }
    .pw__tide {
        background: var(--g-bg-2);
        border-radius: var(--g-r-m);
        padding: 6px 8px 2px;
        margin-bottom: 8px;
    }
    .pw__th {
        display: flex;
        flex-wrap: wrap;
        gap: 3px 12px;
        align-items: baseline;
        font-size: 12px;
        .hw {
            color: #7fe3ff;
        }
        .lw {
            color: #ffd28a;
        }
    }
    .pw__tw {
        max-height: 460px;
    }
    @media (max-width: 600px), (max-height: 500px) and (pointer: coarse) {
        .pw__days {
            grid-template-columns: repeat(2, 1fr);
        }
    }
</style>
