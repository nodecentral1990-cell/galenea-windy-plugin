// Getting the weather for the Route tab's route: point forecasts along the route, then (optionally)
// currents and visibility read from Windy's map layers. Shared by the Weather tab and the voyage
// panel (after a position update), with a progress window while it runs.

import { get, writable } from 'svelte/store';

import { areaGrid, buildRows, inArea, routePointsByLeg, weatherAt, type WxArea, type WxSeries } from '../lib/weather';
import {
    basePlan,
    freeForecast,
    plan,
    planKey,
    route,
    sweepKey,
    tableStepH,
    thresholds,
    updateRoute,
    vessel,
    workEnd,
    workProgress,
    workPaused,
    workStart,
    wxPlanKey,
    wxSeries,
    wxSweep,
    wxSweepKey,
    wxSweepValid,
} from '../state';
import { clearExtraCache, clearForecastCache, extraStatus, fetchSeries, lastSweepReport, omStatus, runLimited, setFreeFill, sweep, windyCoverage, type SweepKind } from './forecast';
import store from '@windy/store';
import { logEvent } from '../lib/activityLog';
import { recordRoutePlanned } from '../lib/usage';
import { forecastInfo } from '../lib/weather';

/** Windy's pressure lines (isobars) on (store keys from Windy's type files: isolinesType / isolinesOn) */
export function showPressureLines(): void {
    store.set('isolinesType', 'pressure');
    store.set('isolinesOn', true);
}

/** Shown in the progress window while a map-layer reading waits for the page to be visible */
export const PAUSED =
    "Paused: this Windy tab is hidden or the window is minimised. Browsers stop drawing hidden pages, and currents / visibility can only be read from Windy's drawn map. It carries on by itself, from where it stopped, as soon as this tab is on screen again. Keep it visible while it reads (not minimised; a window completely covered by others can count as hidden too).";

export const KIND_LABEL: Record<SweepKind, string> = { currents: 'Ocean currents', visibility: 'Visibility', wind100: '100 m wind', sea: 'Sea (wind waves)' };

freeForecast.subscribe(setFreeFill);

/** Status text for the Weather tab */
export const weatherStatus = writable('');
export const weatherBusy = writable(false);
/** Settings for getting the weather (owner, 2026-11-19), remembered in this browser */
export interface WxAuto {
    /** After a change of the route, get the forecast for the changed legs by itself */
    followRoute: boolean;
    /** Get it again every 3 hours (route and area) while the plugin is open */
    every3h: boolean;
    /** Sea, currents and visibility downloaded with the forecast (Open-Meteo; works with the tab hidden) */
    extras: boolean;
    /** Also read Windy's own map (sea, currents, visibility) after the forecast: needs the tab on screen */
    readMap: boolean;
    /** The area for the weather (north / south latitude, west / east longitude) */
    area: WxArea | null;
    areaOn: boolean;
}
const AUTO_KEY = 'windy-plugin-passage-plan:wxauto';
const AUTO_DEFAULTS: WxAuto = { followRoute: true, every3h: true, extras: true, readMap: false, area: null, areaOn: false };
function loadAuto(): WxAuto {
    try {
        return { ...AUTO_DEFAULTS, ...JSON.parse(localStorage.getItem(AUTO_KEY) ?? '{}') };
    } catch {
        return { ...AUTO_DEFAULTS };
    }
}
export const wxAuto = writable<WxAuto>(loadAuto());
wxAuto.subscribe(v => {
    try {
        localStorage.setItem(AUTO_KEY, JSON.stringify(v));
    } catch {
        /* not remembered */
    }
});
/** Read Windy's map after the forecast (was "currents and visibility after the forecast"; off by default from 2026-11-19) */
export const autoLayers = {
    subscribe: (f: (v: boolean) => void) => wxAuto.subscribe(v => f(v.readMap)),
    set: (v: boolean) => wxAuto.update(a => ({ ...a, readMap: v })),
};

/** When the route forecast and the area forecast were last fetched (UTC ms) */
export const lastRouteFetch = writable<number | null>(null);
export const lastAreaFetch = writable<number | null>(null);
/** Forecasts of the area grid (kept apart from the route's, both go into the weather) */
export const areaSeries = writable<WxSeries[]>([]);
export const areaStatus = writable('');
export const areaBusy = writable(false);
export const areaStep = writable<number | null>(null);
let routeSeries: WxSeries[] = [];

let signal = { cancelled: false };
export const stopWeather = () => (signal.cancelled = true);

