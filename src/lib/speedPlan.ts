// Safe speed plan (owner, 2026-10-30): keep the planned TRACK and avoid the weather the user chose
// (e.g. waves only) by changing SPEED: slow down, speed up, or stop and drift in open water until it
// has passed. Speeds come only from the owner's RPM / speed table, never from a barred RPM range.
// Meant to help (newly promoted) masters see the options and the reasons. AID ONLY.
//
// Method: dynamic programming over time (decision every `stepH` hours, weather read every hour) and
// distance along the track. State = distance sailed at a decision time; each step picks one of the
// allowed speeds (or "stop"). A step that meets a chosen limit is ruled out ("hard"); if no plan
// avoids everything, the plan with the fewest hours inside the limits is given instead ("soft").
// Among the plans left: arrive by the wanted time with the least fuel, else as early as possible.
// Pure logic: weather, hazards and land come in through callbacks (tests run it without Windy).

import { rhumbDirect, type LatLon } from './geo';
import { newWaypoint, type PlanCalc, type Route, type Vessel, type Waypoint } from './model';
import { barredRange, sicwForRpm } from './speed';
import { defaultSpeeds, fuelPerDay } from './optimise';
import type { Level, WxPoint } from './weather';

const HOUR = 3600_000;

export interface TrackFn {
    totalNm: number;
    /** Position and course on the planned track at a distance from WP1, nm */
    at(sNm: number): LatLon & { course: number };
}

export interface SpeedOption {
    /** Speed in calm water, kn */
    sicw: number;
    rpm: number | null;
    /** t/day (or relative units when the table has no fuel) */
    fuelPerDay: number;
}

export interface Hazard {
    /** e.g. 'Swell 1', 'Wind', 'IMO' */
    what: string;
    level: Level;
    detail: string;
}

export interface SpeedPlanInput {
    track: TrackFn;
    /** Where and when the plan starts (WP1 at ETD, or the present position) */
    startNm: number;
    startMs: number;
    /** Wanted arrival (UTC ms); null = as early as possible */
    arriveBy: number | null;
    /** Accepted lateness after `arriveBy`, hours (default 1) */
    toleranceH?: number;
    /** The user's planned calm-water speed at a distance (for the comparison and the reasons) */
    plannedSicwAt(sNm: number): number;
    /** Allowed speeds (barred RPM already taken out), slowest first */
    options: SpeedOption[];
    /** Stopping and drifting allowed, and where (e.g. far enough from land) */
    allowStop: boolean;
    canStopAt?(lat: number, lon: number): boolean;
    /** Fuel when stopped, t/day (null = not counted, as elsewhere in the plugin) */
    stopFuelPerDay: number | null;
    wxAt(lat: number, lon: number, t: number): WxPoint | null;
    /** Weather speed loss, kn */
    lossKn(wx: WxPoint | null, course: number, sicw: number, sNm: number): number;
    /** What the user wants to avoid, met at this place with this heading and speed through water */
    hazards(wx: WxPoint, headingDeg: number, stwKn: number, stopped: boolean): Hazard[];
    /** 2 = avoid the red limits only; 1 = also the amber alerts */
    avoidLevel: 1 | 2;
    /** Hours between speed decisions (default 3) */
    stepH?: number;
}

export interface PlanSegment {
    action: 'go' | 'stop';
    sicw: number;
    rpm: number | null;
    fromMs: number;
    toMs: number;
    fromNm: number;
    toNm: number;
    from: LatLon;
    to: LatLon;
    fuel: number;
    /** Hours inside a chosen limit on this segment (0 in a hard plan) */
    badH: number;
    /** Planned speed here (for "slower / faster than planned") */
    plannedSicw: number;
    /** Plain-language reason for the choice */
    why: string;
}

export interface WeatherEvent {
    fromMs: number;
    toMs: number;
    from: LatLon;
    kinds: string[];
    worst: Hazard;
}

export interface PlanSummary {
    eta: number;
    fuel: number;
    badH: number;
    hours: number;
    events: WeatherEvent[];
}

export interface SpeedPlanResult {
    ok: boolean;
    /** 'hard' = no chosen limit met; 'soft' = could not avoid everything (fewest hours inside) */
    mode: 'hard' | 'soft';
    segments: PlanSegment[];
    safe: PlanSummary | null;
    planned: PlanSummary;
    notes: string[];
    stats: { steps: number; labels: number; ms: number };
}

