// Speed, RPM and fuel planning: the owner's RPM / speed-in-calm-water / fuel table, the
// weather speed loss, ocean current, planned stops with drift, and a time-stepped track.
//
// Weather speed loss options:
//  - 'manual': the allowance typed for each leg (kn).
//  - 'kwon':   Kwon (2008) method as referenced in ISO 15016. The coefficient tables below are
//              written from memory and have NOT yet been checked against the original paper:
//              treat results as a rough estimate. Swell is included by converting the forecast
//              significant wave height to an equivalent Beaufort number (WMO probable wave
//              heights) and using whichever of wind or waves gives the larger loss.

import { norm180, norm360 } from './geo';
import { lossMethodOf, type BarredRpm, type LegCalc, type PlanCalc, type Route, type SpeedRow, type TrackPoint, type Vessel } from './model';
import { beaufort, relFrom, type WxPoint } from './weather';
import { estimateLeeway, shipTypeOf } from './shipTypes';

const HOUR = 3600_000;

// ---------- Owner's speed table ----------

export interface TableValue {
    rpm: number | null;
    fuel: number | null;
    /** Engine power, kW (null when the table has no power column) */
    powerKw: number | null;
    /** True when the speed is outside the table and the value is extrapolated */
    outside: boolean;
}

/** RPM and fuel for a speed in calm water, linear between the owner's table rows. */
export function fromTable(table: SpeedRow[] | undefined, sicw: number): TableValue | null {
    const rows = (table ?? []).filter(r => r.sicw != null && isFinite(r.sicw)).sort((a, b) => (a.sicw as number) - (b.sicw as number));
    if (!rows.length) return null;
    const pick = (k: 'rpm' | 'fuel' | 'powerKw'): number | null => {
        const pts = rows.filter(r => r[k] != null && isFinite(r[k] as number));
        if (!pts.length) return null;
        if (pts.length === 1) return pts[0][k] as number;
        let i = pts.findIndex(r => (r.sicw as number) >= sicw);
        if (i <= 0) i = i === 0 ? 1 : pts.length - 1;
        const a = pts[i - 1];
        const b = pts[i];
        const f = (sicw - (a.sicw as number)) / ((b.sicw as number) - (a.sicw as number) || 1);
        return (a[k] as number) + ((b[k] as number) - (a[k] as number)) * f;
    };
    const lo = rows[0].sicw as number;
    const hi = rows[rows.length - 1].sicw as number;
    return { rpm: pick('rpm'), fuel: pick('fuel'), powerKw: pick('powerKw'), outside: sicw < lo - 1e-9 || sicw > hi + 1e-9 };
}

/** The barred RPM range (Settings → Speed, RPM and fuel) that `rpm` falls in, if any. */
export function barredRange(vessel: Vessel, rpm: number | null | undefined): BarredRpm | null {
    if (rpm == null || !isFinite(rpm)) return null;
    for (const b of vessel.barredRpm ?? []) {
        if (b.from == null || b.to == null) continue;
        const lo = Math.min(b.from, b.to);
        const hi = Math.max(b.from, b.to);
        if (rpm >= lo - 1e-9 && rpm <= hi + 1e-9) return b;
    }
    return null;
}

export type RpmIssue = 'barred' | 'aboveMax' | 'belowMin';
export interface RpmAdvice {
    /** The RPM the plugin advises (the one wanted when nothing is wrong) */
    rpm: number;
    /** What is wrong with the RPM wanted (none when it can be run) */
    issue?: RpmIssue;
    /** The barred range it falls in */
    range?: BarredRpm;
    /** The other choice (the allowed RPM on the other side of a barred range), if any */
    alt?: number;
}

/** Lowest / highest RPM the ship will run at (null = no limit set) */
export function rpmLimits(vessel: Vessel): { min: number | null; max: number | null } {
    const ok = (v: number | null | undefined) => (v != null && isFinite(v) && v > 0 ? v : null);
    let min = ok(vessel.minRpm);
    let max = ok(vessel.maxRpm);
    if (min != null && max != null && min > max) [min, max] = [max, min];
    return { min, max };
}