/** Route and area forecasts together, as the weather uses them */
function publish(): void {
    const a = get(wxAuto).areaOn ? get(areaSeries) : [];
    wxSeries.set([...routeSeries, ...a]);
}

/**
 * Forecast along the route (fresh = ask again even for points already fetched), then, if asked for, Windy's map.
 * `quiet` = by itself (after a route change or the 3-hourly refresh): no progress window, nothing on the map moves.
 */
export async function refreshWeather(opts: { fresh?: boolean; title?: string; quiet?: boolean } = {}): Promise<void> {
    if (get(weatherBusy)) return;
    weatherBusy.set(true);
    const quiet = !!opts.quiet;
    const sig = (signal = { cancelled: false });
    const auto = get(wxAuto);
    const layers = auto.readMap && !quiet;
    const steps = ['Forecast (Windy ECMWF + waves)' + (auto.extras ? ', sea, currents, visibility (Open-Meteo)' : ''), ...(layers ? [KIND_LABEL.sea, KIND_LABEL.currents, KIND_LABEL.visibility] : [])];
    if (!quiet) workStart(opts.title ?? 'Getting the weather along the route', steps, sig);
    const t0 = Date.now();
    try {
        if (opts.fresh) {
            clearForecastCache();
            clearExtraCache();
        }
        const bp0 = get(basePlan);
        // points leg by leg, so after an edit only the changed legs are fetched; inside the area its grid is used
        const area = auto.areaOn && auto.area && get(areaSeries).length && (get(areaStep) ?? 9) <= 1 ? auto.area : null;
        const all = routePointsByLeg(bp0);
        const pts = area ? all.filter(p => !inArea(area, p.lat, p.lon)) : all;
        if (!all.length) {
            weatherStatus.set('No route to fetch the forecast for.');
            return;
        }
        const step: 1 | 3 = get(tableStepH) < 3 ? 1 : 3;
        // the whole voyage, past times included (point 5): times Windy does not cover come from earlier runs kept
        // in this browser, then from Open-Meteo (free) if switched on
        const range = bp0.etd != null && bp0.eta != null ? { start: bp0.etd, end: bp0.eta } : undefined;
        if (!quiet) workProgress(steps[0], 0, pts.length);
        const key = get(planKey);
        const res = await runLimited(
            pts.map(pt => () => fetchSeries(pt.lat, pt.lon, step, range, { extra: auto.extras })),
            6,
            n => {
                weatherStatus.set(`${quiet ? 'Updating the weather for the route' : 'Fetching forecast'} ${n} / ${pts.length}…`);
                if (!quiet) workProgress(steps[0], n, pts.length);
            },
            sig,
        );
        // the route changed again while this ran: the next run (already waiting) does it
        if (quiet && key !== get(planKey)) return;
        const ok = res.filter((s): s is NonNullable<typeof s> => !!s);
        routeSeries = ok;
        publish();
        wxSweep.set(new Map());
        wxSweepKey.set('');
        wxPlanKey.set(key);
        lastRouteFetch.set(Date.now());
        const failed = res.length - ok.length;
        logEvent('weather', `Forecast: ${ok.length} of ${pts.length} points in ${((Date.now() - t0) / 1000).toFixed(1)} s${sig.cancelled ? ' (stopped)' : ''}${quiet ? ' (by itself)' : ''}`, {
            fresh: !!opts.fresh,
            quiet,
            step,
            failed,
            inArea: all.length - pts.length,
            runs: forecastInfo(ok),
            windyPlan: { ...windyCoverage },
            openMeteo: { ...omStatus },
            extras: { ...extraStatus },
        });
        if (ok.length && !quiet) {
            const bp = get(basePlan);
            recordRoutePlanned(get(planKey), bp.totalNm, bp.legs.length, pts);
        }
        const hm = new Date().toISOString().slice(11, 16);
        weatherStatus.set(
            sig.cancelled
                ? `Stopped: ${ok.length} points fetched.`
                : `${quiet ? 'Updated by itself' : 'Done'} at ${hm} UTC: ${ok.length} forecast points along the route${all.length > pts.length ? ` (+ ${all.length - pts.length} from the area)` : ''}${failed ? `, ${failed} failed` : ''}.`,
        );
        if (layers && !sig.cancelled && ok.length) {
            const done: string[] = [];
            for (const kind of ['sea', 'currents', 'visibility'] as SweepKind[]) {
                if (sig.cancelled) break;
                done.push(await readLayerNow(kind));
            }
            weatherStatus.set(`Done: ${ok.length} forecast points. ${done.join(' ')}`);
        }
    } catch (err) {
        weatherStatus.set(`Could not get the forecast: ${(err as Error).message}`);
        logEvent('error', `Forecast failed: ${(err as Error).message}`);
    } finally {
        weatherBusy.set(false);
        if (!quiet) workEnd();
    }
}

