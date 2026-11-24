<div class="plugin__mobile-header">{title}</div>
<section class="plugin__content pp g-shell" data-g-dim={$panelDim ? '' : null}>
    <div class="plugin__title plugin__title--chevron-back g-head" bind:this={headEl} on:click={() => bcast.emit('rqstOpen', 'menu')}>
        <span class="g-head__name">{shortName}</span>
        <span class="g-head__ver" title="Plugin version">v{config.version}</span>
        <span class="g-head__tools" on:click|stopPropagation>
            <button class="g-btn g-btn--s g-now" on:click={goToNow} title="Set the map and the plugin to the present time (computer clock, UTC) with the ship in the middle"><Icon name="clock" size={15} /> Now <span class="g-now__t">{fmtTime(clock).slice(7)} UTC</span></button>
            <button class="g-ibtn" class:is-on={graphsShown} on:click={() => ($phone ? phoneGraphOpen.update(x => !x) : toggleGraphs())} title="Graph window (show / hide)" aria-label="Graph window" aria-pressed={graphsShown}><Icon name="chart" /></button>
            {#if newer}
                <!-- a newer version is out: one click installs it (owner, 2026-11-24) -->
                <button class="g-btn g-btn--s g-upd" on:click={updateFromHeader} title={$installedPending === $updates.latest ? `Version ${$updates.latest} is installed: reload Windy to start it` : `Version ${$updates.latest} is available (you have ${config.version}). Click to install it now.`} aria-label="Install the new version"
                    ><Icon name="download" size={14} /><span class="g-upd__t">{$installedPending === $updates.latest ? 'Reload' : 'Update'} v{$updates.latest}</span></button
                >
            {/if}
            <button class="g-ibtn g-help-btn" class:is-on={help} on:click={() => openHelp()} title="Help, guide, what's new, usage, feedback, updates" aria-label="Help">
                <Icon name="info" />{#if newer || $otherCopy}<span class="g-dot" class:g-dot--red={!!$otherCopy} />{/if}
            </button>
        </span>
    </div>
    <div class="g-tagline">Made for seafarers, by a seafarer · {config.author} · <i>Every wave weighed</i></div>
    <div class="pp-warning g-aid">
        <Icon name="warn" size={14} /> <span>Planning aid only: not ECDIS, official charts or official weather routing.</span>
        <Hint title="Planning aid only">
            <p>Does not replace ECDIS, official charts, approved stability information or official weather routing.</p>
            <p>Windy's map has no depths or hazards: <b>check the route on ECDIS</b>. Forecasts can be wrong; "no warning" does not mean safe. The master decides.</p>
            <p>Priorities of this plugin: <b>heavy weather and ship motion first, fuel second</b>.</p>
        </Hint>
    </div>
    {#if $otherCopy}
        <div class="pp-dup">
            ⚠ An older copy of this plugin (v{$otherCopy}) is still running in this page, which can jumble Windy's side panel.
            <button class="pp-btn small" on:click={reloadWindy}>Reload Windy</button>
        </div>
    {/if}
    <UpdateBanner />
    <VoyageStrip />
    <!-- phones (owner's report, 2026-11-19): this bar stays at the top of the panel while it scrolls, so another section
         is always one press away; pressing a section (also the one already open) goes to its start -->
    <nav class="g-nav" class:g-nav--away={help} role="tablist" bind:this={navEl}>
        {#each SECTIONS as t}
            <button role="tab" class="g-nav__item" data-g="nav-{t.id}" class:is-on={tab === t.id && !help} aria-selected={tab === t.id && !help} on:click={() => navPress(t.id)} title={t.title}>
                <Icon name={t.icon} size={19} /><span>{t.label}</span>
            </button>
        {/each}
    </nav>
    <div class="g-start" bind:this={startEl} />
    {#if help}
        <!-- help shown in place of the section (0.23.3: no overlay, so Windy's own panel scrolling is untouched) -->
    {:else if tab === 'route'}
        <div class="g-seg" role="radiogroup" aria-label="Route views">
            {#each ROUTE_SEGS as s}<button role="radio" class="g-seg__opt" class:is-on={routeSeg === s.id} aria-checked={routeSeg === s.id} on:click={() => setRouteSeg(s.id)}><Icon name={s.icon} size={15} />{s.label}</button>{/each}
        </div>
        {#if routeSeg === 'waypoints'}
            <RouteTab on:fit={fit} />
        {:else if routeSeg === 'speed'}
            <SpeedTab />
        {:else}
            <DistancesPanel />
        {/if}
    {:else if tab === 'settings'}
        <SettingsTab />
    {:else if tab === 'weather'}
        <div class="g-seg g-seg--4" role="radiogroup" aria-label="Weather views">
            {#each WEATHER_SEGS as s}<button role="radio" class="g-seg__opt" class:is-on={weatherSeg === s.id} aria-checked={weatherSeg === s.id} on:click={() => setWeatherSeg(s.id)} title={s.title}><Icon name={s.icon} size={15} />{s.label}</button>{/each}
        </div>
        {#if weatherSeg === 'port'}
            <PortWeather />
        {:else if weatherSeg === 'tides'}
            <TidePanel />
        {:else}
            <WeatherTab view={weatherSeg === 'charts' ? 'charts' : 'route'} />
        {/if}
    {:else if tab === 'snapshot'}
        <div class="g-seg" role="radiogroup" aria-label="Motion views">
            {#each MOTION_SEGS as s}<button role="radio" class="g-seg__opt" class:is-on={motionSeg === s.id} aria-checked={motionSeg === s.id} on:click={() => setMotionSeg(s.id)} title={s.title}><Icon name={s.icon} size={15} />{s.label}</button>{/each}
        </div>
        <SnapshotTab mode={motionSeg} />
    {:else if tab === 'optimise'}
        <div class="g-seg" role="radiogroup" aria-label="Optimise views">
            {#each OPT_SEGS as s}<button role="radio" class="g-seg__opt" class:is-on={optSeg === s.id} aria-checked={optSeg === s.id} on:click={() => setOptSeg(s.id)} title={s.title}><Icon name={s.icon} size={15} />{s.label}</button>{/each}
        </div>
        {#if optSeg === 'compare'}
            <CompareTab />
        {:else}
            <OptimiseTab mode={optSeg} />
        {/if}
    {/if}
    {#if help}
        <div class="g-drawer" role="dialog" aria-label="Help">
            <div class="g-drawer__head">
                <button type="button" class="g-btn g-back" on:click={closeHelp} title="Close Help and go back to {SECTIONS.find(t => t.id === tab)?.label ?? 'the plugin'}"><Icon name="back" size={18} /> Back</button>
                <b>Help</b>
                <div class="g-seg g-drawer__seg">
                    {#each HELP_SEGS as s}<button class="g-seg__opt" class:is-on={helpSeg === s.id} on:click={() => openHelp(s.id)}><Icon name={s.icon} size={15} />{s.label}</button>{/each}
                </div>
                <button class="g-ibtn g-drawer__x" aria-label="Close help" title="Close" on:click={closeHelp}><Icon name="x" /></button>
            </div>
            <div class="g-drawer__body">
                {#if helpSeg === 'guide'}
                    <InfoTab />
                {:else if helpSeg === 'usage'}
                    <UsageTab />
                {:else if helpSeg === 'feedback'}
                    <Feedback />
                {:else}
                    <div class="g-card">
                        <div class="g-card__head"><span class="g-card__title">{config.title}</span><Gear host="about" chips={[{ id: 'updates' }]} /></div>
                        <SettingsFold host="about" />
                        <p>Version <b>{config.version}</b> · by {config.author}</p>
                        <div class="g-row">
                            <button class="g-btn" disabled={$updateBusy} on:click={() => checkForUpdates(true)}><Icon name="refresh" size={15} /> Check for updates</button>
                            {#if $updateStatus}<span class="pp-note">{$updateStatus}</span>{/if}
                        </div>
                        <p class="pp-note">Install link and steps, automatic checks: the gear above (or Settings → Updates). "What's new" appears at the top of the panel after an update.</p>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    {#if $phone}
        <div class="g-totop"><button type="button" class="g-btn g-btn--ghost g-btn--s" on:click={toTop}><Icon name="arrowUp" size={14} /> Top</button></div>
    {/if}
</section>
{#if $work}
    <WorkOverlay job={$work} />
{/if}
{#if graphsShown && layer}
    <GraphPanel />
{/if}
{#if $setWin && !$phone}
    <SettingsWin />
{/if}
{#if $cursorBar.on && layer && !$phone}
    <CursorBar />
{/if}
<!-- phones: Windy shows the plugin full screen, so the ship window would cover it; Motion shows the same diagram -->
{#if $showShipBox && layer && !$phone}
    <ShipBox
        routeName={$route.name}
        mapTs={$timelineTs}
        pos={now}
        wx={nowWx}
        current={nowCurrent}
        sog={nowSog}
        style={$shipStyle}
        imo={!!nowGlyph?.imo}
        hasForecast={wxOk}
        voyageNote={voyageNote}
        colors={$flagColors}
        runInfo={wxOk ? forecastInfo($wxSeries) : null}
        polar={nowWx ? { lbp: $vessel.lbp, rollPeriod: rollPeriodFor($vessel).value, settings: $thresholds.resonance, speed: nowStw ?? 0 } : null}
        motion={nowWx && now ? motionAt(nowWx, now.course, nowStw ?? 0, $vessel) : null}
        onClose={() => showShipBox.set(false)}
        onNow={goToNow}
        onSettings={anchor =>
            openSetWin(
                [
                    { id: 'map', part: 'ships', label: 'Ship symbols & colours' },
                    { id: 'polar', label: 'Polar diagram' },
                    { id: 'map', part: 'windows', label: 'Windows' },
                ],
                anchor,
            )}
    />
{/if}

<script lang="ts">
    import bcast from '@windy/broadcast';
    import store from '@windy/store';
    import { showPressureLines } from './windy/weatherJobs';
    import { onDestroy, onMount, tick } from 'svelte';
    import { get } from 'svelte/store';

    import config from './pluginConfig';
    import Feedback from './ui/Feedback.svelte';
    import Icon from './ui/base/Icon.svelte';
    import Hint from './ui/base/Hint.svelte';
    import DistancesPanel from './ui/DistancesPanel.svelte';
    import { installTheme } from './ui/theme';
    import { RouteLayer } from './windy/mapLayer';
    import { glyphStyle,
        addMode,
        deleteWaypoints,
        insertWaypoint,
        legClickInserts,
        plan,
        route,
        selectWp,
        selectedUids,
        landUids,
        shipStepH,
        shipWeather,
        shipStyle,
        followShip,
        showShipBox,
        showIsobars,
        flagColors,
        mapProduct,
        wxSweepValid,
        savedRoutes,
        work,
        thresholds,
        timelineTs,
        updateRoute,
        vessel,
        planKey,
        wxPlanKey,
        wxSeries,
    } from './state';
    import { forecastInfo, nearestSweep, rollPeriodFor, weatherAt, withWindySea } from './lib/weather';
    import ShipBox from './ui/ShipBox.svelte';
    import WorkOverlay from './ui/WorkOverlay.svelte';
    import { map } from '@windy/map';
    import { glyphFor, type ShipGlyph } from './lib/shipGlyph';
    import { openMenu, closeMenu } from './windy/contextMenu';
    import { waypointsOnLand } from './windy/land';
    import { newWaypoint, positionAt, projectOnLegs, shipPositions, type ShipPosition } from './lib/model';
    import { fmtLat, fmtLon, fmtTime } from './lib/format';
    import RouteTab from './ui/RouteTab.svelte';
    import SettingsTab, { openSettingsSection } from './ui/SettingsTab.svelte';
    import WeatherTab from './ui/WeatherTab.svelte';
    import SnapshotTab from './ui/SnapshotTab.svelte';
    import SpeedTab from './ui/SpeedTab.svelte';
    import CompareTab from './ui/CompareTab.svelte';
    import InfoTab from './ui/InfoTab.svelte';
    import UsageTab from './ui/UsageTab.svelte';
    import UpdateBanner from './ui/UpdateBanner.svelte';
    import OptimiseTab from './ui/OptimiseTab.svelte';
    import { motionAt } from './lib/motionEstimate';
    import { otherCopy, startLogging, stopLogging } from './logHooks';
    import { checkForUpdates, installedPending, reloadWindy, updateBusy, updateFromHeader, updateStatus, updates } from './windy/updates';
    import { compareVersions } from './lib/releaseNotes';
    import { panelDim } from './state';
    $: newer = !!$updates.latest && compareVersions($updates.latest, config.version) > 0;
    import { startWaveChart, stopWaveChart } from './windy/waveChart';
    import { startRollChart, stopRollChart } from './windy/rollChart';
    import { startChartLayers, stopChartLayers } from './windy/chartLayer';
    import { startPlaces, stopPlaces } from './windy/placesLayer';
    import { startSeaAreas, stopSeaAreas } from './windy/seaAreasLayer';
    import { startClimate, stopClimate } from './windy/climateJob';
    import { dragMove, onUndoKey } from './routeHistory';
    const undoKey = (e: KeyboardEvent) => {
        const before = e.defaultPrevented;
        onUndoKey(e);
        if (!before && e.defaultPrevented) logEvent('route', `${e.key.toLowerCase() === 'y' || e.shiftKey ? 'Redo' : 'Undo'} (keys)`);
    };
    import { setRingCenter, startRangeRings, stopRangeRings } from './windy/rangeRingsLayer';
    import CursorBar from './ui/CursorBar.svelte';
    import { cursorBar } from './state';
    import { logEvent } from './lib/activityLog';
    import GraphPanel from './ui/GraphPanel.svelte';
    import PortWeather from './ui/PortWeather.svelte';
    import { startAreaLayer, stopAreaLayer } from './windy/areaLayer';
    import { startAutoWeather, stopAutoWeather } from './windy/weatherJobs';
    import VoyageStrip from './ui/VoyageStrip.svelte';
    import Gear from './ui/base/Gear.svelte';
    import SettingsFold from './ui/settings/SettingsFold.svelte';
    import SettingsWin from './ui/settings/SettingsWin.svelte';
    import { closeFold, closeSetWin, openSetWin, setWin } from './ui/settings/foldState';
    import { setNavHandler, type NavTarget } from './ui/nav';
    import { startMapToolNote, stopMapToolNote } from './windy/mapToolNote';
    import TidePanel from './ui/TidePanel.svelte';
    import { cancelPick, hideMarker, loadPlace, pickAt, placeData, placePoint, setPoint, showMarker } from './windy/placeJob';
    import { graphState, phoneGraphOpen, toggleGraphs } from './ui/graphState';
    import { phone } from './state';
    import { bringToTop, watchSafeTop } from './ui/phoneSafe';
    $: graphsShown = $phone ? $phoneGraphOpen : $graphState.open;
    import { goToNow } from './windy/nowTime';

    const { title } = config;
    // UI overhaul (owner, 2026-11-02; windy/notes/ui-redesign-spec.md §2): 9 tabs → 5 sections + a Help drawer
    const shortName = title.split(' – ')[0];
    const SECTIONS = [
        { id: 'route', label: 'Route', icon: 'route', title: 'Waypoints, speed and fuel, distances' },
        { id: 'weather', label: 'Weather', icon: 'weather', title: 'Forecast along the route, table, charts on the map' },
        { id: 'snapshot', label: 'Motion', icon: 'motion', title: 'Polar diagram: IMO warnings, roll and pitch at the map time' },
        { id: 'optimise', label: 'Optimise', icon: 'bolt', title: 'Safe speed and course plan, route optimisation, compare routes' },
        { id: 'settings', label: 'Settings', icon: 'gear', title: 'All settings' },
    ];
    const ROUTE_SEGS = [
        { id: 'waypoints', label: 'Waypoints', icon: 'route' },
        { id: 'speed', label: 'Speed & fuel', icon: 'ship' },
        { id: 'distances', label: 'Distances', icon: 'anchor' },
    ] as const;
    const OPT_SEGS = [
        { id: 'speed', label: 'Speed & course', icon: 'lifebuoy', title: 'Avoid bad weather by changing the speed, stopping, or altering course for a while' },
        { id: 'route', label: 'Change the track', icon: 'bolt', title: 'Route optimisation: least fuel within your limits' },
        { id: 'compare', label: 'Compare', icon: 'compare', title: 'Compare routes side by side' },
    ] as const;
    // Port weather and tides (owner, 2026-11-13) as views of the Weather section (windy/notes/ui-reimagine-2026-11.md)
    const WEATHER_SEGS = [
        { id: 'route', label: 'Along route', icon: 'route', title: 'The forecast along your route, the weather table, charts on the map' },
        { id: 'port', label: 'Port weather', icon: 'anchor', title: 'Any place: weather every hour for 7 days, tide, sun and moon; PDF' },
        { id: 'tides', label: 'Tides', icon: 'tide', title: 'Any place: tide graph, high and low waters, hourly heights; PDF' },
        { id: 'charts', label: 'Map charts', icon: 'layers', title: 'Charts on the map: wave chart in your colours, roll and pitch lines, seamarks, ports, canals' },
    ] as const;
    const MOTION_SEGS = [
        { id: 'plan', label: 'At the map time', icon: 'clock', title: "The ship on the plan at the time of Windy's slider" },
        { id: 'live', label: 'Live (GPS)', icon: 'crosshair', title: 'Where this phone or computer is now, with the forecast there' },
    ] as const;
    let motionSeg: (typeof MOTION_SEGS)[number]['id'] = 'plan';
    function setMotionSeg(id: typeof motionSeg) {
        motionSeg = id;
        logEvent('tab', `Motion view: ${id}`);
    }
    let weatherSeg: (typeof WEATHER_SEGS)[number]['id'] = 'route';
    function setWeatherSeg(id: typeof weatherSeg) {
        weatherSeg = id;
        logEvent('tab', `Weather view: ${id}`);
        if ((id === 'port' || id === 'tides') && !get(placeData) && get(placePoint)) loadPlace().catch(() => {});
    }
    const HELP_SEGS = [
        { id: 'guide', label: 'Guide', icon: 'book' },
        { id: 'usage', label: 'Usage', icon: 'heat' },
        { id: 'feedback', label: 'Feedback', icon: 'mail' },
        { id: 'about', label: 'About', icon: 'info' },
    ] as const;
    let tab = 'route';
    let routeSeg: (typeof ROUTE_SEGS)[number]['id'] = 'waypoints';
    let optSeg: (typeof OPT_SEGS)[number]['id'] = 'speed';
    let help = false;
    let helpSeg: (typeof HELP_SEGS)[number]['id'] = 'guide';
    function openTab(id: string): void {
        // old tab names (still used by some buttons) → new place
        if (id === 'speed') {
            openTab('route');
            return setRouteSeg('speed');
        }
        if (id === 'compare') {
            openTab('optimise');
            return setOptSeg('compare');
        }
        if (id === 'info' || id === 'usage') return openHelp(id === 'info' ? 'guide' : 'usage');
        tab = id;
        help = false;
        logEvent('tab', `Section: ${SECTIONS.find(t => t.id === id)?.label ?? id}`);
    }
    function setRouteSeg(id: typeof routeSeg) {
        routeSeg = id;
        logEvent('tab', `Route view: ${id}`);
    }
    function setOptSeg(id: typeof optSeg) {
        optSeg = id;
        logEvent('tab', `Optimise view: ${id}`);
    }
    function openHelp(id?: typeof helpSeg) {
        if (id) helpSeg = id;
        else if (help) return closeHelp();
        const was = help;
        help = true;
        logEvent('tab', `Help: ${helpSeg}`);
        if (!was) toStart(true);
    }
    function closeHelp() {
        help = false;
        toStart();
    }
    // ---- phones: the way back (owner's report, 2026-11-19) ----
    let navEl: HTMLElement | null = null;
    let startEl: HTMLElement | null = null;
    /** A section pressed in the bar: open it and, on a phone, show it from its start */
    function navPress(id: string) {
        openTab(id);
        toStart();
    }
    /**
     * Phones: bring the start of the section (or Help) to the top of the panel, under the section bar. Only when the
     * panel is already scrolled past it, unless `always` (Help opens far below the header on a small screen).
     */
    async function toStart(always = false) {
        if (!get(phone)) return;
        try {
            await tick();
            const a = startEl?.getBoundingClientRect();
            const n = navEl?.getBoundingClientRect();
            if (!a || !n) return;
            if (always || a.top < n.bottom - 1) bringToTop(startEl);
        } catch {
            /* stays where it is */
        }
    }
    /** Jumps asked for by other parts of the pane ("All settings" in a fold-out, the voyage strip, "Used in" links) */
    function navTo(t: NavTarget) {
        if (t.tab === 'help') return openHelp((t.seg as typeof helpSeg) ?? 'guide');
        if (t.tab === 'settings') {
            if (t.settings) openSettingsSection(t.settings, true);
            return openTab('settings');
        }
        openTab(t.tab);
        if (t.tab === 'route' && t.seg) setRouteSeg(t.seg as typeof routeSeg);
        if (t.tab === 'weather' && t.seg) setWeatherSeg(t.seg as typeof weatherSeg);
        if (t.tab === 'optimise' && t.seg) setOptSeg(t.seg as typeof optSeg);
        if (t.tab === 'snapshot' && t.seg) setMotionSeg(t.seg as typeof motionSeg);
    }
    let layer: RouteLayer | null = null;
    let headEl: HTMLElement | null = null;
    function toTop() {
        try {
            headEl?.scrollIntoView({ block: 'start' });
        } catch {
            /* stays where it is */
        }
    }

    const onTs = (ts: number) => timelineTs.set(ts);
    /**
     * While typing in one of the plugin's boxes, keys (arrows especially) must not reach Windy,
     * which would otherwise move its time slider. Caught as early as possible (window, capture).
     */
    const keyGuard = (e: KeyboardEvent) => {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.('input, textarea, select, [contenteditable="true"]') && t.closest('.pp, .sb')) {
            // Esc in a box of a settings fold-out or of the settings window closes that (the key still does not reach Windy)
            if (e.type === 'keydown' && e.key === 'Escape') {
                if (t.closest('.g-fold')) closeFold();
                else if (t.closest('.g-setwin')) closeSetWin();
            }
            e.stopPropagation();
        }
    };
    const onProduct = (p: unknown) => mapProduct.set(typeof p === 'string' ? p : '');

    export const onopen = (_params: unknown) => {
        // Opened from the menu or a URL: nothing extra to do.
    };

    /** Move Windy's time slider to the planned time at a waypoint (ETD for WP1, else ETA). */
    function goToWaypointTime(uid: string) {
        const r = get(route);
        const p = get(plan);
        const i = r.waypoints.findIndex(w => w.uid === uid);
        if (i < 0 || p.etd == null) return;
        const t = i === 0 ? p.etd : p.legs[i - 1]?.arriveMs;
        if (t != null) store.set('timestamp', t);
    }

    // Land check (debounced): positions above sea level on Windy's elevation data
    let landTimer: ReturnType<typeof setTimeout> | null = null;
    $: landKey = $route.waypoints.map(w => `${w.uid}:${w.lat.toFixed(3)},${w.lon.toFixed(3)}`).join('|');
    $: if (landKey !== undefined) {
        if (landTimer) clearTimeout(landTimer);
        const wps = $route.waypoints.map(w => ({ uid: w.uid, lat: w.lat, lon: w.lon }));
        landTimer = setTimeout(() => waypointsOnLand(wps).then(s => landUids.set(s)), 700);
    }

    function appendWaypoint(lat: number, lon: number) {
        updateRoute(r => {
            const wp = newWaypoint(lat, lon, r.defaultLegType);
            r.waypoints.push(wp);
            selectedUids.set([wp.uid]);
        });
    }
    /** Right-click on the map → Port weather / Tides for that point (never changes the route) */
    function placeHere(lat: number, lon: number, view: 'port' | 'tides') {
        setPoint(lat, lon);
        loadPlace().catch(() => {});
        openTab('weather');
        weatherSeg = view;
        logEvent('click', `Right-click on the map: ${view === 'port' ? 'Port weather' : 'Tides'} here`);
    }

    function fit() {
        layer?.fitTo(get(route));
    }

    onMount(() => {
        // each part guarded (0.23.2, owner's report: 0.23.1 did not open in Windy): one failing feature must not stop the panel
        const safe = (what: string, fn: () => unknown) => {
            try {
                fn();
            } catch (e) {
                console.error('[galenea]', what, e);
                try {
                    logEvent('error', `${what} failed when the plugin opened: ${(e as Error).message}`);
                } catch {
                    /* log not ready */
                }
            }
        };
        safe('Look', () => (uninstallTheme = installTheme()));
        safe('Phone screen', () => (stopSafeTop = watchSafeTop()));
        safe('Activity log', startLogging);
        safe('Wave chart', startWaveChart);
        safe('Roll chart', startRollChart);
        safe('Nautical charts', startChartLayers);
        safe('Ports and canals', startPlaces);
        safe('Sea areas and limits', startSeaAreas);
        safe('Climate beyond the forecast', startClimate);
        safe('Range rings', startRangeRings);
        safe('Place marker', showMarker);
        safe('Weather area on the map', startAreaLayer);
        safe('Weather by itself', startAutoWeather);
        safe('Jumps inside the panel', () => setNavHandler(navTo));
        safe('Map tool note', startMapToolNote);
        safe('Undo / redo keys', () => window.addEventListener('keydown', undoKey, true));
        layer = new RouteLayer({
            onMove(uid, lat, lon, final) {
                // the whole drag is one undo step (Ctrl+Z, owner 2026-11-23)
                if (!final) dragMove(false);
                updateRoute(r => {
                    const w = r.waypoints.find(x => x.uid === uid);
                    if (w) {
                        w.lat = lat;
                        w.lon = lon;
                    }
                });
                if (final) dragMove(true);
            },
            onInsert(beforeIndex, lat, lon) {
                insertWaypoint(beforeIndex, lat, lon);
            },
            onSelect(uid, additive) {
                selectWp(uid, additive);
                if (!additive) goToWaypointTime(uid);
            },
            onShipClick(time) {
                store.set('timestamp', time);
            },
            pick(lat, lon) {
                return pickAt(lat, lon);
            },
            onMapClick(lat, lon) {
                if (!get(addMode)) return;
                appendWaypoint(lat, lon);
            },
            onWaypointMenu(uid, x, y) {
                const r = get(route);
                const i = r.waypoints.findIndex(w => w.uid === uid);
                if (i < 0) return;
                const sel = get(selectedUids);
                const many = sel.length > 1 && sel.includes(uid);
                const items = [
                    { label: `Delete waypoint ${i + 1}`, danger: true, action: () => deleteWaypoints([uid]) },
                    ...(many ? [{ label: `Delete ${sel.length} selected waypoints`, danger: true, action: () => deleteWaypoints(sel) }] : []),
                    ...(i < r.waypoints.length - 1
                        ? [{ label: 'Insert waypoint after this one', action: () => { const a = r.waypoints[i]; const b = r.waypoints[i + 1]; insertWaypoint(i + 1, (a.lat + b.lat) / 2, a.lon + (((b.lon - a.lon + 540) % 360) - 180) / 2); } }]
                        : []),
                    { label: sel.includes(uid) ? 'Unselect' : 'Add to selection', action: () => selectWp(uid, true) },
                    { label: `Port weather at WP${i + 1}`, action: () => placeHere(r.waypoints[i].lat, r.waypoints[i].lon, 'port') },
                    { label: `Tides at WP${i + 1}`, action: () => placeHere(r.waypoints[i].lat, r.waypoints[i].lon, 'tides') },
                ];
                openMenu(x, y, `WP${i + 1}${r.waypoints[i].name ? ' · ' + r.waypoints[i].name : ''}`, items);
            },
            onLegMenu(beforeIndex, lat, lon, x, y) {
                openMenu(x, y, `Leg WP${beforeIndex} → WP${beforeIndex + 1}`, [
                    { label: 'Insert waypoint here', action: () => insertWaypoint(beforeIndex, lat, lon) },
                ]);
            },
            onWaterMenu(lat, lon, x, y) {
                openMenu(x, y, `${fmtLat(lat, 1)} ${fmtLon(lon, 1)}`, [
                    { label: 'Port weather here', action: () => placeHere(lat, lon, 'port') },
                    { label: 'Tides here', action: () => placeHere(lat, lon, 'tides') },
                    { label: 'Add waypoint here (at the end of the route)', action: () => appendWaypoint(lat, lon) },
                ]);
            },
            legClickInserts: () => get(legClickInserts),
        });
        const ts = store.get('timestamp');
        if (typeof ts === 'number') timelineTs.set(ts);
        store.on('timestamp', onTs);
        for (const k of ['keydown', 'keyup', 'keypress']) window.addEventListener(k, keyGuard as EventListener, true);
        safe('Windy model', () => {
            onProduct(store.get('product'));
            store.on('product', onProduct);
        });
        // Pressure lines on by default (⚙ Settings → Map display); only when Windy shows none
        safe('Pressure lines', () => get(showIsobars) && !store.get('isolinesOn') && showPressureLines());
        safe('Fit route', () => get(route).waypoints.length && fit());
    });

    let uninstallTheme: (() => void) | null = null;
    onDestroy(() => uninstallTheme?.());
    let stopSafeTop: (() => void) | null = null;
    onDestroy(() => stopSafeTop?.());
    onDestroy(() => {
        try {
            window.removeEventListener('keydown', undoKey, true);
        } catch {
            /* gone */
        }
        stopLogging();
        stopWaveChart();
        stopRollChart();
        stopChartLayers();
        stopPlaces();
        try {
            stopClimate();
        } catch {
            /* gone */
        }
        try {
            stopSeaAreas();
        } catch {
            /* gone */
        }
        stopRangeRings();
        try {
            stopAutoWeather();
            stopAreaLayer();
        } catch {
            /* gone */
        }
        try {
            cancelPick();
            hideMarker();
            setNavHandler(null);
            stopMapToolNote();
            closeFold(false);
            closeSetWin();
        } catch {
            /* gone */
        }
        closeMenu();
        store.off('timestamp', onTs);
        for (const k of ['keydown', 'keyup', 'keypress']) window.removeEventListener(k, keyGuard as EventListener, true);
        store.off('product', onProduct);
        layer?.destroy();
        layer = null;
    });

    // Voyage running: the part already sailed (up to the present position typed in, or where the plan puts the ship now)
    let clock = Date.now();
    const clockTimer = setInterval(() => (clock = Date.now()), 60_000);
    onDestroy(() => clearInterval(clockTimer));
    $: doneNm = $route.voyage ? sailedNm($plan, clock) : null;
    function sailedNm(p: typeof $plan, nowMs: number): number | null {
        if (p.fix) return p.fix.alongNm;
        if (p.etd == null || p.eta == null) return null;
        if (nowMs <= p.etd) return 0;
        if (nowMs >= p.eta) return p.totalNm;
        const pos = positionAt(get(route), p, nowMs);
        return pos ? (projectOnLegs(p.legs, pos.lat, pos.lon)?.alongNm ?? null) : null;
    }
    $: layer && layer.render($route, $plan, $selectedUids, $landUids, doneNm);
    $: layer && layer.renderCompare($savedRoutes.filter(s => s.show).map(s => ({ name: s.route.name, color: s.color, waypoints: s.route.waypoints })));

    let ships: ShipPosition[] = [];
    let now: ShipPosition | null = null;
    $: ships = $shipStepH > 0 ? shipPositions($route, $plan, $shipStepH, 1500) : [];
    $: now = $plan.etd != null && $plan.eta != null && $timelineTs >= $plan.etd && $timelineTs <= $plan.eta ? positionAt($route, $plan, $timelineTs) : null;
    $: try { setRingCenter(now ? { lat: now.lat, lon: now.lon } : null); } catch { /* rings are optional */ }
    // Weather on the ship symbols, only when the forecast belongs to the current plan
    let glyph: (p: ShipPosition) => ShipGlyph | null = () => null;
    $: glyph =
        $wxSeries.length && $wxPlanKey === $planKey
            ? (p: ShipPosition) => {
                  const w0 = weatherAt($wxSeries, p, p.time);
                  const w = w0 ? withWindySea(w0, $wxSweepValid, p.time) : null;
                  const leg = $plan.legs[Math.max(0, p.legIdx)];
                  return w ? glyphFor(w, p.course, leg ? leg.stw : 0, $vessel, $thresholds) : null;
              }
            : () => null;
    $: layer &&
        layer.renderShips(ships, now, p => `${fmtTime(p.time)} UTC`, glyph, $shipWeather, $shipStyle, $flagColors, $glyphStyle);

    // Ship info window and "keep the ship centred"
    $: wxOk = $wxSeries.length > 0 && $wxPlanKey === $planKey;
    $: nowWxRaw = now && wxOk ? weatherAt($wxSeries, now, $timelineTs) : null;
    $: nowWx = nowWxRaw ? withWindySea(nowWxRaw, $wxSweepValid, $timelineTs) : null;
    $: nowCur = now ? nearestSweep($wxSweepValid, $timelineTs, 'currentKn') : null;
    $: nowCurrent = nowCur && nowCur.currentKn != null && nowCur.currentSet != null ? { kn: nowCur.currentKn, set: nowCur.currentSet } : null;
    $: nowGlyph = now ? glyph(now) : null;
    $: nowSog = now ? trackSog($plan, $timelineTs) : null;
    $: nowStw = now && !now.stopped ? ($plan.legs[Math.max(0, now.legIdx)]?.stw ?? null) : 0;
    $: voyageNote =
        $plan.etd == null
            ? 'Set the ETD (Route tab) to see the ship here.'
            : $plan.eta != null && ($timelineTs < $plan.etd || $timelineTs > $plan.eta)
              ? `Map time is outside the voyage (${fmtTime($plan.etd)} – ${fmtTime($plan.eta)} UTC). Click a waypoint or ship to jump to it.`
              : 'No route yet.';
    $: if ($followShip && now && layer) map.panTo([now.lat, now.lon], { animate: true, duration: 0.25 });

    function trackSog(p: typeof $plan, t: number): number | null {
        const tr = p.track;
        if (!tr || !tr.length) {
            const pos = positionAt(get(route), p, t);
            return pos ? (p.legs[Math.max(0, pos.legIdx)]?.sog ?? null) : null;
        }
        let best = tr[0];
        for (const q of tr) {
            if (q.t <= t) best = q;
            else break;
        }
        return best.sog > 0 ? best.sog : null;
    }
</script>

<style lang="less">
    /* no 'position' here (0.23.3): Windy positions and scrolls this panel itself; overriding it stopped the scrolling */
    .g-shell {
        padding-bottom: 16px;
    }
    .g-totop {
        display: flex;
        justify-content: center;
        margin-top: 4px;
    }
    .g-head {
        display: flex !important;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        margin: 0 !important;
    }
    .g-head__name {
        font-size: 17px;
        font-weight: 650;
        letter-spacing: 0.01em;
        color: var(--g-text-1);
    }
    .g-head__ver {
        font-size: 11px;
        color: var(--g-text-3);
        background: var(--g-bg-2);
        border-radius: 10px;
        padding: 1px 7px;
    }
    .g-head__tools {
        margin-left: auto;
        display: flex;
        gap: 2px;
        align-items: center;
        cursor: default;
    }
    .g-now__t {
        font-family: var(--g-mono);
        font-weight: 400;
        color: var(--g-text-2);
        font-size: 11.5px;
    }
    .g-help-btn {
        position: relative;
    }
    .g-dot {
        position: absolute;
        top: 5px;
        right: 5px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--g-accent);
        box-shadow: 0 0 0 2px var(--g-bg-0);
        &.g-dot--red {
            background: var(--g-danger);
        }
    }
    /* new version out: a clear green button next to the ⓘ (owner, 2026-11-24) */
    .g-upd {
        background: #1e8e3e !important;
        border-color: #1e8e3e !important;
        color: #fff !important;
        font-weight: 700;
        gap: 4px;
        margin-right: 2px;
        animation: g-upd-pulse 2s ease-in-out 3;
    }
    @keyframes g-upd-pulse {
        50% {
            box-shadow: 0 0 0 4px rgba(30, 142, 62, 0.35);
        }
    }
    @media (max-width: 430px) {
        .g-upd__t {
            display: none;
        }
    }
    .g-tagline {
        font-size: 12px;
        color: var(--g-text-3);
        margin: -2px 0 6px;
        i {
            color: var(--g-text-2);
        }
    }
    .g-aid {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--g-warn);
        border-left: 3px solid var(--g-warn);
        background: rgba(244, 182, 63, 0.08);
        border-radius: 0 6px 6px 0;
        padding: 3px 4px 3px 8px;
        margin: 0 0 8px;
        span {
            flex: 1;
        }
    }
    .pp-dup {
        background: rgba(255, 92, 92, 0.14);
        color: #ffd6d6;
        border-left: 3px solid var(--g-danger);
        border-radius: 0 6px 6px 0;
        padding: 6px 8px;
        margin: 0 0 8px;
        font-size: 12px;
    }
    .g-nav {
        display: flex;
        gap: 2px;
        margin: 0 -2px 12px;
        border-bottom: 1px solid var(--g-border);
    }
    .g-nav__item {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 7px 2px 6px;
        min-height: 48px;
        border: 0;
        border-radius: 8px 8px 0 0;
        background: transparent;
        color: var(--g-text-2);
        font: 500 12px var(--g-font);
        cursor: pointer;
        box-shadow: inset 0 -2px 0 transparent;
        transition:
            color 0.12s,
            background 0.12s;
        &:hover {
            background: var(--g-bg-2);
            color: var(--g-text-1);
        }
        &.is-on {
            color: var(--g-text-1);
            font-weight: 650;
            box-shadow: inset 0 -2px 0 var(--g-accent);
            :global(.g-icon) {
                color: var(--g-accent);
            }
        }
    }
    .g-drawer {
        background: var(--g-bg-0);
    }
    .g-drawer__head {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
        background: var(--g-bg-0);
        border-bottom: 1px solid var(--g-border);
        b {
            font-size: 15px;
        }
    }
    .g-drawer__seg {
        flex: 1;
        margin: 0 !important;
    }
    .g-drawer__body {
        padding: 12px 0;
    }
    /* Scrollbars: visible whenever a section overflows, absent when everything fits (owner's wish) */
    :global(.pp .pp-scroll) {
        overflow: auto;
        scrollbar-width: auto;
        scrollbar-color: rgba(255, 255, 255, 0.45) rgba(255, 255, 255, 0.08);
    }
    :global(.pp .pp-scroll::-webkit-scrollbar) {
        width: 10px;
        height: 10px;
    }
    :global(.pp .pp-scroll::-webkit-scrollbar-track) {
        background: rgba(255, 255, 255, 0.08);
        border-radius: 5px;
    }
    :global(.pp .pp-scroll::-webkit-scrollbar-thumb) {
        background: rgba(255, 255, 255, 0.45);
        border-radius: 5px;
    }
    /* Right-click menu */
    :global(.pp-menu) {
        position: fixed;
        z-index: 100000;
        min-width: 190px;
        background: #2b2b2b;
        color: #eee;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
        padding: 4px 0;
        font: 13px sans-serif;
    }
    :global(.pp-menu__title) {
        padding: 4px 12px 6px;
        font-weight: bold;
        opacity: 0.8;
        border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        margin-bottom: 2px;
    }
    :global(.pp-menu__item) {
        display: block;
        width: 100%;
        text-align: left;
        background: none;
        border: 0;
        color: inherit;
        padding: 6px 12px;
        cursor: pointer;
        font: inherit;
    }
    :global(.pp-menu__item:hover) {
        background: rgba(255, 255, 255, 0.12);
    }
    :global(.pp-menu__item--danger) {
        color: #ff8a8a;
    }
    /* Map symbols (outside the panel, so global) */
    :global(.pp-wp-icon),
    :global(.pp-label-icon),
    :global(.pp-ship-icon),
    :global(.pp-readout-icon) {
        background: none;
        border: 0;
    }
    :global(.pp-wp) {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #ff2d95;
        border: 2px solid #fff;
        color: #fff;
        font: bold 10px/16px sans-serif;
        text-align: center;
        box-sizing: border-box;
        cursor: move;
        box-shadow: 0 0 3px #000;
    }
    :global(.pp-wp--sel) {
        background: #ffd400;
        color: #000;
    }
    :global(.pp-label) {
        position: absolute;
        white-space: nowrap;
        color: #fff;
        font: bold 11px sans-serif;
        text-shadow: 0 0 3px #000, 0 0 2px #000;
        padding-bottom: 3px;
        pointer-events: none;
    }
    :global(.pp-readout) {
        background: rgba(0, 0, 0, 0.8);
        color: #ffd400;
        font: bold 11px monospace;
        padding: 2px 5px;
        border-radius: 3px;
        white-space: nowrap;
        display: inline-block;
    }
    :global(.pp-land) {
        position: absolute;
        left: -14px;
        top: -18px;
        white-space: nowrap;
        background: #ffd400;
        color: #000;
        font: bold 10px sans-serif;
        padding: 0 4px;
        border-radius: 3px;
        box-shadow: 0 0 2px #000;
    }
    :global(.pp-ship-icon) {
        cursor: pointer;
    }
    :global(.pp-glyph-wrap) {
        pointer-events: none;
        line-height: 0;
    }
    :global(.pp-ship) {
        transform-origin: 50% 50%;
        line-height: 0;
    }
    :global(.pp-ship-time) {
        position: absolute;
        left: 20px;
        top: 2px;
        color: #fff;
        font: 10px sans-serif;
        text-shadow: 0 0 2px #000, 0 0 2px #000;
        white-space: nowrap;
        pointer-events: none;
    }
    :global(.pp-ship-time--now) {
        left: -20px;
        top: 30px;
        color: #ffd400;
        font-weight: bold;
    }
    .pp-by {
        display: block;
        font-size: 11px;
        font-weight: normal;
        opacity: 0.75;
        margin-top: 2px;
    }
    .pp-version {
        font-size: 11px;
        font-weight: normal;
        opacity: 0.7;
        margin-left: 4px;
    }
    :global(.pp-cmp-label) {
        background: none;
        border: 0;
    }
    :global(.pp-cmp-label span) {
        font: bold 11px sans-serif;
        white-space: nowrap;
        text-shadow: 0 0 3px #000, 0 0 3px #000;
        pointer-events: none;
    }
    :global(.pp-wave-legend) {
        position: fixed;
        left: 12px;
        bottom: var(--pp-legend-bottom, 110px);
        z-index: 1100;
        width: 270px;
        background: rgba(30, 30, 30, 0.92);
        color: #eee;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 8px;
        padding: 6px 8px;
        font: 11px sans-serif;
        pointer-events: auto; /* floating window: move, resize, minimise, original size, close */
    }
    :global(.pp-wave-legend .wl-title) {
        font-weight: bold;
        margin-bottom: 3px;
    }
    :global(.pp-wave-legend .wl-bar) {
        display: flex;
        margin: 3px 0;
        border: 1px solid #000;
    }
    :global(.pp-wave-legend .wl-bar span) {
        flex: 1;
        text-align: center;
        font-size: 10px;
        padding: 1px 0;
    }
    :global(.pp-wave-legend i) {
        display: inline-block;
        width: 16px;
        height: 3px;
        margin-right: 4px;
        vertical-align: middle;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
    }
    :global(.pp-wave-legend .wl-sub) {
        margin-top: 4px;
    }
    :global(.pp-wave-legend .wl-src) {
        opacity: 0.7;
        font-size: 10px;
        margin-top: 3px;
    }
    :global(.pp-roll-legend) {
        position: fixed;
        left: 292px;
        bottom: var(--pp-legend-bottom, 110px);
        z-index: 1100;
        width: 300px;
        background: rgba(30, 30, 30, 0.92);
        color: #eee;
        border: 1px solid rgba(255, 120, 120, 0.5);
        border-radius: 8px;
        padding: 6px 8px;
        font: 11px sans-serif;
        pointer-events: auto; /* floating window: move, resize, minimise, original size, close */
    }
    :global(.pp-roll-legend .rk-title) {
        font-weight: bold;
        margin-bottom: 3px;
    }
    :global(.pp-roll-legend .rk-chips) {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
        margin: 4px 0;
    }
    :global(.pp-roll-legend .rk-chip) {
        padding: 1px 5px;
        border-radius: 3px;
        font-weight: bold;
        font-size: 10.5px;
    }
    :global(.pp-roll-legend .rk-limit) {
        outline: 2px dashed #fff;
    }
    :global(.pp-roll-legend .rk-work) {
        color: #ffd28a;
    }
    :global(.pp-roll-legend .rk-src) {
        opacity: 0.7;
        font-size: 10px;
        margin-top: 3px;
    }
    :global(.pp-iso-label span) {
        display: inline-block;
        transform: translate(-50%, -50%);
        background: rgba(255, 255, 255, 0.85);
        color: #111;
        font: bold 10px sans-serif;
        padding: 0 3px;
        border-radius: 3px;
        white-space: nowrap;
    }
    :global(.pp-fix-icon) {
        background: none;
        border: 0;
    }
    :global(.pp-fix) {
        width: 18px;
        height: 18px;
        line-height: 18px;
        text-align: center;
        font-size: 18px;
        color: #fff;
        text-shadow: 0 0 3px #000, 0 0 3px #000;
    }
    :global(.pp-fix-label) {
        position: absolute;
        left: 20px;
        top: 2px;
        white-space: nowrap;
        color: #fff;
        font: bold 10px sans-serif;
        text-shadow: 0 0 2px #000, 0 0 2px #000;
    }
    @media (max-width: 600px), (max-height: 500px) and (pointer: coarse) {
        /* phones: Windy's own title bar already names the plugin; keep the warning, drop the tagline */
        .g-tagline {
            display: none;
        }
        .g-head__name {
            font-size: 16px;
        }
    }
</style>