/** True when the ship may run at this RPM: not barred, not below the min, not above the max */
export function rpmAllowed(vessel: Vessel, rpm: number): boolean {
    const { min, max } = rpmLimits(vessel);
    return !barredRange(vessel, rpm) && (min == null || rpm >= min - 1e-9) && (max == null || rpm <= max + 1e-9);
}

/**
 * The RPM to advise when `wanted` is needed (owner, 2026-11-23: never advise a barred RPM, e.g. the auxiliary blower
 * cut-in / cut-out, nor above the max / below the min RPM; say why and give a slightly higher or lower RPM instead).
 * Above the max → the max; below the min → the min; in a barred range → the nearest whole RPM outside it that is allowed
 * (the other side as `alt`; on a tie the higher one, which keeps the ETA).
 */
export function adviseRpm(vessel: Vessel, wanted: number | null | undefined): RpmAdvice | null {
    if (wanted == null || !isFinite(wanted)) return null;
    const { min, max } = rpmLimits(vessel);
    if (max != null && wanted > max + 0.5) {
        const r = nearestAllowed(vessel, max, -1);
        return r != null ? { rpm: r, issue: 'aboveMax' } : null;
    }
    if (min != null && wanted < min - 0.5) {
        const r = nearestAllowed(vessel, min, +1);
        return r != null ? { rpm: r, issue: 'belowMin' } : null;
    }
    const range = barredRange(vessel, wanted);
    if (!range) return { rpm: wanted };
    const lo = Math.min(range.from as number, range.to as number);
    const hi = Math.max(range.from as number, range.to as number);
    const up = nearestAllowed(vessel, Math.floor(hi) + 1, +1);
    const down = nearestAllowed(vessel, Math.ceil(lo) - 1, -1);
    if (up == null && down == null) return null;
    const pickUp = down == null || (up != null && up - wanted <= wanted - down);
    return { rpm: (pickUp ? up : down) as number, issue: 'barred', range, alt: (pickUp ? down : up) ?? undefined };
}

/** First allowed whole RPM from `start` going `dir` (+1 up, −1 down), within the min / max; null if none */
function nearestAllowed(vessel: Vessel, start: number, dir: 1 | -1): number | null {
    const { min, max } = rpmLimits(vessel);
    let r = Math.round(start);
    for (let i = 0; i < 400; i++, r += dir) {
        if ((min != null && r < min - 1e-9) || (max != null && r > max + 1e-9) || r <= 0) return null;
        if (!barredRange(vessel, r)) return r;
    }
    return null;
}

/** The advice in words for one RPM figure (empty when the RPM wanted can be run) */
export function rpmAdviceText(vessel: Vessel, wanted: number | null | undefined, what = 'needed'): string {
    const a = adviseRpm(vessel, wanted);
    if (!a || !a.issue || wanted == null) return '';
    const kn = (r: number) => {
        const v = sicwForRpm(vessel.speedTable, r);
        return v != null ? ` (about ${v.toFixed(1)} kn in calm water)` : '';
    };
    const w = Math.round(wanted);
    if (a.issue === 'aboveMax') return `${w} RPM ${what} is above your max RPM ${rpmLimits(vessel).max}: run at ${a.rpm} RPM${kn(a.rpm)}, so the speed will be lower and the ETA later than planned.`;
    if (a.issue === 'belowMin') return `${w} RPM ${what} is below your min RPM ${rpmLimits(vessel).min}: run at ${a.rpm} RPM${kn(a.rpm)} (a little faster), or plan a stop / slow steaming break instead.`;
    const r = a.range as BarredRpm;
    const lo = Math.min(r.from as number, r.to as number);
    const hi = Math.max(r.from as number, r.to as number);
    const side = (x: number) => (x > wanted ? 'a little faster' : 'a little slower');
    return `${w} RPM ${what} is inside the barred range ${lo}–${hi}${r.why ? ` (${r.why})` : ''}: run at ${a.rpm} RPM${kn(a.rpm)}, ${side(a.rpm)}${a.alt != null ? `, or ${a.alt} RPM${kn(a.alt)}, ${side(a.alt)}` : ''}.`;
}

