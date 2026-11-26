// Drift of a stopped ship (owner, 2026-11-26: "we stop but we really dont know where we will be after 4 hours of drifting
// ... we are always guessing. can you solve this"). Plain functions, unit-tested (test/drift.test.ts). Notes, sources and
// what is assumed: windy/notes/drift-mode.md. An ESTIMATE from the forecast; the watch, radar and ECDIS decide.
//
// Model, per time step (10 min):
//   1. Heading: a stopped ship lies with the wind about θ on the bow (just forward of the beam with accommodation aft, about
//      abeam with it 1/3 from forward and the engine casing aft, just abaft with it forward; seamanship texts and a model-
//      test study: "lies with the wind just forward or just abaft the beam"). It can lie either way round (port or
//      starboard side to the weather), headings about 2θ apart: both are worked out.
//   2. Wind drift through the water (leeway): leeway % × wind speed, the % from the balance of wind force on the area above
//      water and water drag on the area below (lib/shipTypes.ts estimateLeeway, or the master's own figure).
//   3. Its direction: downwind, turned δ towards the ship's lee beam (a ship that lies with the wind forward of the beam
//      moves a little sternfirst, so its drift is not exactly downwind). The turn is the other way when the other side is
//      to the weather: this is why the two sides drift apart (SAR "leeway divergence"). δ = half the angle the wind is
//      off the beam (ASSUMED; the master can type the value seen, and fixes can correct it).
//   4. Plus the current (forecast; set = where it flows to).
//   Not in the model: wave drift force (adds roughly 0.3–1 % of the wind speed in a developed sea, more in heavy swell),
//   yawing about the mean heading, shallow water, wind shadow of land.

import { norm360, rhumbDirect, rhumbInverse } from './geo';
import { isLand } from './landMask';
import type { Vessel } from './model';
import { estimateLeeway } from './shipTypes';

export type Accom = 'aft' | 'third' | 'midships' | 'forward';
export type Side = 'stbd' | 'port';

export const ACCOM: { id: Accom; label: string; theta: number }[] = [
    { id: 'aft', label: 'Aft (tankers, bulk carriers, most cargo ships)', theta: 75 },
    { id: 'third', label: 'About 1/3 from forward, engine casing aft (large container ships)', theta: 85 },
    { id: 'midships', label: 'Midships, or windage spread evenly (car carriers, Ro-Ro, passenger)', theta: 90 },
    { id: 'forward', label: 'Forward (offshore supply vessels, some Ro-Ro)', theta: 105 },
];

/** Where the accommodation usually is for a ship type (the master can change it) */
export function accomFor(shipType: string | undefined | null): Accom {
    switch (shipType) {
        case 'container':
            return 'third';
        case 'pctc':
        case 'roro':
        case 'passenger':
        case 'yacht':
            return 'midships';
        case 'offshore':
            return 'forward';
        default:
            return 'aft';
    }
}

export interface DriftSettings {
    /** Accommodation position; null = from the ship type */
    accom: Accom | null;
    /** Wind angle on the bow while lying stopped, ° (0–180); null = from the accommodation position */
    theta: number | null;
    /** Drift off downwind, °; null = worked out from θ */
    delta: number | null;
    /** Which side to the weather: both (two tracks), or the one seen */
    side: 'both' | Side;
    /** Heading seen on the gyro while drifting (sets the side and θ); null = not given */
    observedHeading: number | null;
    /** Hours ahead to show */
    hours: number;
    /** Marks on the track every 1 or 3 hours */
    marksH: 1 | 3;
    /** Warn when a track comes within this distance of land, nm */
    dangerNm: number;
    /** Learn from the position updates: correct the wind drift's speed and direction (on by default, owner 2026-11-26) */
    learn: boolean;
    /** The spread shown: leeway ± this %, drift direction ± this ° */
    spreadPct: number;
    spreadDeg: number;
}

export const defaultDriftSettings = (): DriftSettings => ({
    accom: null,
    theta: null,
    delta: null,
    side: 'both',
    observedHeading: null,
    hours: 24,
    marksH: 1,
    dangerNm: 5,
    learn: true,
    spreadPct: 30,
    spreadDeg: 10,
});

