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
import { clearExtraCache, clearForecastCache, deviceOffline, extraStatus, fetchSeries, latestRun, lastSweepReport, memoryUse, offlineUse, omStatus, resetOfflineUse, runLimited, setFreeFill, sweep, windyCoverage, type SweepKind } from './forecast';
import { IS_APP } from '../lib/appMode';
import { fmtRun } from '../lib/weather';
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
/**
 * Every forecast fetched for routes in this session, by position (owner, 2026-11-22: "weather once downloaded it should
 * not redownload unless user ask for it or new weather data is availble ... it has to be almost instant"). A route change
 * uses these at once; only points farther than COVER_NM from any of them (and outside the area) are fetched.
 */
const pool = new Map<string, WxSeries>();
const pkey = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;
/** A forecast point this close (nm) to a route point is good enough for it (forecast models are 9–28 km grids) */
export const COVER_NM = 25;
const nmBetween = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const dLat = a.lat - b.lat;
    const dLon = ((((a.lon - b.lon + 540) % 360) + 360) % 360 - 180) * Math.cos((a.lat * Math.PI) / 180);
    return Math.hypot(dLat, dLon) * 60;
};
/** Distance to the nearest forecast already downloaded (route points and area), nm */
function coveredNm(p: { lat: number; lon: number }): number {
    let best = Infinity;
    // a point whose wave forecast failed does not count: it is asked for again
    for (const s of pool.values()) if (!s.wavesFailed || (waveTries.get(pkey(s.lat, s.lon)) ?? 0) >= WAVE_TRIES) best = Math.min(best, nmBetween(p, s));
    if (get(wxAuto).areaOn) for (const s of get(areaSeries)) if (!s.wavesFailed) best = Math.min(best, nmBetween(p, s));
    return best;
}

/** Points whose Windy wave forecast failed are asked for again by themselves, up to WAVE_TRIES times, a while apart */
const WAVE_TRIES = 3;
const WAVE_RETRY_MS = 90_000;
const waveTries = new Map<string, number>();
let waveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleWaveRetry(): void {
    if (waveTimer) return;
    const due = [...pool.values()].filter(s => s.wavesFailed && (waveTries.get(pkey(s.lat, s.lon)) ?? 0) < WAVE_TRIES);
    if (!due.length) return;
    waveTimer = setTimeout(() => {
        waveTimer = null;
        if (get(weatherBusy)) return scheduleWaveRetry();
        const pts = [...pool.values()].filter(s => s.wavesFailed && (waveTries.get(pkey(s.lat, s.lon)) ?? 0) < WAVE_TRIES).map(s => ({ lat: s.lat, lon: s.lon }));
        if (!pts.length) return;
        for (const p of pts) waveTries.set(pkey(p.lat, p.lon), (waveTries.get(pkey(p.lat, p.lon)) ?? 0) + 1);
        logEvent('weather', `${WHO}'s waves missing at ${pts.length} point(s): asking again`, { pts });
        void refreshWeather({ quiet: true, only: pts, retryWaves: true });
    }, WAVE_RETRY_MS);
}
/** Route points with no downloaded forecast near them */
export function missingPoints(): { lat: number; lon: number }[] {
    return routePointsByLeg(get(basePlan)).filter(p => coveredNm(p) > COVER_NM);
}

/** Requests at once: in the app many, so the app's Open-Meteo client can put them into a few requests (it keeps to the limits) */
const PARALLEL = IS_APP ? 60 : 6;
/** Who the forecast comes from, for the status lines */
const WHO = IS_APP ? 'Open-Meteo' : 'Windy';
/** Put before the forecast's model name on screen and in files ("Windy ECMWF …"; the app's names already say Open-Meteo) */
export const WX_BY = IS_APP ? '' : 'Windy ';