/** Calm-water speed for an RPM, linear between the owner's table rows (null without RPM in the table). */
export function sicwForRpm(table: SpeedRow[] | undefined, rpm: number): number | null {
    const pts = (table ?? []).filter(r => r.rpm != null && r.sicw != null && isFinite(r.rpm) && isFinite(r.sicw)).sort((a, b) => (a.rpm as number) - (b.rpm as number));
    if (pts.length < 2) return pts.length === 1 && Math.abs((pts[0].rpm as number) - rpm) < 1e-9 ? (pts[0].sicw as number) : null;
    let i = pts.findIndex(r => (r.rpm as number) >= rpm);
    if (i <= 0) i = i === 0 ? 1 : pts.length - 1;
    const a = pts[i - 1];
    const b = pts[i];
    const f = (rpm - (a.rpm as number)) / ((b.rpm as number) - (a.rpm as number) || 1);
    return (a.sicw as number) + ((b.sicw as number) - (a.sicw as number)) * f;
}

// ---------- Weather speed loss ----------

/** WMO "probable wave height" for each Beaufort force, m (Beaufort scale table). */
const BF_WAVE = [0, 0.1, 0.2, 0.6, 1.0, 2.0, 3.0, 4.0, 5.5, 7.0, 9.0, 11.5, 14.0];

/** Equivalent Beaufort force for a significant wave height (nearest WMO probable height). */
export function hsToBeaufort(hs: number): number {
    let best = 0;
    for (let b = 0; b < BF_WAVE.length; b++) {
        if (Math.abs(BF_WAVE[b] - hs) < Math.abs(BF_WAVE[best] - hs)) best = b;
    }
    return best;
}

// Kwon speed-reduction coefficient C_U by block coefficient (UNVERIFIED, from memory).
const CU: { cb: number; laden: [number, number, number]; ballast?: [number, number, number] }[] = [
    { cb: 0.55, laden: [1.7, -1.4, -7.4] },
    { cb: 0.6, laden: [2.2, -2.5, -9.7] },
    { cb: 0.65, laden: [2.6, -3.7, -11.6] },
    { cb: 0.7, laden: [3.1, -5.3, -12.4] },
    { cb: 0.75, laden: [2.4, -10.6, -9.5], ballast: [2.6, -12.5, -13.5] },
    { cb: 0.8, laden: [2.6, -13.1, -15.1], ballast: [3.0, -16.3, -21.6] },
    { cb: 0.85, laden: [3.1, -18.7, 28.0], ballast: [3.4, -20.9, 31.8] },
];

export interface LossInputs {
    lbp: number;
    breadth: number;
    draft: number;
    cb: number;
    condition: 'laden' | 'ballast';
    /** Kwon's formula family */
    shipType: 'container' | 'other';
    /** True when the block coefficient is the typical value for the ship type, not the owner's */
    cbTypical: boolean;
}

export function lossInputs(v: Vessel): LossInputs | null {
    const d = v.draftFwd != null && v.draftAft != null ? (v.draftFwd + v.draftAft) / 2 : (v.draftFwd ?? v.draftAft);
    if (!v.lbp || !v.breadth || !d) return null;
    const t = shipTypeOf(v.shipType);
    return { lbp: v.lbp, breadth: v.breadth, draft: d, cb: v.cb ?? t.cb, condition: v.condition ?? 'laden', shipType: t.kwon, cbTypical: v.cb == null };
}