export interface DriftParams {
    leewayPct: number;
    leewayHow: string;
    theta: number;
    thetaHow: string;
    delta: number;
    deltaHow: string;
    /** From the fixes (1 = none) */
    factor: number;
    /** Extra turn from the fixes, ° */
    turn: number;
}

export function driftParams(v: Vessel, s: DriftSettings, cal: { factor: number; turn: number } | null = null): DriftParams {
    const lw = v.leewayPct != null ? { pct: v.leewayPct, how: 'your leeway figure (Ship particulars)' } : estimateLeeway(v);
    const accom = s.accom ?? accomFor(v.shipType);
    const a = ACCOM.find(x => x.id === accom)!;
    const theta = s.theta ?? a.theta;
    const delta = s.delta ?? Math.round(Math.abs(90 - theta) / 2);
    return {
        leewayPct: lw.pct,
        leewayHow: lw.how,
        theta,
        thetaHow: s.theta != null ? 'your figure' : `accommodation ${accom === 'third' ? '1/3 from forward' : accom}${s.accom == null ? ' (usual for the ship type)' : ''}`,
        delta,
        deltaHow: s.delta != null ? 'your figure' : 'assumed: half the angle the wind is off the beam',
        factor: s.learn && cal ? cal.factor : 1,
        turn: s.learn && cal ? cal.turn : 0,
    };
}

export interface DriftWx {
    windKn: number | null;
    /** Wind comes FROM, °T */
    windDir: number | null;
    gustKn?: number | null;
    /** Current: speed kn and set (flows TOWARDS, °T) */
    cur: { kn: number; set: number } | null;
    hs?: number | null;
    /** Waves come FROM, °T */
    hsDir?: number | null;
    /** The whole forecast at the point (all wave systems with periods), for the polar and the roll / pitch estimate */
    full?: import('./weather').WxPoint | null;
}

export interface DriftVel {
    /** Over the ground */
    kn: number;
    toward: number;
    /** Ship's heading, °T */
    heading: number;
    /** Wind drift through the water */
    leewayKn: number;
    leewayToward: number;
}

const vec = (kn: number, toward: number) => [kn * Math.sin((toward * Math.PI) / 180), kn * Math.cos((toward * Math.PI) / 180)];

/**
 * Drift with one side to the weather. Starboard side to the weather: the wind comes θ on the starboard bow, heading =
 * wind − θ; the drift turns δ towards the lee (port) beam, i.e. clockwise from downwind when θ < 90 (anticlockwise for
 * port side to the weather). `spread` scales the leeway (1 = as estimated) and adds a turn, for the spread of positions.
 */
export function driftVel(wx: DriftWx, side: Side, p: DriftParams, spread = { k: 1, turn: 0 }, observedHeading: number | null = null): DriftVel | null {
    const haveWind = wx.windKn != null && wx.windDir != null && isFinite(wx.windKn) && isFinite(wx.windDir);
    if (!haveWind && !wx.cur) return null;
    const sgn = side === 'stbd' ? 1 : -1;
    let heading = 0;
    let lk = 0;
    let lt = 0;
    if (haveWind) {
        const W = wx.windDir as number;
        // the heading seen on the gyro sets θ for the side it shows
        const theta = observedHeading != null ? Math.abs(((((W - observedHeading) % 360) + 540) % 360) - 180) : p.theta;
        heading = norm360(W - sgn * theta);
        const delta = (theta <= 90 ? 1 : -1) * (observedHeading != null ? Math.round(Math.abs(90 - theta) / 2) : p.delta);
        lk = (((wx.windKn as number) * p.leewayPct) / 100) * p.factor * spread.k;
        lt = norm360(W + 180 + sgn * delta + p.turn + spread.turn);
    }
    const [lx, ly] = vec(lk, lt);
    const [cx, cy] = wx.cur ? vec(wx.cur.kn, wx.cur.set) : [0, 0];
    const x = lx + cx;
    const y = ly + cy;
    return { kn: Math.hypot(x, y), toward: norm360((Math.atan2(x, y) * 180) / Math.PI), heading, leewayKn: lk, leewayToward: lt };
}