/** App: the note when the forecast kept on the phone was used because the download failed (galenea-app: offline) */
export function offlineNote(): string {
    if (!IS_APP || (!offlineUse.points && !offlineUse.none)) return '';
    const off = deviceOffline() || /internet/i.test(offlineUse.reason);
    const head = off ? 'No internet' : offlineUse.reason ? `Could not download: ${offlineUse.reason.replace(/\.$/, '')}` : 'Could not download (Open-Meteo did not answer)';
    const kept = offlineUse.points
        ? `using the forecast downloaded ${offlineUse.oldest ? fmtRun(offlineUse.oldest) : 'earlier'}${offlineUse.run ? ` (run ${fmtRun(offlineUse.run)})` : ''} for ${offlineUse.points} point${offlineUse.points === 1 ? '' : 's'}`
        : '';
    const none = offlineUse.none ? `${offlineUse.none} point${offlineUse.none === 1 ? '' : 's'} with no forecast kept on this phone` : '';
    return `${head}: ${[kept, none].filter(Boolean).join('; ')}. ${off ? 'It downloads again by itself when the internet is back.' : 'It downloads again by itself later.'}`;
}
/** App: a forecast kept on the phone is in use, so get the new one when the internet is back */
let usedKept = false;
/** App: the "no internet / could not download" note while the kept forecast is shown ('' when the forecast is fresh) */
export const wxOffline = writable('');
/** App: the note from the forecasts on screen, when the phone says it has gone offline */
function shownOfflineNote(): string {
    const ss = get(wxSeries);
    if (!ss.length) return 'No internet: no forecast downloaded yet for this route. It downloads by itself when the internet is back.';
    const oldest = Math.min(...ss.map(s => s.fetchedAt ?? Infinity));
    const run = ss.find(s => s.refTime)?.refTime ?? ss.find(s => s.wavesRefTime)?.wavesRefTime;
    return `No internet: using the forecast downloaded ${isFinite(oldest) ? fmtRun(oldest) : 'earlier'}${run ? ` (run ${fmtRun(run)})` : ''}. It downloads again by itself when the internet is back.`;
}

let signal = { cancelled: false };
export const stopWeather = () => (signal.cancelled = true);

/** Route and area forecasts together, as the weather uses them */
function publish(): void {
    const a = get(wxAuto).areaOn ? get(areaSeries) : [];
    wxSeries.set([...pool.values(), ...a]);
}

/**
 * Forecast along the route (fresh = ask again even for points already fetched), then, if asked for, Windy's map.
 * `quiet` = by itself (after a route change or the 3-hourly refresh): no progress window, nothing on the map moves.
 */
