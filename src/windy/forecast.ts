// Calls to Windy for weather along the route.
// Point forecasts: ECMWF (wind, gust, pressure, precipitation, weather symbol) and
// ECMWF-WAM (waves, swell 1, swell 2) via @windy/fetch getPointForecastData.
// Map-layer "sweep" (currents, 100 m wind): steps Windy's time slider and reads the value
// under each ship position. EXPERIMENTAL: written from Windy's type files, not yet tested
// inside Windy.

import { getPointForecastData } from '@windy/fetch';
import { getLatLonInterpolator } from '@windy/interpolator';
import bcast from '@windy/broadcast';
import store from '@windy/store';
import { map } from '@windy/map';

import { fmtRun, MS_TO_KN, type WxPoint, type WxSeries } from '../lib/weather';
import { calibrateWaveReading, readWave, type WaveReading } from '../lib/waveRead';
import { idbGet, idbPrune, idbSet } from '../lib/idbCache';
import { dropIndices, fakeIndices, gaps, HISTORY_KEEP_MS, omToSeries, omUrls, partsOf, spliceSeries, stepOf, validSpan, withHistory } from '../lib/seriesMerge';
import type { ShipPosition } from '../lib/model';

type Arr = (number | null)[];
type Payload = { data?: { data?: Record<string, unknown>; summary?: unknown; header?: { refTime?: string; update?: string; model?: string; sst?: number; daysAvail?: number } } };

/** Sea temperature from a forecast header: kelvin (as documented) or °C */
const sstOf = (...v: (number | undefined)[]): number | null => {
    const k = v.find(x => typeof x === 'number' && isFinite(x));
    return k == null ? null : k > 150 ? k - 273.15 : k;
};

const arr = (d: Record<string, unknown> | undefined, k: string): Arr | undefined => (Array.isArray(d?.[k]) ? (d?.[k] as Arr) : undefined);

/**
 * Days of forecast to ask Windy for. Windy gives each user what their plan allows (Premium about 10–15 days,
 * free users about 5–7; Windy's type files, checked 2026-11-02); asking for more does no harm.
 */
const FORECAST_DAYS = 15;

const cache = new Map<string, Promise<WxSeries>>();
/** Forecasts are also kept in the browser for this long, so reopening the plugin or Windy needs no new fetch (2026-11-02) */
const KEEP_MS = 3 * 3600e3;
const IDB_PREFIX = 'fc:';
/** Past weather memory: each Windy forecast fetched is kept (45 days) so earlier times stay visible after a new run */
const HIST_PREFIX = 'hist:';
const HIST_INDEX = 'histidx';
let skipStored = false;
let pruned = false;

/** Fill the times Windy does not cover (past, or beyond the user's Windy plan) from Open-Meteo, free (2026-11-02) */
let freeFill = true;
export function setFreeFill(on: boolean): void {
    freeFill = on;
}

/** Forget fetched forecasts so the next fetch gets Windy's latest model run (also the ones kept in the browser). */
export function clearForecastCache(): void {
    cache.clear();
    omCache.clear();
    skipStored = true;
}

/** What the last fetches told about the user's Windy plan (for the weather tab) */
export const windyCoverage: { stepH: number | null; days: number | null; fakeDropped: number; daysAvail: number | null } = { stepH: null, days: null, fakeDropped: 0, daysAvail: null };

/**
 * Point forecast at a position (cached for this session, rounded to 0.01°; kept in the browser for 3 h). With `range`
 * (ms), times in it that Windy does not cover are filled from Open-Meteo (if switched on), and if Windy fails
 * altogether Open-Meteo stands in.
 */