/** Which side to the weather a seen heading means (the wind on the starboard or port side) */
export function sideOf(windFrom: number, heading: number): Side {
    return norm360(windFrom - heading) <= 180 ? 'stbd' : 'port';
}

export interface DriftPoint {
    t: number;
    lat: number;
    lon: number;
    kn: number;
    toward: number;
    heading: number;
}

/** Step the drift from a position and time to `until` (10-min steps); stops at land or without weather */
export function stepDrift(
    from: { lat: number; lon: number; t: number },
    until: number,
    wxAt: (p: { lat: number; lon: number }, t: number) => DriftWx | null,
    side: Side,
    p: DriftParams,
    spread = { k: 1, turn: 0 },
    observedHeading: number | null = null,
    stepMin = 10,
): { pts: DriftPoint[]; stopped: 'land' | 'noweather' | null } {
    const pts: DriftPoint[] = [];
    let pos = { lat: from.lat, lon: from.lon };
    let t = from.t;
    const dt = stepMin * 60e3;
    for (let n = 0; t <= until && n < 20000; n++) {
        const wx = wxAt(pos, t);
        const v = wx ? driftVel(wx, side, p, spread, observedHeading) : null;
        if (!v) return { pts, stopped: 'noweather' };
        pts.push({ t, lat: pos.lat, lon: pos.lon, kn: v.kn, toward: v.toward, heading: v.heading });
        if (t + dt > until) break;
        const next = rhumbDirect(pos, v.toward, (v.kn * stepMin) / 60);
        if (isLand(next.lat, next.lon)) return { pts, stopped: 'land' };
        pos = next;
        t += dt;
    }
    return { pts, stopped: null };
}

