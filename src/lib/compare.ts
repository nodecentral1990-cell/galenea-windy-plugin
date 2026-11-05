// Route comparison: run each route through the same planning (speeds, fixed ETAs, weather loss,
// currents) and sum up what matters for choosing between them.

import { checkWaveSystem } from './circ1228';
import { computePlan, engineSpeedFromRpm, type Route, type Vessel } from './model';
import { simulate, type Env } from './speed';
import { checkLimits, rollPeriodFor, waveSystems, type Thresholds } from './weather';

const HOUR = 3600e3;

/** Wind speed counted as "gale" in the comparison (Beaufort 8 starts at 34 kn). */
export const GALE_KN = 34;

export interface RouteSummary {
    name: string;
    distNm: number;
    etd: number | null;
    eta: number | null;
    /** Steaming + planned stops, hours */
    totalH: number;
    steamingH: number;
    stoppedH: number;
    avgSog: number | null;
    /** Average speed in calm water used (time-weighted) */
    avgSicw: number | null;
    avgRpm: number | null;
    fuelT: number | null;
    /** Average slip %, from RPM × pitch (or the 0-slip speed typed per leg) against the speed through water */
    avgSlipPct: number | null;
    /** Average weather factor, kn: minus the average weather speed loss */
    avgWxKn: number | null;
    /** First and last waypoint */
    dep: { lat: number; lon: number } | null;
    arr: { lat: number; lon: number } | null;
    /** Average current along the track, kn (+ = helping, − = against) */
    avgCurrentKn: number | null;
    /** Hours with wind over GALE_KN */
    galeH: number;
    /** Hours with wind over the owner's wind limit (⚙ Settings → Weather limits, red) */
    windLimitH: number;
    /** Hours with waves (Hs, seas or swell) over the owner's limits (⚙ Settings → Weather limits, red) */
    waveLimitH: number;
    /** Hours with an IMO MSC.1/Circ.1228 warning */
    imoH: number;
    /** Share of the voyage time that had forecast data (0–1) */
    wxCover: number;
    problems: string[];
}

export interface CompareOptions {
    /** Use this ETD instead of each route's own (null = keep each route's ETD) */
    etd?: number | null;
}

/** Plan one route with the given weather/current and add up the comparison figures. */
export function summarize(route: Route, vessel: Vessel, th: Thresholds, env: Env, opts: CompareOptions = {}): RouteSummary {
    const r: Route = opts.etd != null ? { ...route, etd: opts.etd } : route;
    const base = computePlan(r, vessel);
    const sim = simulate(r, base, vessel, env);
    const plan = sim.plan;
    const out: RouteSummary = {
        name: r.name,
        distNm: plan.totalNm,
        etd: plan.etd,
        eta: plan.eta,
        totalH: 0,
        steamingH: 0,
        stoppedH: 0,
        avgSog: null,
        avgSicw: null,
        avgRpm: null,
        fuelT: sim.totalFuelT,
        avgSlipPct: null,
        avgCurrentKn: null,
        avgWxKn: null,
        dep: r.waypoints[0] ? { lat: r.waypoints[0].lat, lon: r.waypoints[0].lon } : null,
        arr: r.waypoints.length ? { lat: r.waypoints[r.waypoints.length - 1].lat, lon: r.waypoints[r.waypoints.length - 1].lon } : null,
        galeH: 0,
        windLimitH: 0,
        waveLimitH: 0,
        imoH: 0,
        wxCover: 0,
        problems: [...plan.problems],
    };
    if (plan.etd == null || plan.eta == null || !plan.legs.length) {
        if (plan.etd == null) out.problems.push('No ETD.');
        return out;
    }
    out.totalH = (plan.eta - plan.etd) / HOUR;
    out.steamingH = sim.legs.reduce((s, l) => s + l.hours, 0);
    out.stoppedH = Math.max(0, out.totalH - out.steamingH);
    out.avgSog = out.steamingH > 0 ? plan.totalNm / out.steamingH : null;

    // Time-weighted leg averages
    let wSicw = 0;
    let wRpm = 0;
    let hRpm = 0;
    let wSlip = 0;
    let hSlip = 0;
    let wCur = 0;
    let wWx = 0;
    sim.legs.forEach((l, i) => {
        wSicw += l.sicw * l.hours;
        wCur += l.avgCurAlong * l.hours;
        wWx += l.avgLossKn * l.hours;
        const wp = r.waypoints[plan.legs[i].index];
        const rpm = wp.rpm ?? l.rpm;
        if (rpm != null) {
            wRpm += rpm * l.hours;
            hRpm += l.hours;
        }
        const eng = wp.engineSpeed ?? engineSpeedFromRpm(rpm, vessel.pitch);
        const stw = l.sicw - l.avgLossKn;
        if (eng && eng > 0) {
            wSlip += ((eng - stw) / eng) * 100 * l.hours;
            hSlip += l.hours;
        }
    });
    if (out.steamingH > 0) {
        out.avgSicw = wSicw / out.steamingH;
        out.avgCurrentKn = wCur / out.steamingH;
        out.avgWxKn = -wWx / out.steamingH;
    }
    out.avgRpm = hRpm > 0 ? wRpm / hRpm : null;
    out.avgSlipPct = hSlip > 0 ? wSlip / hSlip : null;

    // Weather exposure along the stepped track (stops included: the ship is still out there)
    const roll = rollPeriodFor(vessel).value;
    const tr = plan.track ?? [];
    let covered = 0;
    for (let i = 0; i < tr.length - 1; i++) {
        const p = tr[i];
        const dtH = (tr[i + 1].t - p.t) / HOUR;
        if (!(dtH > 0)) continue;
        const wx = env.wx(p, p.t);
        if (!wx) continue;
        covered += dtH;
        if (wx.windKn != null && wx.windKn > GALE_KN) out.galeH += dtH;
        const hits = checkLimits(wx, p.course, th).filter(h => h.level === 2);
        if (hits.some(h => h.what === 'Wind')) out.windLimitH += dtH;
        if (hits.some(h => ['SWH', 'Sea', 'Swell 1', 'Swell 2'].includes(h.what))) out.waveLimitH += dtH;
        const imo = waveSystems(wx).some(ws => checkWaveSystem(ws, { headingDeg: p.course, speedKn: p.stopped ? 0 : p.stw, lbp: vessel.lbp, rollPeriod: roll }, th.resonance).length > 0);
        if (imo) out.imoH += dtH;
    }
    out.wxCover = out.totalH > 0 ? Math.min(1, covered / out.totalH) : 0;
    return out;
}

/** "2D 05H" (days and hours, rounded to the hour) */
export function fmtDH(hours: number): string {
    const h = Math.round(hours);
    return `${Math.floor(h / 24)}D ${String(h % 24).padStart(2, '0')}H`;
}
