// Drift mode (owner, 2026-11-26): the drift session (start, the master's fixes), the forecast at the drift position, and
// the tracks worked out from them every minute. The map part (windy/driftLayer.ts) and the Drift tab read the stores here.
// An estimate from the forecast and the ship's particulars (lib/drift.ts); never a replacement for watchkeeping.
import { derived, get, writable } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { sunTimes } from '../lib/astro';
import {
    defaultDriftSettings,
    driftParams,
    driftVel,
    enOf,
    learnFromFixes,
    nearestLandNm,
    pointAt,
    sideOf,
    stepDrift,
    type DriftInterval,
    type DriftParams,
    type DriftPoint,
    type DriftSettings,
    type DriftWx,
    type Side,
} from '../lib/drift';
import type { Vessel } from '../lib/model';
import { motionAt, motionMissing, type MotionShort } from '../lib/motionEstimate';
import { sphereNm } from '../lib/seaNet';
import { currentAt, forecastInfo, weatherAt, type WxSeries } from '../lib/weather';
import { vessel } from '../state';
import { deviceOffline, fetchSeries } from './forecast';

const H = 3600e3;
const KEY_S = 'windy-plugin-passage-plan:drift-settings';
const KEY_D = 'windy-plugin-passage-plan:drift';

function load<T>(key: string, fallback: T): T {
    try {
        const v = JSON.parse(localStorage.getItem(key) ?? 'null');
        return v && typeof v === 'object' ? { ...fallback, ...v } : fallback;
    } catch {
        return fallback;
    }
}
function save(key: string, v: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(v));
    } catch {
        /* not kept after a reload */
    }
}

export const driftSettings = writable<DriftSettings>(load(KEY_S, defaultDriftSettings()));
driftSettings.subscribe(v => save(KEY_S, v));

export interface DriftFix {
    lat: number;
    lon: number;
    /** UTC ms */
    t: number;
    /** Gyro heading seen at the fix, °T (optional) */
    heading?: number | null;
}
export interface DriftSession {
    on: boolean;
    start: DriftFix | null;
    fixes: DriftFix[];
}
export const driftSession = writable<DriftSession>(load(KEY_D, { on: false, start: null, fixes: [] }));
driftSession.subscribe(v => save(KEY_D, v));

/** Forecasts fetched for the drift area (the nearest one is used at each point) */
export const driftWx = writable<WxSeries[]>([]);
export const driftStatus = writable('');
export const driftBusy = writable(false);
/** Present time, moved on every minute while drift mode runs */
export const driftNow = writable(Date.now());

export interface DriftTrack {
    side: Side;
    pts: DriftPoint[];
    stopped: 'land' | 'noweather' | null;
    /** First time (after now) the track comes within the danger distance of land */
    danger: { t: number; nm: number; lat: number; lon: number } | null;
    /** Nearest land to the track ahead (up to 40 nm), and when */
    closest: { nm: number; t: number } | null;
    /** Learned from the position updates for this side (null = not enough yet, or switched off) */
    cal: { factor: number; turn: number } | null;
    /** Every interval between position updates: drift seen against the estimate */
    intervals: DriftInterval[];
}
export interface DriftResult {
    from: DriftFix;
    now: number;
    until: number;
    params: DriftParams;
    tracks: DriftTrack[];
    /** Where the ship may be (all tracks with leeway ± spread % and direction ± spread °): outline, lat/lon */
    area: [number, number][];
    /** Correction from the fixes, when used */
    cal: { factor: number; turn: number } | null;
    /** Seen drift between the last two fixes */
    seen: { kn: number; toward: number } | null;
    nextSunset: number | null;
    nextSunrise: number | null;
    /** The side the seen heading gives (null = both shown) */
    sideSeen: Side | null;
    source: string;
}

/** The forecast at a point and time, as the drift model needs it */
export function driftWxAt(series: WxSeries[], p: { lat: number; lon: number }, t: number): DriftWx | null {
    if (!series.length) return null;
    const wx = weatherAt(series, p, t);
    const cur = currentAt(series, undefined, p, t);
    if (!wx && !cur) return null;
    return { windKn: wx?.windKn ?? null, windDir: wx?.windDir ?? null, gustKn: wx?.gustKn ?? null, cur, hs: wx?.hs ?? null, hsDir: wx?.hsDir ?? null, full: wx };
}