/** The point of a track at time t (between the 10-min points) */
export function pointAt(pts: DriftPoint[], t: number): DriftPoint | null {
    if (!pts.length || t < pts[0].t || t > pts[pts.length - 1].t + 1) return null;
    let i = 0;
    while (i + 1 < pts.length && pts[i + 1].t <= t) i++;
    const a = pts[i];
    const b = pts[i + 1];
    if (!b) return a;
    const f = (t - a.t) / (b.t - a.t);
    return { ...a, t, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
}

/** Distance to the nearest land square of the land map (Natural Earth, 0.1° ≈ 6 nm squares), up to maxNm; null = none */
export function nearestLandNm(lat: number, lon: number, maxNm = 40): number | null {
    if (isLand(lat, lon)) return 0;
    const dLat = maxNm / 60;
    const cos = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    const dLon = dLat / cos;
    let best: number | null = null;
    for (let y = Math.floor((lat - dLat) * 10) / 10; y <= lat + dLat; y += 0.1)
        for (let x = Math.floor((lon - dLon) * 10) / 10; x <= lon + dLon; x += 0.1) {
            const cy = y + 0.05;
            const cx = x + 0.05;
            if (!isLand(cy, cx)) continue;
            // to the near edge of the square (≈ 3 nm from its middle)
            const d = Math.max(0, Math.hypot((cy - lat) * 60, (cx - lon) * 60 * cos) - 3);
            if (d <= maxNm && (best == null || d < best)) best = d;
        }
    return best;
}

/**
 * From the master's fixes: the ship really moved `seen` (nm east / north) between two fixes; over the same time the model
 * gave `leeway` (wind drift through the water) and `cur` (current) displacements. The wind part of what was seen is
 * seen − current; compared with the model's wind drift it gives a factor (faster / slower) and a turn (° to the right +,
 * or left −). Only when the wind drift was at least 0.3 nm and the time at least 25 minutes.
 */
export function calibrate(seen: { e: number; n: number }, leeway: { e: number; n: number }, cur: { e: number; n: number }, hours: number): { factor: number; turn: number } | null {
    const se = seen.e - cur.e;
    const sn = seen.n - cur.n;
    const ml = Math.hypot(leeway.e, leeway.n);
    if (!(hours > 0.4) || ml < 0.3) return null;
    const factor = Math.max(0.3, Math.min(3, Math.hypot(se, sn) / ml));
    const a = (Math.atan2(se, sn) * 180) / Math.PI;
    const b = (Math.atan2(leeway.e, leeway.n) * 180) / Math.PI;
    const turn = ((((a - b) % 360) + 540) % 360) - 180;
    return { factor, turn: Math.max(-60, Math.min(60, turn)) };
}

/** Wind-drift and current displacements (nm east / north) along a computed track (for calibrate) */
export function partsOf(pts: DriftPoint[], wxAt: (p: { lat: number; lon: number }, t: number) => DriftWx | null, side: Side, p: DriftParams, observedHeading: number | null = null): { leeway: { e: number; n: number }; cur: { e: number; n: number } } {
    const L = { e: 0, n: 0 };
    const C = { e: 0, n: 0 };
    for (let i = 0; i + 1 < pts.length; i++) {
        const h = (pts[i + 1].t - pts[i].t) / 3600e3;
        const wx = wxAt(pts[i], pts[i].t);
        const v = wx ? driftVel(wx, side, p, { k: 1, turn: 0 }, observedHeading) : null;
        if (!v || !wx) continue;
        const [lx, ly] = vec(v.leewayKn, v.leewayToward);
        L.e += lx * h;
        L.n += ly * h;
        if (wx.cur) {
            const [cx, cy] = vec(wx.cur.kn, wx.cur.set);
            C.e += cx * h;
            C.n += cy * h;
        }
    }
    return { leeway: L, cur: C };
}

/** nm east / north from a to b */
export function enOf(a: { lat: number; lon: number }, b: { lat: number; lon: number }): { e: number; n: number } {
    const r = rhumbInverse(a, b);
    return { e: r.distNm * Math.sin((r.course * Math.PI) / 180), n: r.distNm * Math.cos((r.course * Math.PI) / 180) };
}

export interface DriftInterval {
    from: { lat: number; lon: number; t: number };
    to: { lat: number; lon: number; t: number };
    /** What the ship really did (over the ground) */
    seenKn: number;
    seenToward: number;
    /** What the model gave for the same time, from the same start */
    modelKn: number;
    modelToward: number;
}

/**
 * Learn from all position updates (owner, 2026-11-26: "update position while drifting so that future predictions are very
 * accurate, and the system can understand how the vessel was drifting in past"). Each interval between two positions is
 * stepped with the model from the earlier one; its wind-drift part is compared with what was seen minus the current.
 * Newer intervals count more (each older one × 0.6). One speed factor and one turn for the plan ahead, or null when the
 * intervals together had under 0.3 nm of wind drift.
 */
export function learnFromFixes(
    fixes: { lat: number; lon: number; t: number }[],
    wxAt: (p: { lat: number; lon: number }, t: number) => DriftWx | null,
    side: Side,
    p: DriftParams,
): { cal: { factor: number; turn: number } | null; intervals: DriftInterval[] } {
    const f = [...fixes].sort((a, b) => a.t - b.t);
    const intervals: DriftInterval[] = [];
    const S = { e: 0, n: 0 };
    const M = { e: 0, n: 0 };
    let hours = 0;
    const base = { ...p, factor: 1, turn: 0 };
    for (let i = 1; i < f.length; i++) {
        const a = f[i - 1];
        const b = f[i];
        const h = (b.t - a.t) / 3600e3;
        if (!(h > 0.1)) continue;
        const tr = stepDrift(a, b.t, wxAt, side, base);
        const seen = enOf(a, b);
        const last = tr.pts[tr.pts.length - 1];
        const model = last ? enOf(a, last) : { e: 0, n: 0 };
        const deg = (v: { e: number; n: number }) => norm360((Math.atan2(v.e, v.n) * 180) / Math.PI);
        intervals.push({ from: a, to: b, seenKn: Math.hypot(seen.e, seen.n) / h, seenToward: deg(seen), modelKn: Math.hypot(model.e, model.n) / h, modelToward: deg(model) });
        if (tr.pts.length < 2) continue;
        const parts = partsOf(tr.pts, wxAt, side, base);
        const w = Math.pow(0.6, f.length - 1 - i);
        S.e += w * (seen.e - parts.cur.e);
        S.n += w * (seen.n - parts.cur.n);
        M.e += w * parts.leeway.e;
        M.n += w * parts.leeway.n;
        hours += h;
    }
    return { cal: calibrate({ e: S.e, n: S.n }, M, { e: 0, n: 0 }, hours), intervals };
}