interface Label {
    s: number;
    cost: number;
    fuel: number;
    badH: number;
    choice: number; // index in options, -1 = stop
    prev: Label | null;
    k: number;
    arriveMs?: number;
}

const STOP = -1;

/** Work out the speed plan. */
export function speedPlan(inp: SpeedPlanInput): SpeedPlanResult {
    const t0 = Date.now();
    const notes: string[] = [];
    const stepH = Math.max(1, Math.round(inp.stepH ?? 3));
    const S = inp.track.totalNm;
    const togo = Math.max(0, S - inp.startNm);
    const opts = [...inp.options].filter(o => o.sicw > 0).sort((a, b) => a.sicw - b.sicw);
    const planned = sailPlanned(inp);
    if (!opts.length || togo < 0.5) {
        if (!opts.length) notes.push('No speeds to choose from: fill in the RPM / speed / fuel table (⚙ Settings → Speed, RPM and fuel).');
        return { ok: false, mode: 'hard', segments: [], safe: null, planned, notes, stats: { steps: 0, labels: 0, ms: Date.now() - t0 } };
    }
    const cellNm = Math.max(1, togo / 500);
    const wxCache = new Map<string, WxPoint | null>();
    const hzCache = new Map<string, Hazard[]>();
    const stopCache = new Map<number, boolean>();
    const wxAt = (sNm: number, t: number) => {
        const c = Math.round(sNm / 5);
        const key = `${Math.round(t / HOUR)}|${c}`;
        if (!wxCache.has(key)) {
            // read at the middle of the 5 nm cell, so the same cell always gives the same weather
            const p = inp.track.at(Math.max(0, Math.min(S, c * 5)));
            wxCache.set(key, inp.wxAt(p.lat, p.lon, t));
        }
        return wxCache.get(key) ?? null;
    };
    const badAt = (sNm: number, t: number, choice: number, stw: number): Hazard[] => {
        const wx = wxAt(sNm, t);
        if (!wx) return [];
        const key = `${Math.round(t / HOUR)}|${Math.round(sNm / 5)}|${choice}`;
        let h = hzCache.get(key);
        if (!h) {
            const p = inp.track.at(Math.min(S, sNm));
            // stopped and drifting: the ship lies about beam-on to the wind (conservative for the checks)
            const heading = choice === STOP ? ((wx.windDir ?? p.course) + 90) % 360 : p.course;
            h = inp.hazards(wx, heading, stw, choice === STOP).filter(x => x.level >= inp.avoidLevel);
            hzCache.set(key, h);
        }
        return h;
    };
    const canStop = (sNm: number) => {
        if (!inp.allowStop) return false;
        const c = Math.round(sNm / 5);
        if (!stopCache.has(c)) {
            const p = inp.track.at(Math.min(S, sNm));
            stopCache.set(c, inp.canStopAt ? inp.canStopAt(p.lat, p.lon) : true);
        }
        return stopCache.get(c) as boolean;
    };

    /** Sail one decision step from s at t with a choice; null when not allowed */
    const step = (s: number, t: number, choice: number, hard: boolean) => {
        if (choice === STOP && !canStop(s)) return null;
        let fuel = 0;
        let bad = 0;
        let pos = s;
        for (let h = 0; h < stepH; h++) {
            const tt = t + h * HOUR;
            if (choice === STOP) {
                if (badAt(pos, tt, STOP, 0).length) {
                    if (hard) return null;
                    bad += 1;
                }
                fuel += (inp.stopFuelPerDay ?? 0) / 24;
                continue;
            }
            const o = opts[choice];
            const p = inp.track.at(Math.min(S, pos));
            const wx = wxAt(pos, tt);
            const stw = Math.max(0.5, o.sicw - Math.max(0, inp.lossKn(wx, p.course, o.sicw, pos)));
            const frac = Math.min(1, (S - pos) / stw);
            // weather checked where the ship is at the start and in the middle of the hour
            const mid = pos + (stw * frac) / 2;
            if (badAt(pos, tt, choice, stw).length || badAt(mid, tt + (frac * HOUR) / 2, choice, stw).length) {
                if (hard) return null;
                bad += frac;
            }
            fuel += (o.fuelPerDay * frac) / 24;
            pos += stw * frac;
            if (pos >= S - 1e-6) return { s: S, fuel, bad, arriveMs: tt + frac * HOUR };
        }
        return { s: pos, fuel, bad, arriveMs: undefined as number | undefined };
    };

    const maxFuelH = Math.max(...opts.map(o => o.fuelPerDay)) / 24;
    const changePenalty = maxFuelH * 0.5;
    const stopPenalty = maxFuelH * 0.05 * stepH;
    const plannedH = planned.hours;
    const wantH = inp.arriveBy != null ? (inp.arriveBy - inp.startMs) / HOUR : plannedH;
    const horizonH = Math.min(45 * 24, Math.max(plannedH * 2, wantH + 72, togo / opts[opts.length - 1].sicw + 72));
    const maxSteps = Math.ceil(horizonH / stepH);
    const tol = (inp.toleranceH ?? 1) * HOUR;

    let labelsSeen = 0;
    let stepsRun = 0;
    const run = (hard: boolean): Label[] => {
        let cur = new Map<number, Label>();
        cur.set(Math.floor(inp.startNm / cellNm), { s: inp.startNm, cost: 0, fuel: 0, badH: 0, choice: NaN, prev: null, k: 0 });
        const arrivals: Label[] = [];
        let firstArr = Infinity;
        for (let k = 0; k < maxSteps && cur.size; k++) {
            stepsRun++;
            const t = inp.startMs + k * stepH * HOUR;
            if (arrivals.length) {
                const doneBy = inp.arriveBy != null ? Math.max(inp.arriveBy + tol, firstArr) : firstArr;
                if (t > doneBy + 2 * HOUR) break;
            }
            const next = new Map<number, Label>();
            for (const L of cur.values()) {
                for (let c = STOP; c < opts.length; c++) {
                    const r = step(L.s, t, c, hard);
                    if (!r) continue;
                    let cost = L.cost + r.fuel + (hard ? 0 : r.bad * 1000);
                    if (!Number.isNaN(L.choice) && L.choice !== c) cost += changePenalty;
                    if (c === STOP) cost += stopPenalty;
                    const lab: Label = { s: r.s, cost, fuel: L.fuel + r.fuel, badH: L.badH + r.bad, choice: c, prev: L, k: k + 1, arriveMs: r.arriveMs };
                    labelsSeen++;
                    if (r.arriveMs != null) {
                        arrivals.push(lab);
                        firstArr = Math.min(firstArr, r.arriveMs);
                        continue;
                    }
                    const cell = Math.floor(r.s / cellNm);
                    const old = next.get(cell);
                    if (!old || cost < old.cost - 1e-9 || (Math.abs(cost - old.cost) <= 1e-9 && r.s > old.s)) next.set(cell, lab);
                }
            }
            cur = next;
        }
        return arrivals;
    };

    const choose = (arr: Label[]): Label | null => {
        if (!arr.length) return null;
        const byCost = (a: Label, b: Label) => a.cost - b.cost;
        if (inp.arriveBy != null) {
            const inTime = arr.filter(a => (a.arriveMs as number) <= (inp.arriveBy as number) + tol);
            if (inTime.length) return inTime.sort(byCost)[0];
        }
        const first = Math.min(...arr.map(a => a.arriveMs as number));
        const near = arr.filter(a => (a.arriveMs as number) <= first + (inp.arriveBy != null ? 2 : 1) * HOUR);
        return near.sort(byCost)[0];
    };

    let mode: 'hard' | 'soft' = 'hard';
    let best = choose(run(true));
    if (!best) {
        mode = 'soft';
        best = choose(run(false));
        notes.push('No speed plan keeps out of all the weather you chose to avoid: this is the plan with the fewest hours inside your limits. Consider another route (⚡ Optimise route) or a shelter.');
    }
    if (!best) {
        notes.push('No plan reaches the destination within the time looked at.');
        return { ok: false, mode, segments: [], safe: null, planned, notes, stats: { steps: stepsRun, labels: labelsSeen, ms: Date.now() - t0 } };
    }
    if (inp.arriveBy != null && (best.arriveMs as number) > inp.arriveBy + tol) {
        notes.push(`Cannot arrive by the wanted time and keep out of the chosen weather: earliest safe arrival is later (see ETA).`);
    }

    // back to front: the choice made at each decision step
    const chain: Label[] = [];
    for (let L: Label | null = best; L && L.prev; L = L.prev) chain.unshift(L);
    const segments: PlanSegment[] = [];
    let sPrev = inp.startNm;
    let fuelPrev = 0;
    let badPrev = 0;
    chain.forEach((L, i) => {
        const fromMs = inp.startMs + i * stepH * HOUR;
        const toMs = L.arriveMs ?? inp.startMs + L.k * stepH * HOUR;
        const last = segments[segments.length - 1];
        const o = L.choice === STOP ? null : opts[L.choice];
        const fuel = L.fuel - fuelPrev;
        const bad = L.badH - badPrev;
        if (last && ((last.action === 'stop' && L.choice === STOP) || (o && last.action === 'go' && last.sicw === o.sicw))) {
            last.toMs = toMs;
            last.toNm = L.s;
            last.to = inp.track.at(Math.min(S, L.s));
            last.fuel += fuel;
            last.badH += bad;
        } else {
            segments.push({
                action: o ? 'go' : 'stop',
                sicw: o ? o.sicw : 0,
                rpm: o ? o.rpm : null,
                fromMs,
                toMs,
                fromNm: sPrev,
                toNm: L.s,
                from: inp.track.at(Math.min(S, sPrev)),
                to: inp.track.at(Math.min(S, L.s)),
                fuel,
                badH: bad,
                plannedSicw: inp.plannedSicwAt(Math.min(S, sPrev)),
                why: '',
            });
        }
        sPrev = L.s;
        fuelPrev = L.fuel;
        badPrev = L.badH;
    });
    segments.forEach((seg, i) => (seg.why = reasonFor(inp, seg, segments.slice(0, i), wxAt, badAt)));
    const eta = best.arriveMs as number;
    const safe: PlanSummary = { eta, fuel: best.fuel, badH: best.badH, hours: (eta - inp.startMs) / HOUR, events: [] };
    return { ok: true, mode, segments, safe, planned, notes, stats: { steps: stepsRun, labels: labelsSeen, ms: Date.now() - t0 } };
}

