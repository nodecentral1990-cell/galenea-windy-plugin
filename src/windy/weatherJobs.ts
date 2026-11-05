// Getting the weather for the Route tab's route: point forecasts along the route, then (optionally)
// currents and visibility read from Windy's map layers. Shared by the Weather tab and the voyage
// panel (after a position update), with a progress window while it runs.

import { get, writable } from 'svelte/store';

import { buildRows, routePoints, weatherAt } from '../lib/weather';
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
import { clearForecastCache, fetchSeries, lastSweepReport, omStatus, runLimited, setFreeFill, sweep, windyCoverage, type SweepKind } from './forecast';
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
/** Read currents and visibility after the forecast */
export const autoLayers = writable(true);

let signal = { cancelled: false };
export const stopWeather = () => (signal.cancelled = true);

/** Forecast along the route (fresh = ask Windy again even for points already fetched), then the layers. */
export async function refreshWeather(opts: { fresh?: boolean; title?: string } = {}): Promise<void> {
    if (get(weatherBusy)) return;
    weatherBusy.set(true);
    signal = { cancelled: false };
    const layers = get(autoLayers);
    const steps = ['Forecast (Windy ECMWF + waves)', ...(layers ? [KIND_LABEL.sea, KIND_LABEL.currents, KIND_LABEL.visibility] : [])];
    workStart(opts.title ?? 'Getting the weather along the route', steps, signal);
    const t0 = Date.now();
    try {
        if (opts.fresh) clearForecastCache();
        // Forecast points along the whole route by distance; each covers the whole forecast period,
        // so later changes of ETD, speed or fixed ETAs need no new fetch.
        const pts = routePoints(get(basePlan));
        if (!pts.length) {
            weatherStatus.set('No route to fetch the forecast for.');
            return;
        }
        const step: 1 | 3 = get(tableStepH) < 3 ? 1 : 3;
        const bp0 = get(basePlan);
        // the whole voyage, past times included (point 5): times Windy does not cover come from earlier runs kept
        // in this browser, then from Open-Meteo (free) if switched on
        const range = bp0.etd != null && bp0.eta != null ? { start: bp0.etd, end: bp0.eta } : undefined;
        workProgress(steps[0], 0, pts.length);
        const res = await runLimited(
            pts.map(pt => () => fetchSeries(pt.lat, pt.lon, step, range)),
            6,
            n => {
                weatherStatus.set(`Fetching forecast ${n} / ${pts.length}…`);
                workProgress(steps[0], n, pts.length);
            },
            signal,
        );
        const ok = res.filter((s): s is NonNullable<typeof s> => !!s);
        wxSeries.set(ok);
        wxSweep.set(new Map());
        wxSweepKey.set('');
        wxPlanKey.set(get(planKey));
        const failed = res.length - ok.length;
        logEvent('weather', `Forecast: ${ok.length} of ${pts.length} points in ${((Date.now() - t0) / 1000).toFixed(1)} s${signal.cancelled ? ' (stopped)' : ''}`, {
            fresh: !!opts.fresh,
            step,
            failed,
            runs: forecastInfo(ok),
            windyPlan: { ...windyCoverage },
            openMeteo: { ...omStatus },
        });
        if (ok.length) {
            const bp = get(basePlan);
            recordRoutePlanned(get(planKey), bp.totalNm, bp.legs.length, pts);
        }
        weatherStatus.set(signal.cancelled ? `Stopped: ${ok.length} points fetched.` : `Done: ${ok.length} forecast points along the route${failed ? `, ${failed} failed` : ''}.`);
        if (layers && !signal.cancelled && ok.length) {
            const done: string[] = [];
            for (const kind of ['sea', 'currents', 'visibility'] as SweepKind[]) {
                if (signal.cancelled) break;
                done.push(await readLayerNow(kind));
            }
            weatherStatus.set(`Done: ${ok.length} forecast points. ${done.join(' ')}`);
        }
    } catch (err) {
        weatherStatus.set(`Could not get the forecast: ${(err as Error).message}`);
        logEvent('error', `Forecast failed: ${(err as Error).message}`);
    } finally {
        weatherBusy.set(false);
        workEnd();
    }
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