/** Kwon speed loss in % for Beaufort `bn`, weather `relDeg` off the bow (0 = head), speed `v` kn. */
export function kwonLossPct(bn: number, relDeg: number, v: number, s: LossInputs): number {
    if (bn <= 0 || v <= 0) return 0;
    const rel = Math.abs(norm180(relDeg));
    let cBeta: number;
    if (rel < 30) cBeta = 1;
    else if (rel < 60) cBeta = (1.7 - 0.03 * (bn - 4) ** 2) / 2;
    else if (rel < 150) cBeta = (0.9 - 0.06 * (bn - 6) ** 2) / 2;
    else cBeta = (0.4 - 0.03 * (bn - 8) ** 2) / 2;
    const fn = (v * 0.5144) / Math.sqrt(9.81 * s.lbp);
    const row = CU.reduce((a, b) => (Math.abs(b.cb - s.cb) < Math.abs(a.cb - s.cb) ? b : a));
    const k = s.condition === 'ballast' && row.ballast ? row.ballast : row.laden;
    const cU = k[0] + k[1] * fn + k[2] * fn * fn;
    const vol = s.cb * s.lbp * s.breadth * s.draft;
    const v23 = Math.pow(vol, 2 / 3);
    const cForm =
        s.shipType === 'container'
            ? 0.7 * bn + Math.pow(bn, 6.5) / (22 * v23)
            : (s.condition === 'ballast' ? 0.7 : 0.5) * bn + Math.pow(bn, 6.5) / (2.7 * v23);
    const pct = Math.max(0, cBeta) * Math.max(0, cU) * Math.max(0, cForm);
    return Math.min(60, Math.max(0, pct));
}

/** Weather loss (kn) at speed `v` on `heading`, the larger of the wind-based and wave-based estimate. */
export function weatherLossKn(wx: WxPoint | null, heading: number, v: number, s: LossInputs | null): number {
    if (!wx || !s) return 0;
    let pct = 0;
    if (wx.windKn != null && wx.windDir != null) {
        pct = Math.max(pct, kwonLossPct(beaufort(wx.windKn) ?? 0, relFrom(wx.windDir, heading), v, s));
    }
    if (wx.hs != null && wx.hsDir != null) {
        pct = Math.max(pct, kwonLossPct(hsToBeaufort(wx.hs), relFrom(wx.hsDir, heading), v, s));
    }
    return (v * pct) / 100;
}

// ---------- Current and drift ----------

export interface Current {
    kn: number;
    /** Direction the current flows TOWARDS, °T */
    set: number;
}

/** Speed over ground keeping to the track `course` with speed through water `stw` in a current. */
export function sogWithCurrent(stw: number, course: number, cur: Current | null): { sog: number; along: number; cross: number } {
    if (!cur || !(cur.kn > 0)) return { sog: stw, along: 0, cross: 0 };
    const a = ((cur.set - course) * Math.PI) / 180;
    const along = cur.kn * Math.cos(a);
    const cross = cur.kn * Math.sin(a);
    return { sog: Math.max(0, along + Math.sqrt(Math.max(0, stw * stw - cross * cross))), along, cross };
}

/** Speed through water needed to make `sog` along `course` in a current. */
export function stwForSog(sog: number, course: number, cur: Current | null): number {
    if (!cur || !(cur.kn > 0)) return sog;
    const a = ((cur.set - course) * Math.PI) / 180;
    const along = cur.kn * Math.cos(a);
    const cross = cur.kn * Math.sin(a);
    return Math.sqrt(Math.max(0, (sog - along) ** 2 + cross * cross));
}

