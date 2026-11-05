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
import type { BarredRpm, LegCalc, PlanCalc, Route, SpeedRow, TrackPoint, Vessel } from './model';
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
    /** Planned speed in calm water (speed mode) or the average needed (ETA mode) */
    sicw: number;
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
 * adjust it to hold the required speed over ground.
 */
export function simulate(route: Route, base: PlanCalc, vessel: Vessel, env: Env, stepMin = 30): SimResult {
    const notes: string[] = [];
    if (base.etd == null || base.legs.length === 0) {
        return { plan: base, legs: [], totalFuelT: null, notes };
    }
    const method = route.lossMethod ?? 'manual';
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
    for (let i = startLeg; i < legs.length; i++) {
        const leg = legs[i];
        const fromFix = !!fx && i === fx.legIdx;
        if (!fromFix) leg.departMs = t;
        const target = leg.targetSog;
        const planned = leg.calmSpeed;
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
            if (target != null) {
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
        leg.sog = sumH > 0 ? (leg.distNm - (fromFix ? fx.sNm : 0)) / sumH : leg.sog;
        if (fromFix && leg.sog > 0) leg.departMs = (fx.t as number) - (fx.sNm / leg.sog) * HOUR;
        const avgLoss = sumH ? sumLoss / sumH : 0;
        const avgCur = sumH ? sumCur / sumH : 0;
        const sicwUsed = sumH ? sumSicw / sumH : planned;
        leg.stw = sicwUsed - avgLoss;
        const tv = fromTable(vessel.speedTable, sicwUsed);
        const holdSicw = target != null ? sicwUsed : planned + avgLoss - avgCur;
        const hv = fromTable(vessel.speedTable, holdSicw);
        out.push({
            legIdx: i,
            sicw: sicwUsed,
            rpm: tv?.rpm ?? null,
            fuelPerDay: tv?.fuel ?? null,
            outsideTable: !!tv?.outside,
            avgLossKn: avgLoss,
            avgCurAlong: avgCur,
            avgSog: leg.sog,
            hours: sumH,
            fuelT: tv?.fuel != null ? (tv.fuel * sumH) / 24 : null,
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
    if (method === 'kwon' && li) notes.push('Weather loss: Kwon estimate. Its coefficients have not yet been checked against the original paper: treat as rough.');
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
