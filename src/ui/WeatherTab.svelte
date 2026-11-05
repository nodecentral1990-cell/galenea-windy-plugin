<div class="g-card">
    <div class="g-card__head">
        <span class="g-card__title">Forecast along the route</span>
        <Hint title="Where the weather comes from">
            <p>The plugin always uses <b>ECMWF</b> (wind, rain, pressure) and <b>ECMWF-WAM</b> (waves, swell) from Windy, whichever model you pick in Windy's model menu (what these are: Help → Guide).</p>
            <p>Past times show the forecast as it was made then: <b>E</b> = an earlier Windy run kept in this browser. They are forecasts, not observations.</p>
            <p><b>OM</b> = Open-Meteo, a free service, used only where Windy has nothing: past times not kept here, and days beyond your Windy plan (free Windy: about 5 days in 3-hour steps). Switch: Settings → Weather reading.</p>
            <p>Forecasts can be wrong and get less reliable further ahead; values between forecast steps are interpolated.</p>
        </Hint>
    </div>
    <div class="g-row">
        <div class="etd">ETD at WP1 (UTC, 24 h) <DateTimeField value={$route.etd} on:change={e => updateRoute(r => (r.etd = e.detail))} /></div>
        <label
            >Table every
            <select bind:value={$tableStepH}>
                {#each [1, 2, 3, 6, 12, 24] as h}<option value={h}>{h} h</option>{/each}
            </select>
        </label>
    </div>
    <div class="g-row wx-go">
        <button class="pp-btn g-btn--primary" disabled={$weatherBusy || !canFetch} on:click={() => refreshWeather({ fresh: $wxSeries.length > 0 })}><Icon name="refresh" size={15} /> {$wxSeries.length ? 'Get latest forecast along route' : 'Get forecast along route'}</button>
        {#if $weatherBusy}<button class="pp-btn pp-btn--ghost" on:click={stopWeather}>Stop</button>{/if}
    </div>
    {#if !canFetch}
        <div class="g-status g-status--warn"><Icon name="warn" size={14} /> {$route.waypoints.length < 2 ? 'Needs a route with at least 2 waypoints (Route → Waypoints).' : 'Set the ETD above first.'}</div>
    {/if}
    {#if $weatherStatus}<div class="g-status status" class:g-status--ok={/^Done/.test($weatherStatus)}>{$weatherStatus}</div>{/if}
    {#if stale && $wxSeries.length}
        <div class="g-status g-status--warn"><Icon name="warn" size={14} /> The route changed after the forecast was fetched. Press "Get forecast" again. (Changes of ETD, speed or fixed ETAs don't need this.)</div>
    {/if}
    {#if $mapProduct && !/^ecmwf/i.test($mapProduct)}<div class="g-status g-status--warn"><Icon name="warn" size={14} /> Windy's map is showing {$mapProduct.toUpperCase()}, so the map colours can differ from the plugin's numbers (the plugin always uses ECMWF).</div>{/if}
    {#if info}
        <div class="g-prov runinfo">
            <Icon name="calendar" size={14} />
            <div>
                Weather data: <b>Windy {info.air}</b> · waves {info.waves} · fetched {info.fetched}.
                {#if planTxt}<div>{planTxt}</div>{/if}
                {#each info.other as o}<div><span class="wx-src" class:wx-src--om={o.includes('Open-Meteo')}>{o.includes('Open-Meteo') ? 'OM' : 'E'}</span> {o}</div>{/each}
            </div>
        </div>
    {/if}
    <div class="pp-note wx-echo">
        The plugin always uses ECMWF + ECMWF-WAM · currents and visibility after the forecast: <b>{$autoLayers ? 'on' : 'off'}</b> · free fill (Open-Meteo): <b>{$freeForecast ? 'on' : 'off'}</b> (Settings → Weather reading)
    </div>
</div>

<div class="g-card">
    <div class="g-card__head">
        <span class="g-card__title">On the map</span>
        <Hint title="Charts on the map">
            <p><b>Wave chart</b>: Windy's wave layers in your own colours (Settings → Wave chart), white below your minimum, with lines of equal height. "Lines for this view" fetches forecast points over the map you see, for lines of wave types Windy is not showing.</p>
            <p><b>Roll / pitch lines</b>: the plugin's own estimate over the map you see, for Windy's slider time (Settings → Roll and pitch). Parametric roll is not included: watch the IMO warnings.</p>
            <p><b>Seamarks</b>: OpenSeaMap (lights, buoys, traffic separation, pilot boarding where mapped), from zoom 9. Not official charts.</p>
        </Hint>
    </div>
    <div class="g-row wavechart">
        <span class="wx-lbl">Waves</span>
        <button class="pp-btn pp-btn--ghost small" on:click={() => showWaveLayer('hs')} title="Windy's wave layer (significant wave height) in your colours">SWH</button>
        <button class="pp-btn pp-btn--ghost small" on:click={() => showWaveLayer('sea')} title="Windy's wind-wave layer in your colours">Sea</button>
        <button class="pp-btn pp-btn--ghost small" on:click={() => showWaveLayer('swell1')} title="Windy's swell 1 layer in your colours">Swell 1</button>
        <button class="pp-btn pp-btn--ghost small" on:click={() => showWaveLayer('swell2')} title="Windy's swell 2 layer in your colours">Swell 2</button>
        <button class="pp-btn pp-btn--ghost small" on:click={loadLinesForView} title="Forecast points over the map you see, for lines of wave types Windy is not showing">Lines for this view</button>
    </div>
    <div class="g-row wavechart rollchart">
        <span class="wx-lbl">Motion</span>
        <button class="pp-btn pp-btn--ghost small" on:click={() => rollLinesForView('roll')} title="Lines of equal roll (2°, 4°, 6°…) over the map you see, for Windy's slider time">Roll lines for this view</button>
        <button class="pp-btn pp-btn--ghost small" on:click={() => rollLinesForView('pitch')} title="Lines of equal pitch (1°, 2°, 3°…) in blues over the map you see, for Windy's slider time">Pitch lines for this view</button>
        {#if $rollChartOn}<button class="pp-btn pp-btn--ghost small" on:click={hideRollLines}><Icon name="eyeOff" size={14} /> Hide lines</button>{/if}
    </div>
    {#if $rollChartStatus}<div class="g-status">{$rollChartStatus}</div>{/if}
    <div class="g-row wavechart">
        <span class="wx-lbl">Charts</span>
        <button class="pp-btn pp-btn--ghost small" class:pp-on={$chartLayers.seamarks} on:click={() => chartLayers.update(c => ({ ...c, seamarks: !c.seamarks }))} title="OpenSeaMap seamarks over the map (not official charts)"><Icon name="anchor" size={14} /> Seamarks</button>
        <button class="pp-btn pp-btn--ghost small" class:pp-on={$placesLayers.ports} on:click={() => placesLayers.update(c => ({ ...c, ports: !c.ports }))} title="Ports (approximate positions) from zoom 4"><Icon name="ship" size={14} /> Ports</button>
        <button class="pp-btn pp-btn--ghost small" class:pp-on={$placesLayers.canals} on:click={() => placesLayers.update(c => ({ ...c, canals: !c.canals }))} title="Canals and main straits">Canals</button>
    </div>
</div>

{#if rows.length}
    <div class="g-card">
        <div class="g-card__head">
            <span class="g-card__title">Weather table</span>
            <Hint title="Reading the table" width={360}>
                <p>Click a row to move Windy's time slider and the map to that time. Relative directions: 0° = from ahead.</p>
                <p><b>SOG = SiCW − weather loss + current</b> along the track{$route.useCurrents ? '' : ' (currents are switched off in Settings → Speed, RPM and fuel)'}. {hasCurrents ? "" : "Current \"—\" = not read yet (press Read currents)."} Currents belong to the times they were read: after changing ETD, speeds or fixed ETAs, read them again.</p>
                <p>Amber / red cells: your limits (Settings → Weather limits). Chips: IMO MSC.1/Circ.1228 checks, advisory only: <span class="chip parametric">PR</span> parametric, <span class="chip synchronous">SR</span> synchronous, <span class="chip highWaves">HW</span> high waves, <span class="chip surf">BR</span> broaching. No warning does not mean safe.</p>
                <p>Faded rows are in the past. Roll period: {rollTxt}.</p>
            </Hint>
            <div class="g-card__actions">
                <button class="pp-btn pp-btn--ghost small" on:click={() => (fullTable = true)} title="Show the whole table over the map"><Icon name="expand" size={14} /> Full-size table</button>
                <button class="pp-btn pp-btn--ghost small" on:click={() => exportTable('xlsx')}><Icon name="download" size={14} /> Excel</button>
                <button class="pp-btn pp-btn--ghost small" on:click={() => exportTable('csv')}>CSV</button>
            </div>
        </div>
        <div class="g-row">
            <span class="wx-lbl">Read from Windy's map</span>
            <button class="pp-btn pp-btn--ghost small" disabled={$weatherBusy} on:click={() => readLayer('currents')} title="Experimental: steps Windy's time slider with the currents layer and reads the value at each ship position">Read currents (exp.)</button>
            <button class="pp-btn pp-btn--ghost small" disabled={$weatherBusy} on:click={() => readLayer('sea')} title="Windy's wind-wave layer (sea): height, direction and period at each ship position">Read sea (wind waves)</button>
            <button class="pp-btn pp-btn--ghost small" disabled={$weatherBusy} on:click={() => readLayer('visibility')} title="Experimental: same with the visibility layer">Read visibility (exp.)</button>
            <button class="pp-btn pp-btn--ghost small" disabled={$weatherBusy} on:click={() => readLayer('wind100')} title="Experimental: same with the 100 m wind layer">Read 100 m wind (exp.)</button>
        </div>
        <WeatherTable {rows} {isNow} onRowClick={goTo} />
        <div class="pp-note wx-key">
            <span class="chip parametric">PR</span> parametric · <span class="chip synchronous">SR</span> synchronous · <span class="chip highWaves">HW</span> high waves · <span class="chip surf">BR</span> broaching · amber / red = your limits · no warning ≠ safe
        </div>
    </div>
{/if}

{#if fullTable && rows.length}
    <Overlay onClose={() => (fullTable = false)}>
        <svelte:fragment slot="head"><b>Weather along "{$route.name}"</b> · {rows.length} rows · all times UTC · click a row to move the map time</svelte:fragment>
        <WeatherTable full {rows} {isNow} onRowClick={goTo} />
    </Overlay>
{/if}

<script lang="ts">
    import store from '@windy/store';
    import { map } from '@windy/map';

    import { fmtLat, fmtLon, fmtTime } from '../lib/format';
    import { beaufort, buildRows, encounterOf, forecastInfo, rollPeriodFor, seaDirOf, type WxRow } from '../lib/weather';
    import { writeXlsx } from '../lib/formats/xlsx';
    import { writeCsv } from '../lib/formats/table';
    import { autoLayers, readLayer, refreshWeather, stopWeather, weatherBusy, weatherStatus } from '../windy/weatherJobs';
    import { mapProduct, plan, planKey, route, tableStepH, thresholds, timelineTs, updateRoute, vessel, wxPlanKey, wxSeries, wxSweepValid } from '../state';
    import { downloadFile } from './download';
    import DateTimeField from './DateTimeField.svelte';
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import { chartLayers, freeForecast, placesLayers } from '../state';
    import WeatherTable from './WeatherTable.svelte';
    import { sprayIcing } from '../lib/icing';
    import { loadLinesForView, showWaveLayer } from '../windy/waveChart';
    import { windyCoverage } from '../windy/forecast';
    import { hideRollLines, rollChartOn, rollChartStatus, rollLinesForView } from '../windy/rollChart';
    import Overlay from './Overlay.svelte';

    let fullTable = false;

    $: canFetch = $route.waypoints.length >= 2 && $plan.etd != null;
    $: stale = $wxPlanKey !== $planKey;
    $: rows = !stale && $wxSeries.length ? buildRows($route, $plan, $vessel, $thresholds, $tableStepH, $wxSeries, $wxSweepValid) : ([] as WxRow[]);
    $: info = forecastInfo($wxSeries);
    // what the user's Windy plan gave (free users: 3-hour steps, about 5–7 days; Premium: 1 hour, longer)
    $: planTxt = info && windyCoverage.days != null ? `Your Windy plan gives ${windyCoverage.stepH ? `${windyCoverage.stepH}-hour steps, ` : ''}forecast to about ${windyCoverage.days.toFixed(0)} days ahead${windyCoverage.fakeDropped ? ' (Windy\'s sample days for non-Premium users left out)' : ''}.` : '';
    $: source = info ? `Windy point forecast, ${info.air}; waves ${info.waves}${info.other.length ? `; also ${info.other.join('; ')}` : ''}` : '';
    $: hasCurrents = rows.some(r => r.wx?.currentKn != null);
    $: roll = rollPeriodFor($vessel);
    $: rollTxt = roll.value ? `${roll.value.toFixed(1)} s ${roll.estimated ? '(estimated from GM)' : '(measured)'}` : 'not set, so no roll checks';

    const isNow = (r: WxRow) => Math.abs(r.time - $timelineTs) < ($tableStepH * 3600e3) / 2;

    function goTo(r: WxRow) {
        store.set('timestamp', r.time);
        map.panTo([r.pos.lat, r.pos.lon]);
    }

    function exportTable(kind: 'xlsx' | 'csv') {
        const head = ['UTC', 'WP', 'Lat', 'Lon', 'Course', 'SiCW kn', 'Weather loss kn', 'SOG kn', 'Stopped', 'Drift kn', 'Drift towards', 'Wind kn', 'Wind dir', 'Gust kn', 'Bf', 'SWH m', 'SWH period s', 'SWH from', 'SWH encounter s', 'Wave power kW/m', 'Sea m', 'Sea period s', 'Sea from', 'Sea encounter s', 'Sea source', 'Swell 1 m', 'Swell 1 period s', 'Swell 1 from', 'Swell 1 encounter s', 'Swell 2 m', 'Swell 2 period s', 'Swell 2 from', 'Swell 2 encounter s', 'Current kn', 'Current set', 'Wind 100m kn', 'Wind 100m dir', 'Air temp C', 'Sea temp C', 'Spray icing', 'Visibility nm', 'Rain mm', 'Fog', 'Pressure hPa', 'Limit warnings', 'IMO Circ.1228 warnings', 'Weather source'];
        const n = (v: number | null | undefined, d = 1) => (v == null ? '' : Number(v.toFixed(d)));
        /** Encounter period at the planned course and speed (0 kn when stopped); 'never' when the waves never pass */
        const te = (r: WxRow, period: number | null | undefined, from: number | null | undefined) => {
            const t = encounterOf(period, from, r.pos.course, r.stopped ? 0 : r.speedKn);
            return t == null ? '' : !isFinite(t) || t > 999 ? 'never' : Number(t.toFixed(1));
        };
        const body = rows.map(r => {
            const w = r.wx;
            return [
                fmtTime(r.time), r.atWaypoint != null ? r.atWaypoint + 1 : '', fmtLat(r.pos.lat), fmtLon(r.pos.lon), n(r.pos.course, 0), n(r.sicw), n(r.lossKn), n(r.sog ?? r.speedKn), r.stopped ? 'yes' : '', n(r.drift?.kn), n(r.drift?.toward, 0),
                n(w?.windKn, 0), n(w?.windDir, 0), n(w?.gustKn, 0), w ? beaufort(w.windKn) ?? '' : '', n(w?.hs), n(w?.hsPeriod), n(w?.hsDir, 0), te(r, w?.hsPeriod, w?.hsDir), n(w?.powerKw, 0), n(w?.seaHs), w?.seaWindy ? n(w.seaPeriod) : '', n(w ? seaDirOf(w) : null, 0), w?.seaWindy ? te(r, w.seaPeriod, seaDirOf(w)) : '', w ? (w.seaWindy ? 'Windy wind waves' : 'worked out from SWH') : '',
                n(w?.sw1), n(w?.sw1Period), n(w?.sw1Dir, 0), te(r, w?.sw1Period, w?.sw1Dir), n(w?.sw2), n(w?.sw2Period), n(w?.sw2Dir, 0), te(r, w?.sw2Period, w?.sw2Dir), n(w?.currentKn), n(w?.currentSet, 0), n(w?.wind100Kn, 0), n(w?.wind100Dir, 0), n(w?.airTempC, 0), n(w?.seaTempC, 0), w ? (sprayIcing(w.windKn, w.airTempC, w.seaTempC)?.cls ?? '') : '', w?.visNm != null ? (w.visNm > 7 ? '>7' : n(w.visNm)) : '',
                n(w?.precipMm), w?.fog ? 'fog' : '', n(w?.pressureHpa, 0),
                r.wx ? r.limits.map(l => `${l.level === 2 ? 'LIMIT' : 'alert'}: ${l.detail}`).join('; ') : r.beyond ? 'beyond forecast' : 'no data',
                r.resonance.map(h => h.detail).join('; '),
                r.wx ? (r.src ? r.src.label : 'Windy latest run') : '',
            ];
        });
        const all = [[`Weather along route "${$route.name}". ${source}. Planning aid only.`], head, ...body];
        const name = `${$route.name.replace(/[^\w\- ]+/g, '_')}-weather`;
        if (kind === 'xlsx') downloadFile(writeXlsx(all, 'Weather'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name + '.xlsx');
        else downloadFile(writeCsv(all), 'text/csv', name + '.csv');
    }
</script>

<style lang="less">
    .small {
        padding: 2px 8px;
        font-size: 11px;
    }
    .wavechart {
        align-items: center;
    }
    .row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;
        margin-bottom: 4px;
    }
    .etd {
        display: flex;
        flex-direction: column;
        font-size: 11px;
        min-width: 260px;
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
    }
    .runinfo {
        background: rgba(63, 169, 255, 0.12);
        border-left: 3px solid #3fa9ff;
        padding: 4px 6px;
        border-radius: 3px;
        margin: 4px 0;
        font-size: 11px;
    }
    .status {
        white-space: pre-wrap;
    }
    .wx-go {
        margin: 8px 0 2px;
    }
    .wx-lbl {
        font-size: 12px;
        color: var(--g-text-3);
        min-width: 52px;
    }
    .wx-echo {
        margin-top: 6px;
    }
    .wx-key {
        margin-top: 6px;
    }
    .wx-src {
        display: inline-block;
        padding: 0 4px;
        border-radius: 3px;
        font-size: 9.5px;
        font-weight: 700;
        background: #5b6b84;
        color: #fff;
        &.wx-src--om {
            background: #2f7d6d;
        }
    }
</style>