/** Drift of a stopped ship: current plus leeway (a % of the wind speed, downwind). */
export function driftOf(wx: WxPoint | null, cur: Current | null, leewayPct: number, angleDeg = 0): { kn: number; toward: number } | null {
    let x = 0;
    let y = 0;
    let any = false;
    if (cur && cur.kn > 0) {
        x += cur.kn * Math.sin((cur.set * Math.PI) / 180);
        y += cur.kn * Math.cos((cur.set * Math.PI) / 180);
        any = true;
    }
    if (wx && wx.windKn != null && wx.windDir != null && leewayPct > 0) {
        const k = (wx.windKn * leewayPct) / 100;
        const to = ((wx.windDir + 180 + angleDeg) * Math.PI) / 180;
        x += k * Math.sin(to);
        y += k * Math.cos(to);
        any = true;
    }
    if (!any) return null;
    return { kn: Math.hypot(x, y), toward: norm360((Math.atan2(x, y) * 180) / Math.PI) };
}

// ---------- Simulation ----------

export interface Env {
    /** Weather at a place and time (null = none) */
    wx(pos: { lat: number; lon: number }, t: number): WxPoint | null;
    /** Current at a place and time (null = none / not used) */
    current(pos: { lat: number; lon: number }, t: number): Current | null;
}

export interface LegSpeed {
    legIdx: number;
    /** Speed in calm water: planned (speed mode) or the steady speed that keeps the fixed time (ETA / 📌); on the leg with
     * the present position, averaged with the part already sailed */
    sicw: number;
    /** Steady speed in calm water from here on (the leg with the present position: from the position) */
    sicwAhead?: number;
    rpm: number | null;
    fuelPerDay: number | null;
    outsideTable: boolean;
    avgLossKn: number;
    avgCurAlong: number;
    avgSog: number;
    hours: number;
    fuelT: number | null;
    /** Speed in calm water needed to make the planned speed good over ground */
    sicwToHold: number;
    rpmToHold: number | null;
    holdOutsideTable: boolean;
}

export interface SimResult {
    plan: PlanCalc;
    legs: LegSpeed[];
    totalFuelT: number | null;
    notes: string[];
}

/**
 * Step along the route from ETD (default 30 min steps), applying the weather loss and current at
 * each step, and the planned stops (ship stopped at the waypoint, drifting). Speed mode keeps
 * each leg's speed in calm water; legs timed to a fixed ETA (ETA mode or a fixed waypoint ETA)
 * keep one steady calm-water speed per leg, scaled by trial so the fixed time is kept (the SOG varies).
 */