/** Forecast for the area grid (owner, 2026-11-19: north / south latitude, east / west longitude, "Get weather") */
export async function refreshArea(opts: { fresh?: boolean; quiet?: boolean } = {}): Promise<void> {
    const a = get(wxAuto);
    const g = a.area ? areaGrid(a.area) : null;
    if (!a.area || !g) {
        areaStatus.set('Check the area: north must be north of south, latitudes −90…90, longitudes −180…180, at most about 50° × 50°.');
        return;
    }
    if (get(areaBusy)) return;
    areaBusy.set(true);
    const sig = { cancelled: false };
    if (!opts.quiet) workStart('Getting the weather for the area', [`Forecast at ${g.points.length} points, ${g.step}° apart`], sig);
    const t0 = Date.now();
    try {
        if (opts.fresh) clearExtraCache();
        const res = await runLimited(
            g.points.map(p => () => fetchSeries(p.lat, p.lon, 3, undefined, { extra: a.extras })),
            6,
            n => {
                areaStatus.set(`Area: ${n} / ${g.points.length}…`);
                if (!opts.quiet) workProgress(`Forecast at ${g.points.length} points, ${g.step}° apart`, n, g.points.length);
            },
            sig,
        );
        const ok = res.filter((s): s is NonNullable<typeof s> => !!s);
        areaSeries.set(ok);
        areaStep.set(g.step);
        lastAreaFetch.set(Date.now());
        if (!get(wxAuto).areaOn) wxAuto.update(x => ({ ...x, areaOn: true }));
        publish();
        // the route's weather may now come from the area: count it as up to date if it was
        if (routeSeries.length || !get(route).waypoints.length) wxPlanKey.set(get(planKey));
        const hm = new Date().toISOString().slice(11, 16);
        areaStatus.set(`${opts.quiet ? 'Updated by itself' : 'Done'} at ${hm} UTC: ${ok.length} of ${g.points.length} points, every ${g.step}°${ok.length < g.points.length ? ` (${g.points.length - ok.length} not answered)` : ''}.`);
        logEvent('weather', `Area forecast: ${ok.length} of ${g.points.length} points (${g.step}°) in ${((Date.now() - t0) / 1000).toFixed(1)} s${opts.quiet ? ' (by itself)' : ''}`, { area: a.area, extras: { ...extraStatus } });
        if (get(route).waypoints.length >= 2 && !opts.quiet) refreshWeather({ quiet: true }).catch(() => {});
    } catch (err) {
        areaStatus.set(`Could not get the area's weather: ${(err as Error).message}`);
        logEvent('error', `Area forecast failed: ${(err as Error).message}`);
    } finally {
        areaBusy.set(false);
        if (!opts.quiet) workEnd();
    }
}

/** Switch the area's weather off (its forecasts stay in memory until the plugin closes) */
export function areaOff(): void {
    wxAuto.update(x => ({ ...x, areaOn: false }));
    publish();
}

// ---- by itself: after a change of the route, and every 3 hours ----
let routeTimer: ReturnType<typeof setTimeout> | null = null;
let clock: ReturnType<typeof setInterval> | null = null;
let unsubs: (() => void)[] = [];
const THREE_H = 3 * 3600e3;