export function fetchSeries(lat: number, lon: number, step: 1 | 3 = 1, range?: { start: number; end: number }): Promise<WxSeries> {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)},${step}`;
    let p = cache.get(key);
    if (!p) {
        p = loadKept(key, lat, lon, step);
        p.catch(() => cache.delete(key));
        cache.set(key, p);
    }
    if (!range || !freeFill) return p;
    return p.then(
        s => fillGaps(s, range),
        async err => {
            const om = await openMeteo(lat, lon, range).catch(() => null);
            if (!om) throw err;
            return { ...om, parts: partsOf(om, 'openmeteo').map(x => ({ ...x, label: omLabel[x.group] })) };
        },
    );
}

async function loadKept(key: string, lat: number, lon: number, step: 1 | 3): Promise<WxSeries> {
    if (!pruned) {
        pruned = true;
        idbPrune(IDB_PREFIX, KEEP_MS).catch(() => {});
        idbPrune(HIST_PREFIX, HISTORY_KEEP_MS).catch(() => {});
    }
    if (!skipStored) {
        const kept = await idbGet<WxSeries>(IDB_PREFIX + key).catch(() => undefined);
        if (kept && kept.fetchedAt && Date.now() - kept.fetchedAt < KEEP_MS && kept.ts?.length) return kept;
    }
    const fresh = await loadSeries(lat, lon, step);
    const s = await remember(fresh).catch(() => fresh);
    idbSet(IDB_PREFIX + key, s).catch(() => {});
    return s;
}

type HistEntry = { key: string; lat: number; lon: number; at: number };
const HIST_NEAR_NM = 30;

/** The new Windy forecast with the earlier times from the forecast kept nearest to it (within 30 nm), then kept itself */
async function remember(fresh: WxSeries): Promise<WxSeries> {
    const idx = ((await idbGet<HistEntry[]>(HIST_INDEX)) ?? []).filter(e => Date.now() - e.at < HISTORY_KEEP_MS);
    let near: HistEntry | null = null;
    let best = Infinity;
    for (const e of idx) {
        const d = Math.hypot(e.lat - fresh.lat, ((((e.lon - fresh.lon + 540) % 360) - 180) * Math.cos((fresh.lat * Math.PI) / 180))) * 60;
        if (d < best && d <= HIST_NEAR_NM) {
            best = d;
            near = e;
        }
    }
    const kept = near ? await idbGet<WxSeries>(HIST_PREFIX + near.key) : undefined;
    const merged = withHistory(fresh, kept, k => ({ air: `Windy ${k.model} run ${fmtRun(k.refTime)} (kept in this browser)`, waves: `Windy ${k.wavesModel ?? k.model} run ${fmtRun(k.wavesRefTime)} (kept in this browser)` }));
    // keep at most 45 days back
    const key = near?.key ?? `${fresh.lat.toFixed(2)},${fresh.lon.toFixed(2)}`;
    await idbSet(HIST_PREFIX + key, merged);
    const rest = idx.filter(e => e.key !== key);
    rest.push({ key, lat: fresh.lat, lon: fresh.lon, at: Date.now() });
    await idbSet(HIST_INDEX, rest.slice(-3000));
    return merged;
}

async function loadSeries(lat: number, lon: number, step: 1 | 3): Promise<WxSeries> {
    const [air, sea] = await Promise.all([
        // Without `days` Windy returns only its short default range (~4-5 days).
        getPointForecastData('ecmwf', { lat, lon, step, days: FORECAST_DAYS, extended: true }) as unknown as Promise<Payload>,
        (getPointForecastData('ecmwfWaves', { lat, lon, step, days: FORECAST_DAYS, extended: true }) as unknown as Promise<Payload>).catch(() => null),
    ]);
    // Windy pads the extended view for users without Premium with FAKE promotional days: leave them out
    const a0 = air?.data?.data;
    const w0 = sea?.data?.data;
    const fakeA = a0 ? fakeIndices(air?.data?.summary, (a0.ts as unknown[] | undefined)?.length ?? 0) : new Set<number>();
    const fakeW = w0 ? fakeIndices(sea?.data?.summary, (w0.ts as unknown[] | undefined)?.length ?? 0) : new Set<number>();
    const a = a0 ? dropIndices(a0, fakeA) : a0;
    const w = w0 ? dropIndices(w0, fakeW) : w0;
    const ts = arr(a, 'ts') as number[] | undefined;
    if (!ts || ts.length === 0) {
        throw new Error('Windy returned no forecast for this position.');
    }
    const st = stepOf(ts);
    const span = validSpan(ts, arr(a, 'wind'));
    windyCoverage.stepH = st ? Math.round(st / 3600e3) : null;
    windyCoverage.days = span ? Math.round(((span.to - Date.now()) / 86400e3) * 10) / 10 : null;
    windyCoverage.fakeDropped = Math.max(windyCoverage.fakeDropped, fakeA.size);
    windyCoverage.daysAvail = air?.data?.header?.daysAvail ?? windyCoverage.daysAvail;
    return {
        lat,
        lon,
        ts,
        model: 'ECMWF',
        refTime: air?.data?.header?.refTime ?? air?.data?.header?.update,
        fetchedAt: Date.now(),
        wind: arr(a, 'wind'),
        windGust: arr(a, 'windGust'),
        windDir: arr(a, 'windDir'),
        pressure: arr(a, 'pressure'),
        precipAmount: arr(a, 'precipAmount'),
        icon: arr(a, 'icon'),
        temp: arr(a, 'temperature') ?? arr(a, 'temp'),
        // ASSUMPTION: Windy's point forecast calls relative humidity "rh" (%); empty if it does not send it
        rh: arr(a, 'rh'),
        sstC: sstOf(sea?.data?.header?.sst, air?.data?.header?.sst),
        wavesTs: (arr(w, 'ts') as number[] | undefined) ?? [],
        waves: arr(w, 'waves'),
        wavesDir: arr(w, 'wavesDir'),
        wavesPeriod: arr(w, 'wavesPeriod'),
        wavesPower: arr(w, 'wavesPower'),
        swell1: arr(w, 'swell1'),
        swell1Dir: arr(w, 'swell1Dir'),
        swell1Period: arr(w, 'swell1Period'),
        swell2: arr(w, 'swell2'),
        swell2Dir: arr(w, 'swell2Dir'),
        swell2Period: arr(w, 'swell2Period'),
        wavesModel: w ? 'ECMWF-WAM' : undefined,
        wavesRefTime: sea?.data?.header?.refTime ?? sea?.data?.header?.update,
    };
}

// ---------- Open-Meteo: free fill for past times and beyond the user's Windy plan ----------

const omLabel = { air: 'Open-Meteo (free): ECMWF IFS 0.25°', waves: 'Open-Meteo (free): GFS Wave 0.25°' };
const omCache = new Map<string, Promise<WxSeries | null>>();
/** Last Open-Meteo problem, for the weather tab and the activity log */
export const omStatus: { used: number; failed: number; lastError: string } = { used: 0, failed: 0, lastError: '' };

async function getJson(url: string): Promise<Record<string, unknown> | null> {
    const r = await fetch(url);
    if (!r.ok) {
        let reason = `HTTP ${r.status}`;
        try {
            const j = (await r.json()) as { reason?: string };
            if (j?.reason) reason += `: ${j.reason}`;
        } catch {
            /* no body */
        }
        throw new Error(reason);
    }
    return (await r.json()) as Record<string, unknown>;
}

/** Open-Meteo forecast for a position covering `range` (past up to 92 days, ahead up to 15–16 days) */
function openMeteo(lat: number, lon: number, range: { start: number; end: number }): Promise<WxSeries | null> {
    const pastDays = range.start < Date.now() ? Math.min(92, Math.ceil((Date.now() - range.start) / 86400e3) + 1) : 0;
    const key = `${lat.toFixed(2)},${lon.toFixed(2)},${pastDays}`;
    let p = omCache.get(key);
    if (p) return p;
    p = (async () => {
        const kept = skipStored ? undefined : await idbGet<WxSeries>(`om:${key}`).catch(() => undefined);
        if (kept && kept.fetchedAt && Date.now() - kept.fetchedAt < KEEP_MS) return kept;
        const u = omUrls(lat, lon, pastDays, { air: 15, waves: 16 });
        const [airJ, wavJ] = await Promise.all([
            getJson(u.air).catch(e => {
                omStatus.lastError = `weather: ${(e as Error).message}`;
                return null;
            }),
            // the marine page also says "up to 8 days": if 16 is refused, ask for 8
            getJson(u.waves).catch(() => getJson(omUrls(lat, lon, pastDays, { air: 15, waves: 8 }).waves)).catch(e => {
                omStatus.lastError = `waves: ${(e as Error).message}`;
                return null;
            }),
        ]);
        const s = omToSeries(lat, lon, airJ as never, wavJ as never);
        if (s) {
            omStatus.used++;
            idbSet(`om:${key}`, s).catch(() => {});
        } else omStatus.failed++;
        return s;
    })();
    p.catch(() => omCache.delete(key));
    omCache.set(key, p);
    return p;
}

async function fillGaps(s: WxSeries, range: { start: number; end: number }): Promise<WxSeries> {
    const g = gaps(s, range.start, range.end);
    const now = Date.now();
    // Open-Meteo reaches back 92 days and ahead about 15–16 days
    const before = g.before && range.start > now - 92 * 86400e3;
    const after = g.after && (s.ts[s.ts.length - 1] ?? 0) < now + 15.5 * 86400e3;
    if (!before && !after) return s;
    const om = await openMeteo(s.lat, s.lon, range).catch(() => null);
    return om ? spliceSeries(s, om, 'openmeteo', omLabel) : s;
}

/** Run tasks with limited parallel requests, reporting progress. */
export async function runLimited<T>(jobs: (() => Promise<T>)[], limit: number, onProgress?: (done: number) => void, signal?: { cancelled: boolean }): Promise<(T | null)[]> {
    const out: (T | null)[] = new Array(jobs.length).fill(null);
    let next = 0;
    let done = 0;
    const worker = async () => {
        while (next < jobs.length && !signal?.cancelled) {
            const i = next++;
            try {
                out[i] = await jobs[i]();
            } catch (e) {
                console.warn('[passage-plan] forecast request failed', e);
                out[i] = null;
            }
            onProgress?.(++done);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
    return out;
}

/** End of the time range Windy currently offers for the selected product (ms), if known. */
export function forecastEnd(): number | null {
    const cal = store.get('calendar') as { end?: number } | null;
    return cal?.end ?? null;
}

export const waitRedraw = (ms = 8000): Promise<void> =>
    new Promise<void>(resolve => {
        const t = setTimeout(done, ms);
        function done() {
            clearTimeout(t);
            bcast.off('redrawFinished', done);
            resolve();
        }
        bcast.on('redrawFinished', done);
    });

/**
 * Browsers stop drawing a page whose tab is hidden or whose window is minimised (or fully covered),
 * so Windy's map does not draw and its layers cannot be read. Wait here until the page is visible.
 */
export async function whileHidden(onPause?: (paused: boolean) => void, signal?: { cancelled: boolean }): Promise<boolean> {
    if (typeof document === 'undefined' || !document.hidden) return false;
    onPause?.(true);
    await new Promise<void>(resolve => {
        const check = () => {
            if (!document.hidden || signal?.cancelled) {
                document.removeEventListener('visibilitychange', check);
                clearInterval(poll);
                resolve();
            }
        };
        document.addEventListener('visibilitychange', check);
        const poll = setInterval(check, 1000);
    });
    onPause?.(false);
    return true;
}
let hiddenSince = 0;
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.hidden && (hiddenSince = Date.now()));

export type SweepKind = 'currents' | 'wind100' | 'visibility' | 'sea';

/** What the last reading of each layer gave: values read, positions tried, and a sample of Windy's raw answer. */
export const lastSweepReport: Partial<Record<SweepKind, { read: number; tried: number; sample: string }>> = {};

/**
 * Read map-layer values at each (time, position) by moving Windy's time slider.
 * The map is zoomed to show all the positions first (the layer can only be read where it is drawn);
 * the user's layer, level, time and map view are put back afterwards.
 */
export async function sweep(
    kind: SweepKind,
    points: { t: number; pos: ShipPosition }[],
    onProgress: (done: number) => void,
    signal: { cancelled: boolean },
    onPause?: (paused: boolean) => void,
    /** For 'sea': the point forecast at a place and time (to work out how Windy's wave readings are made up) */
    reference?: (pos: { lat: number; lon: number }, t: number) => WxPoint | null,
): Promise<Map<number, Partial<WxPoint>>> {
    const saved = { overlay: store.get('overlay'), level: store.get('level'), timestamp: store.get('timestamp'), product: store.get('product') };
    const view = { center: map.getCenter(), zoom: map.getZoom() };
    const out = new Map<number, Partial<WxPoint>>();
    let sample = '';
    let tried = 0;
    try {
        if (points.length) {
            const lats = points.map(p => p.pos.lat);
            const lons = points.map(p => p.pos.lon);
            map.fitBounds(
                [
                    [Math.min(...lats), Math.min(...lons)],
                    [Math.max(...lats), Math.max(...lons)],
                ],
                { paddingTopLeft: [60, 60], paddingBottomRight: [60, 60], animate: false } as never,
            );
        }
        let reading: WaveReading | null = null;
        if (kind === 'sea' && points.length) {
            // Owner, 2026-10-28: the sea is Windy's wind-wave layer. First read Windy's SWH layer at a few
            // route positions and compare with the point forecast there, to learn which of Windy's numbers
            // are the height, the direction and the period (the same for all of Windy's wave layers).
            await whileHidden(onPause, signal);
            store.set('overlay', 'waves');
            store.set('timestamp', points[0].t);
            await waitRedraw();
            const interp0 = await getLatLonInterpolator();
            const picks = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 6)) === 0).slice(0, 6);
            const samples = await Promise.all(
                picks.map(async p => {
                    const raw = interp0 ? await Promise.resolve(interp0({ lat: p.pos.lat, lon: p.pos.lon })).catch(() => null) : null;
                    const ref = reference?.(p.pos, points[0].t) ?? null;
                    return { raw, height: ref?.hs ?? NaN, dir: ref?.hsDir ?? null, period: ref?.hsPeriod ?? null };
                }),
            );
            sample = safeJson(samples[0]?.raw);
            reading = calibrateWaveReading(samples.filter(s => Number.isFinite(s.height)));
            if (!reading) {
                tried = samples.length;
                return out;
            }
        }
        store.set('overlay', kind === 'currents' ? 'currents' : kind === 'visibility' ? 'visibility' : kind === 'sea' ? 'wwaves' : 'wind');
        // Currents only exist in Windy's ocean model (CMEMS), not in ECMWF: make sure it is the one drawn.
        // ASSUMPTION: 'cmems' is the product id (from Windy's type files); unverified inside Windy.
        if (kind === 'currents' && store.get('product') !== 'cmems') {
            try {
                store.set('product', 'cmems');
            } catch {
                /* Windy may refuse; then its own choice stays */
            }
        }
        if (kind === 'wind100') {
            store.set('level', '100m');
        }
        await waitRedraw();
        let done = 0;
        for (const { t, pos } of points) {
            if (signal.cancelled) break;
            // read only while the page is on screen: if it was hidden at any moment during the step,
            // Windy may not have drawn the new time, so the step is done again
            for (;;) {
                await whileHidden(onPause, signal);
                const started = Date.now();
                store.set('timestamp', t);
                await waitRedraw();
                if (signal.cancelled || (!document.hidden && hiddenSince < started)) break;
            }
            if (signal.cancelled) break;
            const interp = await getLatLonInterpolator();
            // Windy's interpolator answers with a Promise (its type files: Promise<[v1, v2, v3] | null | NaN | -1>)
            const raw = interp ? await Promise.resolve(interp({ lat: pos.lat, lon: pos.lon })) : null;
            tried++;
            if (!sample || (sample === 'null' && raw != null)) sample = interp ? safeJson(raw) : 'no interpolator';
            const v = toArray(raw);
            if (kind === 'sea') {
                const w = reading ? readWave(raw, reading) : null;
                if (w && Number.isFinite(w.h)) out.set(t, { seaHs: w.h, seaDir: w.dir, seaPeriod: w.period, seaWindy: true });
            } else if (kind === 'visibility') {
                // ASSUMPTION: the first value is the visibility in metres (scalar layer)
                if (Array.isArray(v) && isFinite(v[0]) && v[0] >= 0) out.set(t, { visNm: (v[0] as number) / 1852 });
            } else if (Array.isArray(v) && isFinite(v[0]) && isFinite(v[1])) {
                const [u, vv] = v as number[];
                const speed = Math.hypot(u, vv) * MS_TO_KN;
                if (kind === 'currents') {
                    // ASSUMPTION: raw values are east/north components (m/s); set = direction flowing towards.
                    out.set(t, { currentKn: speed, currentSet: ((Math.atan2(u, vv) * 180) / Math.PI + 360) % 360 });
                } else {
                    // Wind convention: direction the wind blows FROM.
                    out.set(t, { wind100Kn: speed, wind100Dir: ((Math.atan2(-u, -vv) * 180) / Math.PI + 360) % 360 });
                }
            }
            onProgress(++done);
        }
    } finally {
        store.set('overlay', saved.overlay);
        if (saved.product && store.get('product') !== saved.product) {
            try {
                store.set('product', saved.product);
            } catch {
                /* ignore */
            }
        }
        store.set('level', saved.level);
        store.set('timestamp', saved.timestamp);
        map.setView(view.center, view.zoom, { animate: false } as never);
        lastSweepReport[kind] = { read: out.size, tried, sample };
    }
    return out;
}

/** Windy's interpolator gives an array; accept an object with u/v or numbered keys as well, just in case. */
function toArray(v: unknown): number[] | null {
    if (Array.isArray(v)) return v as number[];
    if (v && typeof v === 'object') {
        const o = v as Record<string, number>;
        if (typeof o.u === 'number' && typeof o.v === 'number') return [o.u, o.v];
        if (typeof o[0] === 'number') return [o[0], o[1]];
    }
    if (typeof v === 'number') return [v];
    return null;
}

function safeJson(v: unknown): string {
    try {
        return JSON.stringify(v)?.slice(0, 80) ?? String(v);
    } catch {
        return String(v);
    }
}