/** The user's plan sailed hour by hour (no stops), with the weather events met on the way. */
export function sailPlanned(inp: SpeedPlanInput): PlanSummary {
    const S = inp.track.totalNm;
    let s = inp.startNm;
    let t = inp.startMs;
    let fuel = 0;
    let bad = 0;
    const events: WeatherEvent[] = [];
    let open: WeatherEvent | null = null;
    const fpd = (sicw: number) => {
        // fuel at the planned speed: interpolate between the options (they come from the same table)
        const o = inp.options;
        if (!o.length) return 0;
        if (sicw <= o[0].sicw) return o[0].fuelPerDay;
        for (let i = 1; i < o.length; i++) if (o[i].sicw >= sicw) return o[i - 1].fuelPerDay + ((o[i].fuelPerDay - o[i - 1].fuelPerDay) * (sicw - o[i - 1].sicw)) / (o[i].sicw - o[i - 1].sicw || 1);
        return o[o.length - 1].fuelPerDay;
    };
    for (let n = 0; n < 45 * 24 && s < S - 1e-6; n++) {
        const p = inp.track.at(s);
        const sicw = inp.plannedSicwAt(s);
        const wx = inp.wxAt(p.lat, p.lon, t);
        const stw = Math.max(0.5, sicw - Math.max(0, inp.lossKn(wx, p.course, sicw, s)));
        const frac = Math.min(1, (S - s) / stw);
        const hz = wx ? inp.hazards(wx, p.course, stw, false).filter(x => x.level >= inp.avoidLevel) : [];
        if (hz.length) {
            bad += frac;
            const worst = hz.reduce((a, b) => (b.level > a.level ? b : a));
            if (open && open.toMs >= t - 1) {
                open.toMs = t + frac * HOUR;
                for (const h of hz) if (!open.kinds.includes(h.what)) open.kinds.push(h.what);
                if (worst.level > open.worst.level) open.worst = worst;
            } else {
                open = { fromMs: t, toMs: t + frac * HOUR, from: { lat: p.lat, lon: p.lon }, kinds: hz.map(h => h.what), worst };
                events.push(open);
            }
        } else open = null;
        fuel += (fpd(sicw) * frac) / 24;
        s += stw * frac;
        t += frac * HOUR;
    }
    return { eta: t, fuel, badH: bad, hours: (t - inp.startMs) / HOUR, events };
}