/** Start the automatic updates (plugin open) */
export function startAutoWeather(): void {
    stopAutoWeather();
    let first = true;
    unsubs.push(
        basePlan.subscribe(() => {
            if (first) {
                first = false;
                return;
            }
            if (!get(wxAuto).followRoute || get(route).waypoints.length < 2) return;
            if (routeTimer) clearTimeout(routeTimer);
            // wait until the editing pauses (dragging a waypoint changes the route many times a second)
            routeTimer = setTimeout(() => {
                routeTimer = null;
                if (get(wxPlanKey) !== get(planKey) || !routeSeries.length) refreshWeather({ quiet: true }).catch(() => {});
            }, 2500);
        }),
    );
    // every few minutes: anything older than 3 hours is fetched again (timers in a hidden tab slow down but still run)
    clock = setInterval(() => {
        const a = get(wxAuto);
        if (!a.every3h) return;
        const now = Date.now();
        const r = get(lastRouteFetch);
        const ar = get(lastAreaFetch);
        if (a.areaOn && a.area && ar != null && now - ar > THREE_H && !get(areaBusy)) refreshArea({ fresh: true, quiet: true }).catch(() => {});
        else if (r != null && now - r > THREE_H && get(route).waypoints.length >= 2) refreshWeather({ fresh: true, quiet: true }).catch(() => {});
    }, 5 * 60e3);
    // on opening: the route's forecast from memory / the web without a click, the area's too
    const a = get(wxAuto);
    if (a.areaOn && a.area) setTimeout(() => refreshArea({ quiet: true }).catch(() => {}), 1500);
    else if (a.followRoute && get(route).waypoints.length >= 2 && !get(wxSeries).length) setTimeout(() => refreshWeather({ quiet: true }).catch(() => {}), 1500);
}
export function stopAutoWeather(): void {
    unsubs.forEach(u => u());
    unsubs = [];
    if (routeTimer) clearTimeout(routeTimer);
    routeTimer = null;
    if (clock) clearInterval(clock);
    clock = null;
}

/** One layer on its own (button in the Weather tab), with its own progress window. */
export async function readLayer(kind: SweepKind): Promise<void> {
    if (get(weatherBusy)) return;
    weatherBusy.set(true);
    signal = { cancelled: false };
    workStart(`Reading ${KIND_LABEL[kind].toLowerCase()} from Windy's map`, [KIND_LABEL[kind]], signal);
    try {
        weatherStatus.set(await readLayerNow(kind));
    } finally {
        weatherBusy.set(false);
        workEnd();
    }
}

async function readLayerNow(kind: SweepKind): Promise<string> {
    const rows = buildRows(get(route), get(plan), get(vessel), get(thresholds), get(tableStepH), get(wxSeries), get(wxSweepValid));
    const pts = rows.filter(r => r.wx).map(r => ({ t: r.time, pos: r.pos }));
    if (!pts.length) return `${KIND_LABEL[kind]}: no forecast rows to read for.`;
    workProgress(KIND_LABEL[kind], 0, pts.length);
    try {
        const res = await sweep(
            kind,
            pts,
            n => {
                weatherStatus.set(`Reading ${KIND_LABEL[kind].toLowerCase()} ${n} / ${pts.length}…`);
                workProgress(KIND_LABEL[kind], n, pts.length);
            },
            signal,
            paused => {
                workPaused(paused ? PAUSED : null);
                if (paused) {
                    weatherStatus.set(`Reading ${KIND_LABEL[kind].toLowerCase()}: paused while the Windy tab is hidden or minimised.`);
                    logEvent('layer', `${KIND_LABEL[kind]}: paused (tab hidden or window minimised)`);
                } else logEvent('layer', `${KIND_LABEL[kind]}: carrying on (tab visible again)`);
            },
            (pos, t) => weatherAt(get(wxSeries), pos, t),
        );
        const key = get(sweepKey);
        const fresh = get(wxSweepKey) !== key;
        wxSweep.update(m => {
            const next = new Map(fresh ? [] : m);
            for (const [t, v] of res) next.set(t, { ...(next.get(t) ?? {}), ...v });
            return next;
        });
        wxSweepKey.set(key);
        if (kind === 'currents' && [...res.values()].some(v => v.currentKn != null) && !get(route).useCurrents) {
            updateRoute(r => (r.useCurrents = true));
        }
        const rep = lastSweepReport[kind];
        logEvent('layer', `${KIND_LABEL[kind]}: read at ${res.size} of ${pts.length} times`, rep);
        if (kind === 'sea' && !res.size)
            return `Sea (wind waves): Windy's wave readings could not be matched with the forecast (Windy's answer: ${rep?.sample ?? '?'}), so the sea stays worked out from SWH and the swells. Please send a screenshot of this line via "Report a problem".`;
        return res.size
            ? `${KIND_LABEL[kind]}: read at ${res.size} of ${pts.length} times.`
            : `${KIND_LABEL[kind]}: NOTHING could be read (Windy's answer: ${rep?.sample ?? '?'}). Please send a screenshot of this line via "Report a problem".`;
    } catch (err) {
        logEvent('error', `${KIND_LABEL[kind]}: ${(err as Error).message}`);
        return `${KIND_LABEL[kind]}: could not read the layer (${(err as Error).message}).`;
    }
}