export function simulate(route: Route, base: PlanCalc, vessel: Vessel, env: Env, stepMin = 30): SimResult {
    const notes: string[] = [];
    if (base.etd == null || base.legs.length === 0) {
        return { plan: base, legs: [], totalFuelT: null, notes };
    }
    const method = lossMethodOf(route);
    const li = method === 'kwon' ? lossInputs(vessel) : null;
    if (method === 'kwon' && !li) notes.push('Weather loss estimate needs LBP, breadth and drafts (⚙ Settings → Ship particulars): using your allowances instead.');
    if (method === 'kwon' && li?.cbTypical) notes.push(`Block coefficient not set: the typical ${li.cb} for this ship type is used.`);
    const leeway = vessel.leewayPct ?? estimateLeeway(vessel).pct;
    const driftAngle = vessel.driftAngleDeg ?? 0;
    const stepH = stepMin / 60;
    const track: TrackPoint[] = [];
    const wps = route.waypoints;
    let t = base.etd;

    const stop = (hours: number, lat: number, lon: number, course: number, legIdx: number) => {
        const end = t + hours * HOUR;
        while (t < end - 1) {
            const p = { lat, lon };
            const drift = driftOf(env.wx(p, t), env.current(p, t), leeway, driftAngle);
            track.push({ t, lat, lon, course, legIdx, stopped: true, sicw: 0, stw: 0, sog: 0, lossKn: 0, curAlong: 0, drift });
            t = Math.min(end, t + stepH * HOUR);
        }
        t = end;
    };

    const fx = base.fix ?? null;
    if (base.delayAtStartH > 0 && !fx) stop(base.delayAtStartH, wps[0].lat, wps[0].lon, base.legs[0].course, -1);

    const legs: LegCalc[] = base.legs.map(l => ({ ...l }));
    const out: LegSpeed[] = [];
    let startLeg = 0;
    if (fx) {
        // Voyage with a present position: the part already sailed is taken at the average rate
        // from ETD to the fix (as in the plan); stepping with weather starts at the fix.
        const t0 = base.etd + base.delayAtStartH * HOUR;
        const rate = fx.alongNm / Math.max(1e-6, (fx.t - t0) / HOUR);
        for (let i = 0; i <= fx.legIdx; i++) {
            const leg = legs[i];
            const until = i === fx.legIdx ? fx.sNm : leg.distNm;
            for (let sNm = 0; sNm < until - 1e-6; sNm += rate * stepH) {
                const p = leg.geom.pointAt(sNm);
                const tt = t0 + ((leg.cumNm - leg.distNm + sNm) / Math.max(1e-6, rate)) * HOUR;
                track.push({ t: tt, lat: p.lat, lon: p.lon, course: p.course, legIdx: i, stopped: false, sicw: rate, stw: rate, sog: rate, lossKn: 0, curAlong: 0 });
            }
            if (i < fx.legIdx) {
                const tv = fromTable(vessel.speedTable, rate);
                out.push({ legIdx: i, sicw: rate, rpm: tv?.rpm ?? null, fuelPerDay: tv?.fuel ?? null, outsideTable: !!tv?.outside, avgLossKn: 0, avgCurAlong: 0, avgSog: rate, hours: leg.hours, fuelT: tv?.fuel != null ? (tv.fuel * leg.hours) / 24 : null, sicwToHold: rate, rpmToHold: tv?.rpm ?? null, holdOutsideTable: !!tv?.outside });
            }
        }
        startLeg = fx.legIdx;
        t = fx.t;
    }
    // One steady calm-water speed (one RPM) per leg, also when a time must be kept (owner, 2026-11-24: "we keep on
    // constant RPM ... we are not gonna change RPM continuously"): before a fixed ETA / 📌 time, the planned calm speeds
    // of the stretch are scaled by one factor, found by trial, so that the stretch arrives on time; the speed over
    // ground then rises and falls with the weather and current (before 0.32 the SOG was held and the RPM varied).
    const legTime = (j: number, s0: number, t0: number, sicw: number): number => {
        const lg = legs[j];
        let ss = s0;
        let tt = t0;
        let g = 0;
        while (ss < lg.distNm - 1e-6 && g++ < 20000) {
            const p = lg.geom.pointAt(ss);
            const loss = li ? weatherLossKn(env.wx(p, tt), p.course, sicw, li) : lg.allowance;
            const sog = Math.max(0.5, sogWithCurrent(Math.max(0.5, sicw - loss), p.course, env.current(p, tt)).sog);
            const dtH = Math.min(stepH, (lg.distNm - ss) / sog);
            ss += sog * dtH;
            tt += dtH * HOUR;
        }
        return tt;
    };
    const calmFor = new Map<number, number>();
    const solveStretch = (i0: number, s0: number, t0: number) => {
        const anchor = legs[i0].anchorMs as number;
        const idx: number[] = [];
        for (let j = i0; j < legs.length && legs[j].targetSog != null && legs[j].anchorMs === anchor; j++) idx.push(j);
        const stopsH = idx.slice(0, -1).reduce((a, j) => a + legs[j].delayAfterH, 0);
        const wantH = (anchor - t0) / HOUR - stopsH;
        const run = (m: number) => {
            let tt = t0;
            idx.forEach((j, k) => {
                tt = legTime(j, k === 0 ? s0 : 0, tt, legs[j].calmSpeed * m);
                if (k < idx.length - 1) tt += legs[j].delayAfterH * HOUR;
            });
            return (tt - t0) / HOUR - stopsH;
        };
        let m = 1;
        if (wantH > 0) {
            // time ≈ 1 / speed: scale by the time ratio, then the secant method to arrive on the second
            let pm: number | null = null;
            let ph = 0;
            for (let it = 0; it < 16; it++) {
                const h = run(m);
                if (!(h > 0) || Math.abs(h - wantH) * 3600 < 1) break;
                let next = m * (h / wantH);
                if (pm != null && Math.abs(h - ph) > 1e-12) next = m - ((h - wantH) * (m - pm)) / (h - ph);
                pm = m;
                ph = h;
                m = Math.min(4, Math.max(0.2, next));
            }
        }
        idx.forEach(j => calmFor.set(j, legs[j].calmSpeed * m));
    };
    for (let i = startLeg; i < legs.length; i++) {
        const leg = legs[i];
        const fromFix = !!fx && i === fx.legIdx;
        if (!fromFix) leg.departMs = t;
        const target = leg.targetSog;
        if (target != null && leg.anchorMs != null && !calmFor.has(i)) solveStretch(i, fromFix ? fx.sNm : 0, t);
        const steady = calmFor.get(i);
        const planned = steady ?? leg.calmSpeed;
        let s = fromFix ? fx.sNm : 0;
        let sumLoss = 0;
        let sumCur = 0;
        let sumSicw = 0;
        let sumH = 0;
        let guard = 0;
        while (s < leg.distNm - 1e-6 && guard++ < 20000) {
            const p = leg.geom.pointAt(s);
            const w = env.wx(p, t);
            const cur = env.current(p, t);
            let sicw: number;
            let loss: number;
            let stw: number;
            if (target != null && steady == null) {
                stw = stwForSog(target, p.course, cur);
                loss = li ? weatherLossKn(w, p.course, stw, li) : leg.allowance;
                sicw = stw + loss;
                if (li) {
                    // loss depends a little on speed: refine once
                    loss = weatherLossKn(w, p.course, sicw, li);
                    sicw = stw + loss;
                }
            } else {
                sicw = planned;
                loss = li ? weatherLossKn(w, p.course, sicw, li) : leg.allowance;
                stw = Math.max(0.5, sicw - loss);
            }
            const g = sogWithCurrent(stw, p.course, cur);
            const sog = Math.max(0.5, g.sog);
            const dtH = Math.min(stepH, (leg.distNm - s) / sog);
            track.push({ t, lat: p.lat, lon: p.lon, course: p.course, legIdx: i, stopped: false, sicw, stw, sog, lossKn: loss, curAlong: g.along });
            sumLoss += loss * dtH;
            sumCur += g.along * dtH;
            sumSicw += sicw * dtH;
            sumH += dtH;
            s += sog * dtH;
            t += dtH * HOUR;
        }
        leg.arriveMs = t;
        leg.hours = sumH;
        // The leg with the present position: the part already sailed (leg start to the fix, at the average rate) counts
        // too, or it would look like a stop and the averages (SOG, fuel) would be wrong (owner's report, 2026-11-24)
        let sailedH = 0;
        let sailedRate = 0;
        if (fromFix) {
            const t0 = (base.etd as number) + base.delayAtStartH * HOUR;
            sailedRate = fx.alongNm / Math.max(1e-6, (fx.t - t0) / HOUR);
            sailedH = fx.sNm / Math.max(1e-6, sailedRate);
        }
        leg.sog = sumH > 0 ? (leg.distNm - (fromFix ? fx.sNm : 0)) / sumH : leg.sog;
        if (fromFix && leg.sog > 0) leg.departMs = (fx.t as number) - (fx.sNm / leg.sog) * HOUR;
        const avgLoss = sumH ? sumLoss / sumH : 0;
        const avgCur = sumH ? sumCur / sumH : 0;
        const sicwUsed = sumH ? sumSicw / sumH : planned;
        leg.stw = sicwUsed - avgLoss;
        const tv = fromTable(vessel.speedTable, sicwUsed);
        const holdSicw = target != null ? sicwUsed : planned + avgLoss - avgCur;
        const hv = fromTable(vessel.speedTable, holdSicw);
        const allH = sumH + sailedH;
        const sv = sailedH > 0 ? fromTable(vessel.speedTable, sailedRate) : null;
        const fuelAhead = tv?.fuel != null ? (tv.fuel * sumH) / 24 : null;
        const fuelSailed = sailedH > 0 ? (sv?.fuel != null ? (sv.fuel * sailedH) / 24 : null) : 0;
        out.push({
            legIdx: i,
            sicw: allH > 0 ? (sicwUsed * sumH + sailedRate * sailedH) / allH : sicwUsed,
            sicwAhead: sicwUsed,
            rpm: tv?.rpm ?? null,
            fuelPerDay: tv?.fuel ?? null,
            outsideTable: !!tv?.outside,
            avgLossKn: allH > 0 ? (avgLoss * sumH) / allH : avgLoss,
            avgCurAlong: allH > 0 ? (avgCur * sumH) / allH : avgCur,
            avgSog: allH > 0 && sailedH > 0 ? leg.distNm / allH : leg.sog,
            hours: allH,
            fuelT: fuelAhead != null && fuelSailed != null ? fuelAhead + fuelSailed : null,
            sicwToHold: holdSicw,
            rpmToHold: hv?.rpm ?? null,
            holdOutsideTable: !!hv?.outside,
        });
        if (leg.delayAfterH > 0) {
            const end = leg.geom.pointAt(leg.distNm);
            stop(leg.delayAfterH, end.lat, end.lon, legs[i + 1]?.course ?? leg.course, i);
        }
    }
    const last = legs[legs.length - 1];
    const endP = last.geom.pointAt(last.distNm);
    track.push({ t: last.arriveMs as number, lat: endP.lat, lon: endP.lon, course: endP.course, legIdx: legs.length - 1, stopped: false, sicw: 0, stw: 0, sog: 0, lossKn: 0, curAlong: 0 });
    track.sort((a, b) => a.t - b.t);

    const fuels = out.map(l => l.fuelT);
    const totalFuelT = fuels.every(f => f != null) && fuels.length ? fuels.reduce((a, b) => a + (b as number), 0) : null;
    if (out.some(l => l.outsideTable || l.holdOutsideTable)) notes.push('Some speeds are outside your RPM/speed table: RPM and fuel are extrapolated.');
    // RPM the ship cannot run at (barred range, above the max, below the min): the RPM advised instead (owner, 2026-11-23)
    for (const l of out) {
        const wp = `WP${l.legIdx + 1}→${l.legIdx + 2}`;
        const a = rpmAdviceText(vessel, l.rpm, 'planned');
        if (a) notes.push(`${wp}: ${a}`);
        const h = l.rpmToHold != null && Math.round(l.rpmToHold) !== Math.round(l.rpm ?? -1) ? rpmAdviceText(vessel, l.rpmToHold, `needed to hold the ${legs[l.legIdx]?.targetSog != null ? 'ETA' : 'planned speed'} in this weather`) : '';
        if (h) notes.push(`${wp}: ${h}`);
    }
    if (method === 'kwon' && li) notes.push('Weather loss is estimated from the forecast wind and waves (Kwon method, as published in later papers): a rough figure for a typical hull, not your ship\'s own data. Compare it with your experience; to type your own allowance per leg instead: ⚙ Speed, RPM and fuel → Weather loss.');
    if (method === 'manual' && out.every(l => Math.abs(l.avgLossKn) < 1e-9)) notes.push('Weather loss is 0: your allowance per leg is 0, so speed through the water = speed in calm water. For an estimate from the forecast: ⚙ Speed, RPM and fuel → Weather loss → estimate from the forecast.');
    const plan: PlanCalc = {
        ...base,
        legs,
        totalHours: out.reduce((a, l) => a + l.hours, 0),
        fix: fx,
        eta: last.arriveMs,
        track,
    };
    return { plan, legs: out, totalFuelT, notes };
}