/** Convex outline of points (monotone chain) */
function hull(pts: [number, number][]): [number, number][] {
    const p = [...pts].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    if (p.length < 3) return p;
    const cross = (o: number[], a: number[], b: number[]) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
    const lo: [number, number][] = [];
    for (const q of p) {
        while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
        lo.push(q);
    }
    const up: [number, number][] = [];
    for (const q of [...p].reverse()) {
        while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
        up.push(q);
    }
    return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

function nextSun(lat: number, lon: number, now: number): { set: number | null; rise: number | null } {
    let set: number | null = null;
    let rise: number | null = null;
    for (let d = 0; d < 3 && (set == null || rise == null); d++) {
        const s = sunTimes(now + d * 24 * H, lat, lon);
        if (set == null && s.set != null && s.set > now) set = s.set;
        if (rise == null && s.rise != null && s.rise > now) rise = s.rise;
    }
    return { set, rise };
}

export function computeDrift(ses: DriftSession, s: DriftSettings, series: WxSeries[], v: Vessel, now: number): DriftResult | null {
    if (!ses.on || !ses.start || !series.length) return null;
    const all = [ses.start, ...ses.fixes].sort((a, b) => a.t - b.t);
    const from = all[all.length - 1];
    // "now" is never before the last fix (the clock store moves on once a minute)
    now = Math.max(now, from.t);
    const wxAt = (p: { lat: number; lon: number }, t: number) => driftWxAt(series, p, t);
    let params = driftParams(v, s);
    // the side and wind angle from a heading seen on the gyro (the last fix with one, else the setting)
    const hSeen = [...all].reverse().find(f => f.heading != null) ?? (s.observedHeading != null ? { ...from, heading: s.observedHeading } : null);
    let sideSeen: Side | null = null;
    if (hSeen?.heading != null) {
        const w = wxAt(hSeen, hSeen.t);
        if (w?.windDir != null) {
            sideSeen = sideOf(w.windDir, hSeen.heading);
            const theta = Math.abs(((((w.windDir - hSeen.heading) % 360) + 540) % 360) - 180);
            params = { ...params, theta, thetaHow: `from the heading ${Math.round(hSeen.heading)}° seen`, delta: s.delta ?? Math.round(Math.abs(90 - theta) / 2) };
        }
    }
    const sides: Side[] = sideSeen ? [sideSeen] : s.side === 'both' ? ['stbd', 'port'] : [s.side];
    // how the ship really drifted between the position updates (the last two, in plain words)
    let seen: { kn: number; toward: number } | null = null;
    if (all.length >= 2) {
        const a = all[all.length - 2];
        const b = all[all.length - 1];
        const hrs = (b.t - a.t) / H;
        const en = enOf(a, b);
        if (hrs > 0.1) seen = { kn: Math.hypot(en.e, en.n) / hrs, toward: ((Math.atan2(en.e, en.n) * 180) / Math.PI + 360) % 360 };
    }
    let cal: { factor: number; turn: number } | null = null;
    const until = now + s.hours * H;
    const tracks: DriftTrack[] = [];
    const cloud: [number, number][] = [];
    for (const side of sides) {
        // learn from all position updates, for this side's model
        const learned = all.length >= 2 ? learnFromFixes(all, wxAt, side, params) : { cal: null, intervals: [] };
        const sideCal = s.learn ? learned.cal : null;
        if (side === sides[0]) cal = sideCal;
        const sp = sideCal ? { ...params, factor: sideCal.factor, turn: sideCal.turn } : params;
        const r = stepDrift(from, until, wxAt, side, sp);
        let danger: DriftTrack['danger'] = null;
        let closest: DriftTrack['closest'] = null;
        // every 30 minutes ahead
        for (let t = Math.ceil(now / (H / 2)) * (H / 2); t <= until; t += H / 2) {
            const p = pointAt(r.pts, t);
            if (!p) break;
            const d = nearestLandNm(p.lat, p.lon, 40);
            if (d != null && (!closest || d < closest.nm)) closest = { nm: d, t };
            if (!danger && d != null && d <= s.dangerNm) danger = { t, nm: d, lat: p.lat, lon: p.lon };
        }
        tracks.push({ side, pts: r.pts, stopped: r.stopped, danger, closest, cal: sideCal, intervals: learned.intervals });
        const k = s.spreadPct / 100;
        const sp0 = sp;
        for (const spr of [
            { k: 1 - k, turn: -s.spreadDeg },
            { k: 1 - k, turn: s.spreadDeg },
            { k: 1 + k, turn: -s.spreadDeg },
            { k: 1 + k, turn: s.spreadDeg },
        ]) {
            const e = stepDrift(from, until, wxAt, side, sp0, spr, null, 30);
            for (const q of e.pts) if (q.t >= now) cloud.push([q.lat, q.lon]);
        }
        for (const q of r.pts) if (q.t >= now) cloud.push([q.lat, q.lon]);
    }
    const sun = nextSun(from.lat, from.lon, now);
    const info = forecastInfo(series);
    const fetched = Math.min(...series.map(x => x.fetchedAt ?? Infinity));
    return {
        from,
        now,
        until,
        params,
        tracks,
        area: cloud.length > 2 ? hull(cloud) : [],
        cal,
        seen,
        nextSunset: sun.set,
        nextSunrise: sun.rise,
        sideSeen,
        source: info ? `${info.air}${info.waves && info.waves !== info.air ? `; waves ${info.waves}` : ''}${isFinite(fetched) ? `; downloaded ${new Date(fetched).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}` : '',
    };
}

export const driftResult = derived([driftSession, driftSettings, driftWx, vessel, driftNow], ([ses, s, series, v, now]) => {
    try {
        return computeDrift(ses, s, series, v, now);
    } catch (e) {
        console.error('[galenea] drift', e);
        return null;
    }
});

/** Roll and pitch while stopped at a heading (the plugin's own estimate; null with the reason when it cannot be worked out) */
export function driftMotion(wx: DriftWx | null, heading: number): { m: MotionShort | null; why: string } {
    const v = get(vessel);
    const miss = motionMissing(v);
    if (miss) return { m: null, why: miss };
    if (!wx?.full) return { m: null, why: 'no wave forecast here' };
    const m = motionAt(wx.full, heading, 0, v);
    return m && isFinite(m.roll) ? { m, why: '' } : { m: null, why: 'no wave data at this time' };
}

/** The drift, weather and motion at a time on a track (the Drift polar and table) */
export function driftAt(r: DriftResult, side: Side, t: number): { pt: DriftPoint; wx: DriftWx | null; vel: ReturnType<typeof driftVel>; motion: ReturnType<typeof driftMotion> } | null {
    const tr = r.tracks.find(x => x.side === side);
    const pt = tr ? pointAt(tr.pts, t) : null;
    if (!pt) return null;
    const wx = driftWxAt(get(driftWx), pt, t);
    const p = tr?.cal ? { ...r.params, factor: tr.cal.factor, turn: tr.cal.turn } : r.params;
    const vel = wx ? driftVel(wx, side, p) : null;
    return { pt, wx, vel, motion: driftMotion(wx, vel?.heading ?? pt.heading) };
}

// ---------- the forecast at the drift position ----------

/** Download the forecast where the drift is and will be (points more than 25 nm from a kept one, at most 3) */
export async function getDriftWeather(fresh = false): Promise<void> {
    const ses = get(driftSession);
    if (!ses.start || get(driftBusy)) return;
    const s = get(driftSettings);
    const all = [ses.start, ...ses.fixes].sort((a, b) => a.t - b.t);
    const from = all[all.length - 1];
    const now = Date.now();
    const want: { lat: number; lon: number }[] = [from];
    const r = get(driftResult);
    for (const tr of r?.tracks ?? []) {
        const end = tr.pts[tr.pts.length - 1];
        if (end) want.push(end);
    }
    // kept for 6 hours, then downloaded again (a newer forecast run is out by then)
    const have = fresh ? [] : get(driftWx).filter(x => x.ts.length && now - (x.fetchedAt ?? 0) < 6 * H);
    const need = want.filter(p => !have.some(x => sphereNm(x, p) < 25)).slice(0, 3);
    if (!need.length) return;
    if (deviceOffline()) {
        driftStatus.set('No internet: the drift uses the forecast already downloaded (if any).');
    }
    driftBusy.set(true);
    driftStatus.set('Getting the forecast for the drift position…');
    try {
        const start = Math.min(ses.start.t, now) - 3 * H;
        const got = await Promise.all(need.map(p => fetchSeries(p.lat, p.lon, 1, { start, end: now + (s.hours + 6) * H }, { extra: true }).catch(() => null)));
        const ok = got.filter((x): x is WxSeries => !!x);
        driftWx.set([...ok, ...have.filter(x => !ok.some(o => sphereNm(o, x) < 5))]);
        driftStatus.set(ok.length ? '' : 'The forecast could not be downloaded for the drift position.');
        logEvent('drift', `Drift forecast: ${ok.length} of ${need.length} point(s)`);
    } finally {
        driftBusy.set(false);
    }
}

// ---------- start, fixes, stop ----------

export function startDrift(p: { lat: number; lon: number; t: number; heading?: number | null }): void {
    driftNow.set(Date.now());
    driftSession.set({ on: true, start: { ...p }, fixes: [] });
    driftWx.set([]);
    logEvent('drift', `Drift started at ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}, ${new Date(p.t).toISOString().slice(0, 16)}Z${p.heading != null ? `, heading ${p.heading}°` : ''}`);
    getDriftWeather().catch(() => {});
}

export function addFix(p: DriftFix): void {
    driftNow.set(Date.now());
    driftSession.update(s => ({ ...s, fixes: [...s.fixes, { ...p }].sort((a, b) => a.t - b.t) }));
    logEvent('drift', `Drift fix ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}, ${new Date(p.t).toISOString().slice(0, 16)}Z${p.heading != null ? `, heading ${p.heading}°` : ''}`);
    getDriftWeather().catch(() => {});
}

export function removeLastFix(): void {
    driftSession.update(s => ({ ...s, fixes: s.fixes.slice(0, -1) }));
}

export function stopDrift(): void {
    driftSession.update(s => ({ ...s, on: false }));
    logEvent('drift', 'Drift stopped');
}

let timer: ReturnType<typeof setInterval> | null = null;
let ticks = 0;
/** Keep "now" moving (every minute) and the forecast fresh (checked every 30 minutes) while drift mode is on */
export function startDriftClock(): void {
    if (timer) return;
    timer = setInterval(() => {
        driftNow.set(Date.now());
        if (++ticks % 30 === 0 && get(driftSession).on) getDriftWeather().catch(() => {});
    }, 60e3);
    if (get(driftSession).on && !get(driftWx).length) getDriftWeather().catch(() => {});
}
export function stopDriftClock(): void {
    if (timer) clearInterval(timer);
    timer = null;
}
