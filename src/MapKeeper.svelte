<!--
    Everything Galenea does ON THE MAP, apart from the panel (owner's report, 2026-11-26: on a phone, with the panel pulled
    down "the functions of galena disappeared, for example the route on the screen which i was editing with half screen").
    Windy closes the panel (and destroys plugin.svelte) when it is pulled all the way down on a phone; this part keeps
    running then, so the route, waypoints (drag, tap to add, long-press menu), ships with their weather, wave and roll
    charts, nautical charts, sea areas, ports, range rings, the weather area box and the weather that follows route changes
    all stay. It is started by the panel (windy/mapKeeper.ts) and stopped when the panel closes on a computer, or with the
    ✕ on the phone's Galenea tab. Each part is guarded: one failing feature must not stop the others.
-->
<script lang="ts">
    import store from '@windy/store';
    import { map } from '@windy/map';
    import { onDestroy, onMount } from 'svelte';
    import { get } from 'svelte/store';

    import { logEvent } from './lib/activityLog';
    import { fmtLat, fmtLon, fmtTime } from './lib/format';
    import { newWaypoint, positionAt, projectOnLegs, shipPositions, type ShipPosition } from './lib/model';
    import { glyphFor, type ShipGlyph } from './lib/shipGlyph';
    import { weatherAt, withWindySea } from './lib/weather';
    import { startLogging, stopLogging } from './logHooks';
    import { dragMove } from './routeHistory';
    import {
        addMode,
        deleteWaypoints,
        flagColors,
        followShip,
        glyphStyle,
        insertWaypoint,
        landUids,
        legClickInserts,
        mapProduct,
        plan,
        planKey,
        route,
        savedRoutes,
        selectWp,
        selectedUids,
        shipStepH,
        shipStyle,
        shipWeather,
        thresholds,
        timelineTs,
        updateRoute,
        vessel,
        wxPlanKey,
        wxSeries,
        wxSweepValid,
    } from './state';
    import { goScreenOrOpen } from './ui/nav';
    import { installTheme } from './ui/theme';
    import { startAreaLayer, stopAreaLayer } from './windy/areaLayer';
    import { startChartLayers, stopChartLayers } from './windy/chartLayer';
    import { startClimate, stopClimate } from './windy/climateJob';
    import { openMenu, closeMenu } from './windy/contextMenu';
    import { waypointsOnLand } from './windy/land';
    import { RouteLayer } from './windy/mapLayer';
    import { mapLayer, shipGlyphFn, shipNow } from './windy/mapKeeperState';
    import { startMapToolNote, stopMapToolNote } from './windy/mapToolNote';
    import { hideMarker, loadPlace, pickAt, setPoint, showMarker } from './windy/placeJob';
    import { startPlaces, stopPlaces } from './windy/placesLayer';
    import { setRingCenter, startRangeRings, stopRangeRings } from './windy/rangeRingsLayer';
    import { startDriftLayer, stopDriftLayer } from './windy/driftLayer';
    import { startDriftClock, stopDriftClock } from './windy/driftJob';
    import { startRollChart, stopRollChart } from './windy/rollChart';
    import { startSeaAreas, stopSeaAreas } from './windy/seaAreasLayer';
    import { startWaveChart, stopWaveChart } from './windy/waveChart';
    import { startAutoWeather, stopAutoWeather } from './windy/weatherJobs';

    let layer: RouteLayer | null = null;
    // the style sheet is shared with the panel (counted): the map's labels keep their look while the panel is closed
    let uninstallTheme: (() => void) | null = null;

    const safe = (what: string, fn: () => unknown) => {
        try {
            fn();
        } catch (e) {
            console.error('[galenea]', what, e);
            try {
                logEvent('error', `${what} failed: ${(e as Error).message}`);
            } catch {
                /* log not ready */
            }
        }
    };

    const onTs = (ts: number) => timelineTs.set(ts);
    const onProduct = (p: unknown) => mapProduct.set(typeof p === 'string' ? p : '');

    /** Move Windy's time slider to the planned time at a waypoint (ETD for WP1, else ETA). */
    function goToWaypointTime(uid: string) {
        const r = get(route);
        const p = get(plan);
        const i = r.waypoints.findIndex(w => w.uid === uid);
        if (i < 0 || p.etd == null) return;
        const t = i === 0 ? p.etd : p.legs[i - 1]?.arriveMs;
        if (t != null) store.set('timestamp', t);
    }
    function appendWaypoint(lat: number, lon: number) {
        updateRoute(r => {
            const wp = newWaypoint(lat, lon, r.defaultLegType);
            r.waypoints.push(wp);
            selectedUids.set([wp.uid]);
        });
    }
    /** Right-click / long-press on the map → Port weather / Tides for that point (opens the panel if it is closed) */
    function placeHere(lat: number, lon: number, view: 'port' | 'tides') {
        setPoint(lat, lon);
        loadPlace().catch(() => {});
        goScreenOrOpen({ tab: 'weather', seg: view });
        logEvent('click', `Right-click on the map: ${view === 'port' ? 'Port weather' : 'Tides'} here`);
    }

    onMount(() => {
        safe('Look', () => (uninstallTheme = installTheme()));
        safe('Activity log', startLogging);
        safe('Wave chart', startWaveChart);
        safe('Roll chart', startRollChart);
        safe('Nautical charts', startChartLayers);
        safe('Ports and canals', startPlaces);
        safe('Sea areas and limits', startSeaAreas);
        safe('Climate beyond the forecast', startClimate);
        safe('Range rings', startRangeRings);
        safe('Drift on the map', startDriftLayer);
        safe('Drift clock', startDriftClock);
        safe('Place marker', showMarker);
        safe('Weather area on the map', startAreaLayer);
        safe('Weather by itself', startAutoWeather);
        safe('Map tool note', startMapToolNote);
        safe('Route on the map', () => {
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
                            ? [
                                  {
                                      label: 'Insert waypoint after this one',
                                      action: () => {
                                          const a = r.waypoints[i];
                                          const b = r.waypoints[i + 1];
                                          insertWaypoint(i + 1, (a.lat + b.lat) / 2, a.lon + (((b.lon - a.lon + 540) % 360) - 180) / 2);
                                      },
                                  },
                              ]
                            : []),
                        { label: sel.includes(uid) ? 'Unselect' : 'Add to selection', action: () => selectWp(uid, true) },
                        { label: `Port weather at WP${i + 1}`, action: () => placeHere(r.waypoints[i].lat, r.waypoints[i].lon, 'port') },
                        { label: `Tides at WP${i + 1}`, action: () => placeHere(r.waypoints[i].lat, r.waypoints[i].lon, 'tides') },
                    ];
                    openMenu(x, y, `WP${i + 1}${r.waypoints[i].name ? ' · ' + r.waypoints[i].name : ''}`, items);
                },
                onLegMenu(beforeIndex, lat, lon, x, y) {
                    openMenu(x, y, `Leg WP${beforeIndex} → WP${beforeIndex + 1}`, [{ label: 'Insert waypoint here', action: () => insertWaypoint(beforeIndex, lat, lon) }]);
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
            mapLayer.set(layer);
        });
        safe('Map time', () => {
            const ts = store.get('timestamp');
            if (typeof ts === 'number') timelineTs.set(ts);
            store.on('timestamp', onTs);
        });
        safe('Windy model', () => {
            onProduct(store.get('product'));
            store.on('product', onProduct);
        });
    });

    onDestroy(() => {
        const stops: [string, () => void][] = [
            ['Activity log', stopLogging],
            ['Wave chart', stopWaveChart],
            ['Roll chart', stopRollChart],
            ['Nautical charts', stopChartLayers],
            ['Ports and canals', stopPlaces],
            ['Climate', stopClimate],
            ['Sea areas', stopSeaAreas],
            ['Range rings', stopRangeRings],
            ['Drift', stopDriftLayer],
            ['Drift clock', stopDriftClock],
            ['Weather by itself', stopAutoWeather],
            ['Weather area', stopAreaLayer],
            ['Place marker', hideMarker],
            ['Map tool note', stopMapToolNote],
            ['Menu', closeMenu],
        ];
        for (const [, fn] of stops) {
            try {
                fn();
            } catch {
                /* gone */
            }
        }
        try {
            store.off('timestamp', onTs);
            store.off('product', onProduct);
        } catch {
            /* gone */
        }
        clearInterval(clockTimer);
        if (landTimer) clearTimeout(landTimer);
        try {
            layer?.destroy();
        } catch {
            /* gone */
        }
        layer = null;
        mapLayer.set(null);
        shipNow.set(null);
        try {
            uninstallTheme?.();
        } catch {
            /* gone */
        }
        shipGlyphFn.set(() => null);
    });

    // Land check (debounced): positions above sea level on Windy's elevation data
    let landTimer: ReturnType<typeof setTimeout> | null = null;
    $: landKey = $route.waypoints.map(w => `${w.uid}:${w.lat.toFixed(3)},${w.lon.toFixed(3)}`).join('|');
    $: if (landKey !== undefined) {
        if (landTimer) clearTimeout(landTimer);
        const wps = $route.waypoints.map(w => ({ uid: w.uid, lat: w.lat, lon: w.lon }));
        landTimer = setTimeout(() => waypointsOnLand(wps).then(s => landUids.set(s)), 700);
    }

    // Voyage running: the part already sailed (up to the present position typed in, or where the plan puts the ship now)
    let clock = Date.now();
    const clockTimer = setInterval(() => (clock = Date.now()), 60_000);
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
    $: shipNow.set(now);
    $: try {
        setRingCenter(now ? { lat: now.lat, lon: now.lon } : null);
    } catch {
        /* rings are optional */
    }
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
    $: shipGlyphFn.set(glyph);
    $: layer && layer.renderShips(ships, now, p => `${fmtTime(p.time)} UTC`, glyph, $shipWeather, $shipStyle, $flagColors, $glyphStyle);
    $: if ($followShip && now && layer) map.panTo([now.lat, now.lon], { animate: true, duration: 0.25 });
</script>
