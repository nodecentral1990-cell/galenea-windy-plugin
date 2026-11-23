<!-- Voyage strip under the header, on every section (UI reimagine, owner 2026-11-13): the state of the voyage and
     the next step. Heavy weather first: once the forecast is in, it names the worst ahead and where the data
     comes from. In the normal flow of the pane (never fixed or sticky: Windy scrolls the pane). -->
<div class="g-voy" data-g="voyage-strip" data-state={state}>
    {#if state === 'empty'}
        <div class="g-voy__l2">
            <span>Start here: open a route file from the ECDIS, or click the map to add waypoints.</span>
            <button type="button" class="g-btn g-btn--s g-btn--primary" on:click={openFile}><Icon name="folder" size={14} /> Open a route file</button>
        </div>
    {:else}
        <div class="g-voy__l1">
            <button type="button" class="g-voy__name" title="Go to the route" on:click={() => goScreen({ tab: 'route', seg: 'waypoints' })}>{$route.name || 'Route'}</button>
            <span>
                {#if $plan.etd != null}<span class="g-voy__wide">ETD {fmtTime($plan.etd)}{#if $plan.eta != null} → ETA {fmtTime($plan.eta)}{/if} UTC ·</span>{/if}
                {$plan.totalNm.toFixed(0)} nm
            </span>
        </div>
        <div class="g-voy__l2">
            {#if state === 'etd'}
                <span>Next: set the ETD (departure time, UTC).</span>
                <button type="button" class="g-btn g-btn--s g-btn--primary" on:click={goEtd}><Icon name="clock" size={14} /> Set the ETD</button>
            {:else if state === 'busy'}
                <span class="g-status" style="margin:0">Reading the forecast along the route…</span>
            {:else if state === 'forecast'}
                <span>Next: get the weather along the route.</span>
                <button type="button" class="g-btn g-btn--s g-btn--primary" data-g="strip-forecast" on:click={getForecast}><Icon name="refresh" size={14} /> Get forecast</button>
            {:else if state === 'stale'}
                <span class="g-voy__old"><Icon name="warn" size={14} /> The route changed after the forecast: get it again.</span>
                <button type="button" class="g-btn g-btn--s g-btn--primary" data-g="strip-forecast" on:click={getForecast}><Icon name="refresh" size={14} /> Get forecast</button>
            {:else}
                {#if worst}
                    <button type="button" class="g-voy__worst" class:is-warn={worst.level === 1} class:is-danger={worst.level === 2} data-g="strip-worst" title="Set the map to that time and show the ship's motion there" on:click={goWorst}>
                        Worst ahead<span class="g-voy__wide"> in this forecast</span>: <b>SWH {worst.hs.toFixed(1)} m</b> <span class="g-voy__wide">on</span> {fmtTime(worst.time)} UTC
                    </button>
                    <span>
                        {#if worst.imoRows || worst.limitRows || worst.alertRows}
                            {[worst.limitRows ? `your limits broken at ${worst.limitRows} table time${worst.limitRows > 1 ? 's' : ''}` : '', worst.alertRows ? `alerts at ${worst.alertRows}` : '', worst.imoRows ? `IMO warnings at ${worst.imoRows}` : ''].filter(Boolean).join(' · ')}
                        {:else}
                            no warnings from the checks (that does not mean it is safe)
                        {/if}
                    </span>
                {:else}
                    <span>The forecast does not cover the rest of this voyage.</span>
                {/if}
                {#if info}
                    <span class="g-voy__prov" data-g="strip-prov">
                        {#if $phone}Windy {info.air.replace(/ \d{4}/, '')} · fetched {age.text || info.fetched}{:else}Weather data: Windy {info.air} · fetched {info.fetched}{age.text ? ` (${age.text})` : ''}{/if}
                        {#if age.old}
                            <span class="g-voy__old"> · The forecast is getting old (fetched more than {FORECAST_OLD_H} hours ago).</span>
                            <button type="button" class="g-btn g-btn--s" data-g="strip-forecast" on:click={getForecast}><Icon name="refresh" size={14} /> Get the latest</button>
                        {/if}
                    </span>
                {/if}
            {/if}
        </div>
        {#if shipMissing}
            <div class="g-voy__l2 g-voy__wide" data-g="strip-ship">
                <span>Ship not set up ({shipMissing}): no roll checks yet.</span>
                <Gear host="voy" line chips={[{ id: 'ship', part: 'particulars' }]} />
            </div>
        {/if}
    {/if}
</div>
<SettingsFold host="voy" />

<script lang="ts">
    import store from '@windy/store';
    import { onDestroy } from 'svelte';

    import Icon from './base/Icon.svelte';
    import Gear from './base/Gear.svelte';
    import SettingsFold from './settings/SettingsFold.svelte';
    import { goScreen } from './nav';
    import { fmtTime } from '../lib/format';
    import { buildRows, forecastInfo, rollPeriodFor, type WxRow } from '../lib/weather';
    import { FORECAST_OLD_H, forecastAge, worstAhead } from '../lib/voyageStrip';
    import { logEvent } from '../lib/activityLog';
    import { climateTick, phone, plan, planKey, route, tableStepH, thresholds, vessel, wxPlanKey, wxSeries, wxSweepValid } from '../state';
    import { refreshWeather, weatherBusy } from '../windy/weatherJobs';

    let clock = Date.now();
    const timer = setInterval(() => (clock = Date.now()), 60_000);
    onDestroy(() => clearInterval(timer));

    $: hasRoute = $route.waypoints.length >= 2;
    $: stale = $wxPlanKey !== $planKey;
    $: state = !hasRoute ? 'empty' : $plan.etd == null ? 'etd' : $weatherBusy ? 'busy' : !$wxSeries.length ? 'forecast' : stale ? 'stale' : 'ok';
    // The strip is drawn when the plugin opens: a fault in these sums must never stop the panel (it then shows no "worst ahead")
    function guard<T>(f: () => T, fallback: T): T {
        try {
            return f();
        } catch (e) {
            console.error('[galenea] voyage strip', e);
            return fallback;
        }
    }
    $: rows = state === 'ok' ? ($climateTick >= 0 ? guard(() => buildRows($route, $plan, $vessel, $thresholds, $tableStepH, $wxSeries, $wxSweepValid), [] as WxRow[]) : ([] as WxRow[])) : ([] as WxRow[]);
    $: worst = state === 'ok' ? guard(() => worstAhead(rows, clock - ($tableStepH * 3600e3) / 2), null) : null;
    $: info = state === 'ok' ? guard(() => forecastInfo($wxSeries), null) : null;
    $: fetchedAt = $wxSeries.length ? Math.min(...$wxSeries.map(s => s.fetchedAt ?? Infinity)) : null;
    $: age = forecastAge(fetchedAt, clock);
    $: shipMissing = hasRoute ? guard(() => [$vessel.lbp ? '' : 'LBP', rollPeriodFor($vessel).value ? '' : 'roll period'].filter(Boolean).join(', '), '') : '';

    function openFile() {
        goScreen({ tab: 'route', seg: 'waypoints' });
        setTimeout(() => {
            try {
                (document.querySelector('.pp input[data-g="route-file"]') as HTMLInputElement | null)?.click();
            } catch {
                /* the Route screen has its own button */
            }
        }, 60);
    }
    function goEtd() {
        goScreen({ tab: 'route', seg: 'waypoints' });
        setTimeout(() => {
            try {
                const el = document.querySelector('.pp [data-g="times-card"]') as HTMLElement | null;
                el?.scrollIntoView({ block: 'start' });
                (el?.querySelector('.dtf__value') as HTMLElement | null)?.click();
            } catch {
                /* the Times card is on the Route screen */
            }
        }, 60);
    }
    function getForecast() {
        logEvent('click', 'Voyage strip: get forecast');
        refreshWeather({ fresh: $wxSeries.length > 0 });
    }
    function goWorst() {
        if (!worst) return;
        logEvent('click', 'Voyage strip: worst ahead → map time and Motion');
        store.set('timestamp', worst.time);
        goScreen({ tab: 'snapshot' });
    }
</script>