/**
 * Why this segment: sail on at the planned speed from where it starts and see what would be met
 * (within 48 h); then say how the choice deals with it.
 */
function reasonFor(
    inp: SpeedPlanInput,
    seg: PlanSegment,
    before: PlanSegment[],
    wxAt: (s: number, t: number) => WxPoint | null,
    badAt: (s: number, t: number, choice: number, stw: number) => Hazard[],
): string {
    const S = inp.track.totalNm;
    const v = seg.plannedSicw;
    let s = seg.fromNm;
    let t = seg.fromMs;
    let met: { h: Hazard; t: number; p: LatLon } | null = null;
    for (let n = 0; n < 48 && s < S - 1e-6; n++) {
        const p = inp.track.at(s);
        const wx = wxAt(s, t);
        const stw = Math.max(0.5, v - Math.max(0, inp.lossKn(wx, p.course, v, s)));
        const hz = badAt(s, t, -2, stw);
        if (hz.length) {
            met = { h: hz.reduce((a, b) => (b.level > a.level ? b : a)), t, p };
            break;
        }
        s += stw;
        t += HOUR;
    }
    const metTxt = met ? `at the planned ${v.toFixed(1)} kn you would meet ${met.h.detail} on ${fmtShort(met.t)} UTC near ${fmtPos(met.p)}` : '';
    const caughtUp = before.some(b => b.action === 'stop' || b.sicw < b.plannedSicw - 0.3);
    const still = seg.badH > 0.05 ? ` Still about ${Math.max(1, Math.round(seg.badH))} h in the weather you chose to avoid on this part: speed alone cannot avoid it.` : '';
    return reasonCore() + still;
    function reasonCore(): string {
    if (seg.action === 'stop') return met ? `Stop and drift: ${metTxt}. ${seg.badH > 0.05 ? 'Waiting here keeps you out of the worst of it.' : 'Waiting here lets it pass ahead of you.'}` : 'Stop and drift: the weather ahead on the track is worse than here for the next hours.';
    const d = seg.sicw - v;
    if (d < -0.3) return met ? `Slower: ${metTxt}. At ${seg.sicw.toFixed(1)} kn ${seg.badH > 0.05 ? 'it is weaker when you get there' : 'it passes or eases before you get there'}.` : 'Slower: there is time in hand, so less fuel is used.';
    if (d > 0.3) {
        if (met) return `Faster: ${metTxt}. At ${seg.sicw.toFixed(1)} kn ${seg.badH > 0.05 ? 'you spend less time in it' : 'you get past before it arrives'}.`;
        return caughtUp ? 'Faster: makes up the time lost waiting / slowing down.' : 'Faster: keeps the arrival time.';
    }
    return met ? `As planned: ${metTxt}, but later choices deal with it.` : 'As planned: nothing to avoid here.';
    }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');
function fmtShort(ms: number): string {
    const d = new Date(ms);
    return `${p2(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
function fmtPos(p: LatLon): string {
    const la = `${Math.abs(p.lat).toFixed(1)}°${p.lat < 0 ? 'S' : 'N'}`;
    const lo = `${Math.abs(p.lon).toFixed(1).padStart(5, '0')}°${p.lon < 0 ? 'W' : 'E'}`;
    return `${la} ${lo}`;
}

// ---------- Helpers for the plugin ----------


/**
 * Speeds the plan may use: RPM steps across the owner's table (about 12, plus every table row),
 * without the barred RPM ranges. Tables without RPM: speeds across the table in 0.5–1 kn steps.
 */
export function speedOptions(vessel: Vessel, plannedSicw?: number): { options: SpeedOption[]; barredLeftOut: number } {
    const table = vessel.speedTable ?? [];
    const rpms = table.filter(r => r.rpm != null && r.sicw != null && isFinite(r.rpm) && isFinite(r.sicw)).map(r => r.rpm as number);
    let barredLeftOut = 0;
    const out: SpeedOption[] = [];
    const add = (sicw: number | null, rpm: number | null) => {
        if (sicw == null || !(sicw > 0)) return;
        if (rpm != null && barredRange(vessel, rpm)) {
            barredLeftOut++;
            return;
        }
        if (out.some(o => Math.abs(o.sicw - sicw) < 0.15)) return;
        out.push({ sicw: Math.round(sicw * 100) / 100, rpm: rpm != null ? Math.round(rpm) : null, fuelPerDay: fuelPerDay(table, sicw).fuel });
    };
    if (rpms.length >= 2) {
        const lo = Math.min(...rpms);
        const hi = Math.max(...rpms);
        const step = Math.max(1, Math.round((hi - lo) / 12));
        for (const r of rpms) add(sicwForRpm(table, r), r);
        for (let r = lo; r <= hi + 1e-9; r += step) add(sicwForRpm(table, Math.round(r)), Math.round(r));
    } else {
        for (const v of defaultSpeeds(table, plannedSicw)) add(v, null);
    }
    return { options: out.sort((a, b) => a.sicw - b.sicw), barredLeftOut };
}

/** True when no land (per `isLand`) lies within `nm` of the position (checked on two rings of 8 points). */
export function farFromLand(lat: number, lon: number, nm: number, isLand: (lat: number, lon: number) => boolean): boolean {
    if (isLand(lat, lon)) return false;
    for (const r of [nm / 2, nm]) {
        for (let b = 0; b < 360; b += 45) {
            const p = rhumbDirect({ lat, lon }, b, r);
            if (isLand(p.lat, p.lon)) return false;
        }
    }
    return true;
}

/** The planned track as a function of the distance from WP1 */
export function trackOf(p: PlanCalc): TrackFn {
    return {
        totalNm: p.totalNm,
        at(s: number) {
            const legs = p.legs;
            let i = legs.findIndex(l => l.cumNm >= s - 1e-9);
            if (i < 0) i = legs.length - 1;
            const l = legs[i];
            const q = l.geom.pointAt(Math.max(0, Math.min(l.distNm, s - (l.cumNm - l.distNm))));
            return { lat: q.lat, lon: q.lon, course: q.course };
        },
    };
}

/**
 * The route with the plan in it: a waypoint wherever the speed changes or the ship stops (an
 * existing waypoint within 2 nm is used instead), each leg's speed from the plan, stops as waypoint
 * stops. Legs already sailed stay as they are; fixed ETAs and planned stops after the start are cleared.
 */
export function applySpeedPlan(r: Route, p: PlanCalc, segs: PlanSegment[], startNm: number): Waypoint[] {
    const track = trackOf(p);
    const cum = [0, ...p.legs.map(l => l.cumNm)];
    const wps = r.waypoints.map(w => ({ ...w }));
    type Pt = { s: number; wp: Waypoint };
    const pts: Pt[] = wps.map((w, i) => ({ s: cum[i] ?? 0, wp: w }));
    const end = p.totalNm;
    const stopAt = new Map<Waypoint, number>();
    const ensure = (s: number, name: string): Waypoint => {
        const near = pts.find(q => Math.abs(q.s - s) < 2);
        if (near) return near.wp;
        const q = track.at(s);
        const k = pts.findIndex(x => x.s > s);
        const next = pts[k].wp;
        const wp = newWaypoint(q.lat, q.lon, next.legType, name);
        wp.allowance = next.allowance;
        pts.splice(k, 0, { s, wp });
        return wp;
    };
    for (const seg of segs) {
        if (seg.fromNm > startNm + 0.5 && seg.fromNm < end - 2) ensure(seg.fromNm, seg.action === 'stop' ? `Wait ${Math.round((seg.toMs - seg.fromMs) / 3600_000)} h` : `${seg.sicw.toFixed(1)} kn`);
        if (seg.action === 'stop') {
            const w = ensure(Math.max(startNm, seg.fromNm), `Wait ${Math.round((seg.toMs - seg.fromMs) / 3600_000)} h`);
            stopAt.set(w, (stopAt.get(w) ?? 0) + (seg.toMs - seg.fromMs) / 3600_000);
        }
    }
    const goAt = (s: number) => segs.find(g => g.action === 'go' && s >= g.fromNm - 1e-6 && s <= g.toNm + 1e-6) ?? segs.filter(g => g.action === 'go').pop();
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1].s;
        const b = pts[i].s;
        if (b <= startNm + 1e-6) continue;
        const g = goAt((Math.max(a, startNm) + b) / 2);
        if (g) {
            pts[i].wp.speed = g.sicw;
            pts[i].wp.rpm = g.rpm;
        }
        pts[i].wp.fixedEta = null;
        pts[i].wp.delayH = null;
    }
    for (const [w, h] of stopAt) w.delayH = Math.round(h * 10) / 10;
    return pts.map(q => q.wp);
}