export async function refreshWeather(opts: { fresh?: boolean; title?: string; quiet?: boolean; only?: { lat: number; lon: number }[]; retryWaves?: boolean } = {}): Promise<void> {
    if (get(weatherBusy)) return;
    weatherBusy.set(true);
    const quiet = !!opts.quiet;
    const sig = (signal = { cancelled: false });
    const auto = get(wxAuto);
    // app: no Windy map to read (sea, currents and visibility come with the Open-Meteo download)
    const layers = auto.readMap && !quiet && !IS_APP;
    const steps = [(IS_APP ? 'Forecast (Open-Meteo: ECMWF IFS, waves, sea, currents, visibility)' : 'Forecast (Windy ECMWF + waves)' + (auto.extras ? ', sea, currents, visibility (Open-Meteo)' : '')), ...(layers ? [KIND_LABEL.sea, KIND_LABEL.currents, KIND_LABEL.visibility] : [])];
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
        const pts = opts.only ?? (area ? all.filter(p => !inArea(area, p.lat, p.lon)) : all);
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
        resetOfflineUse();
        const res = await runLimited(
            pts.map(pt => () => fetchSeries(pt.lat, pt.lon, step, range, { extra: auto.extras })),
            PARALLEL,
            n => {
                weatherStatus.set(`${quiet ? 'Updating the weather for the route' : 'Fetching forecast'} ${n} / ${pts.length}…`);
                if (!quiet) workProgress(steps[0], n, pts.length);
            },
            sig,
        );
        const ok = res.filter((s): s is NonNullable<typeof s> => !!s);
        // kept (a fresh fetch replaces the older forecast for the same point); the screens use them at once
        for (const s of ok) pool.set(pkey(s.lat, s.lon), s);
        publish();
        const noWaves = ok.filter(s => s.wavesFailed).length;
        if (!opts.only) {
            wxSweep.set(new Map());
            wxSweepKey.set('');
        }
        wxPlanKey.set(get(planKey));
        void key;
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
            (sig.cancelled
                ? `Stopped: ${ok.length} points fetched.`
                : opts.only
                  ? opts.retryWaves
                      ? `Updated at ${hm} UTC: ${WHO}'s waves asked for again at ${ok.length} point${ok.length === 1 ? '' : 's'}${noWaves ? `, still missing at ${noWaves} (waves from the next point or Open-Meteo there)` : ', all there now'}.`
                      : `Updated at ${hm} UTC: ${ok.length} new forecast point${ok.length === 1 ? '' : 's'} for the changed part of the route; the rest from the forecast already downloaded.${failed ? ` ${failed} failed.` : ''}`
                  : `${quiet ? 'Updated by itself' : 'Done'} at ${hm} UTC: ${ok.length} forecast points along the route${all.length > pts.length ? ` (+ ${all.length - pts.length} from the area)` : ''}${failed ? `, ${failed} failed` : ''}.`) + (noWaves && !opts.retryWaves ? ` ${WHO}'s waves missing at ${noWaves} point${noWaves === 1 ? '' : 's'}: asked for again in a minute or two; meanwhile from the next point or Open-Meteo.` : ''));
        const off = offlineNote();
        if (off) {
            usedKept = true;
            weatherStatus.set(off);
            wxOffline.set(off);
            logEvent('weather', off);
        } else if (IS_APP && ok.length && memoryUse.points >= ok.length && !sig.cancelled) {
            // nothing was downloaded: say so instead of "updated"
            weatherStatus.set(`Weather from the forecast already downloaded ${memoryUse.oldest ? fmtRun(memoryUse.oldest) : 'earlier'}: nothing new to download.`);
            wxOffline.set(deviceOffline() ? shownOfflineNote() : '');
        } else if (IS_APP && ok.length) wxOffline.set('');
        scheduleWaveRetry();
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
        areaStatus.set('Check the area: north must be north of south, latitudes −90…90, longitudes −180…180, at most about 110° × 110° (6° apart, 400 points).');
        return;
    }
    if (get(areaBusy)) return;
    areaBusy.set(true);
    const sig = { cancelled: false };
    if (!opts.quiet) workStart('Getting the weather for the area', [`Forecast at ${g.points.length} points, ${g.step}° apart`], sig);
    const t0 = Date.now();
    try {
        if (opts.fresh) clearExtraCache();
        resetOfflineUse();
        const res = await runLimited(
            g.points.map(p => () => fetchSeries(p.lat, p.lon, 3, undefined, { extra: a.extras })),
            PARALLEL,
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
        // the route's weather may now come from the area: shown at once
        wxPlanKey.set(get(planKey));
        const hm = new Date().toISOString().slice(11, 16);
        areaStatus.set(`${opts.quiet ? 'Updated by itself' : 'Done'} at ${hm} UTC: ${ok.length} of ${g.points.length} points, every ${g.step}°${ok.length < g.points.length ? ` (${g.points.length - ok.length} not answered)` : ''}.`);
        const offA = offlineNote();
        if (offA) {
            usedKept = true;
            areaStatus.set(`Area: ${offA}`);
        } else if (IS_APP && ok.length && memoryUse.points >= ok.length) areaStatus.set(`Area: weather from the forecast already downloaded ${memoryUse.oldest ? fmtRun(memoryUse.oldest) : 'earlier'}: nothing new to download.`);
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

// ---- by itself: after a change of the route, and when Windy has a newer forecast run ----
let routeTimer: ReturnType<typeof setTimeout> | null = null;
let clock: ReturnType<typeof setInterval> | null = null;
let unsubs: (() => void)[] = [];
/** Last time we asked Windy whether a newer run is out */
let lastRunCheck = 0;
const HOUR = 3600e3;

/** The newest forecast run (ms) among the forecasts kept */
function newestRun(): number {
    let t = 0;
    for (const s of [...pool.values(), ...(get(wxAuto).areaOn ? get(areaSeries) : [])]) {
        const r = s.refTime ? Date.parse(String(s.refTime).replace(' ', 'T')) : NaN;
        if (isFinite(r)) t = Math.max(t, r);
    }
    return t;
}

/** After a route change: the weather from what is already downloaded, at once; only uncovered points are fetched */
function onRouteChange(): void {
    if (get(route).waypoints.length < 2) return;
    const have = pool.size > 0 || (get(wxAuto).areaOn && get(areaSeries).length > 0);
    if (have) {
        // instant: every screen uses the kept forecasts (nearest point) for the new route
        wxPlanKey.set(get(planKey));
        publish();
    }
    if (!get(wxAuto).followRoute) return;
    if (routeTimer) clearTimeout(routeTimer);
    // wait until the editing pauses (dragging a waypoint changes the route many times a second)
    routeTimer = setTimeout(() => {
        routeTimer = null;
        if (!have) {
            refreshWeather({ quiet: true }).catch(() => {});
            return;
        }
        const miss = missingPoints();
        if (miss.length) {
            weatherStatus.set(`Weather shown from the forecast already downloaded; getting ${miss.length} new point${miss.length === 1 ? '' : 's'} for the new part of the route…`);
            refreshWeather({ quiet: true, only: miss }).catch(() => {});
        } else weatherStatus.set(`Weather shown from the forecast already downloaded (fetched ${hm(get(lastRouteFetch) ?? Date.now())} UTC): nothing new to download.`);
    }, 1200);
}
const hm = (t: number) => new Date(t).toISOString().slice(11, 16);

/** Ask Windy (one point, not from memory) whether a newer forecast run is out; if so, fetch the route and area again */
async function checkNewRun(): Promise<void> {
    lastRunCheck = Date.now();
    const s0 = pool.values().next().value as WxSeries | undefined;
    const have = newestRun();
    if (!s0 || !have) return;
    try {
        const run = await latestRun(s0.lat, s0.lon);
        if (run && run > have + 60e3) {
            logEvent('weather', `Newer ${WHO} run ${new Date(run).toISOString()} (had ${new Date(have).toISOString()}): fetching again`);
            if (get(wxAuto).areaOn && get(wxAuto).area) await refreshArea({ fresh: true, quiet: true });
            await refreshWeather({ fresh: true, quiet: true });
        }
    } catch {
        /* offline or Windy busy: try again next hour */
    }
}

/** Start the automatic updates (plugin open) */
export function startAutoWeather(): void {
    stopAutoWeather();
    let first = true;
    let lastKey = get(planKey);
    unsubs.push(
        basePlan.subscribe(() => {
            if (first) {
                first = false;
                return;
            }
            // only a change of the track matters (ETD, speeds and stops need no new forecast)
            const k = get(planKey);
            if (k === lastKey && get(wxPlanKey) === k) return;
            lastKey = k;
            onRouteChange();
        }),
    );
    // every few minutes: once an hour, ask whether Windy has a newer run (timers in a hidden tab slow down but still run)
    clock = setInterval(() => {
        if (!get(wxAuto).every3h || Date.now() - lastRunCheck < HOUR || get(weatherBusy) || get(areaBusy)) return;
        checkNewRun().catch(() => {});
    }, 5 * 60e3);
    // app: when the internet comes back after the kept forecast was used, download again (galenea-app: offline)
    if (IS_APP && typeof window !== 'undefined') {
        const back = () => {
            if (!usedKept) return;
            usedKept = false;
            logEvent('weather', 'Internet back: getting the forecast again');
            weatherStatus.set('Internet back: getting the latest forecast…');
            setTimeout(() => {
                const w = get(wxAuto);
                (w.areaOn && w.area ? refreshArea({ fresh: true, quiet: true }) : Promise.resolve())
                    .then(() => refreshWeather({ fresh: true, quiet: true }))
                    .catch(() => {});
            }, 2000);
        };
        window.addEventListener('online', back);
        unsubs.push(() => window.removeEventListener('online', back));
        // gone offline: say so at once (the forecast on screen stays, from the phone's memory)
        const gone = () => {
            usedKept = true;
            const n = shownOfflineNote();
            wxOffline.set(n);
            weatherStatus.set(n);
            logEvent('weather', 'No internet: the kept forecast is used');
        };
        window.addEventListener('offline', gone);
        unsubs.push(() => window.removeEventListener('offline', gone));
        if (deviceOffline()) setTimeout(gone, 0);
        // a phone can come back online without the browser noticing: check now and then while a kept forecast is in use
        const poll = setInterval(() => {
            if (usedKept && !deviceOffline() && !get(weatherBusy) && !get(areaBusy)) back();
        }, 5 * 60e3);
        unsubs.push(() => clearInterval(poll));
    }
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
    if (waveTimer) clearTimeout(waveTimer);
    waveTimer = null;
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
