// Safe speed and course plan (owner, 2026-10-30; course alteration added 2026-11-13): avoid the weather the
// user chose (e.g. waves only) by changing SPEED (slow down, speed up, or stop and drift in open water until it
// has passed) and, if allowed, by ALTERING COURSE for a while (e.g. 40° to starboard to take the sea on the bow
// instead of the beam), then coming back to the track. Speeds come only from the owner's RPM / speed table,
// never from a barred RPM range. Meant to help (newly promoted) masters see the options and the reasons. AID ONLY.
//
// Method: dynamic programming over time (decision every `stepH` hours, weather read every hour), distance
// along the track and distance off the track (cross-track, 5 nm cells, + = starboard of the track). Each step
// picks one of the allowed speeds (or "stop") and a heading: the track course, or the track course ± one of
// the allowed alterations. A step that meets a chosen limit is ruled out ("hard"); if no plan avoids
// everything, the plan with the fewest hours inside the limits is given instead ("soft"). The ship must be
// back on the track to arrive. Off-track weather comes from `wxAt` (in the plugin: the nearest forecast point).
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
    /** Course alterations allowed, degrees either side of the track course (e.g. [20, 40, 60]); empty = speed only */
    alterations?: number[];
    /** Furthest off the track, nm (default 60) */
    maxOffNm?: number;
    /** May the ship be here off the track (e.g. far enough from land)? */
    canBeAt?(lat: number, lon: number): boolean;
    /** Time allowed for looking at course alterations, per pass, ms (default 8 000) */
    altBudgetMs?: number;
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
    /** Course alteration from the track course, degrees (+ = to starboard, − = to port, 0 = track course) */
    alter: number;
    /** Course steered at the start (true), degrees */
    heading: number;
    /** Distance off the track at the start and end, nm (+ = starboard of the track) */
    offFrom: number;
    offTo: number;
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
    /** off the track, nm (+ = starboard) */
    x: number;
    /** heading choice: index in `alts` (0 = track course) */
    a: number;
    cost: number;
    fuel: number;
    badH: number;
    choice: number; // index in options, -1 = stop
    prev: Label | null;
    k: number;
    arriveMs?: number;
    /** A course alteration: where each part ends (out, back, along the track again) */
    pieces?: Piece[] | null;
}

interface Piece {
    s: number;
    x: number;
    ms: number;
    alt: number;
    choice: number;
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
    // course alterations: 0 first, then ± each allowed angle
    const alts: number[] = [0];
    for (const a of (inp.alterations ?? []).filter(a => a > 0 && a < 120)) alts.push(a, -a);
    const altering = alts.length > 1;
    const maxOff = Math.max(5, inp.maxOffNm ?? 60);
    const X = 5; // cross-track cell for the weather and land checks, nm
    const cellNm = Math.max(1, togo / 500);
    // weather cells along the track: 5 nm, coarser on long passages (forecast points are 30 nm or more apart)
    const W = Math.max(5, Math.round(togo / 400));
    const wxCache = new Map<number, WxPoint | null>();
    const hzCache = new Map<number, Hazard[]>();
    const stopCache = new Map<number, boolean>();
    const beCache = new Map<number, boolean>();
    const xc = (x: number) => Math.round(x / X);
    const hr = (t: number) => Math.round((t - inp.startMs) / HOUR) + 64;
    const placeKey = (sNm: number, x: number) => Math.round(sNm / W) * 64 + xc(x) + 32;
    /** Position at a distance along the track and a distance off it (+ = starboard) */
    const posAt = (sNm: number, x: number): LatLon & { course: number } => {
        const p = inp.track.at(Math.max(0, Math.min(S, sNm)));
        if (Math.abs(x) < 0.01) return p;
        const q = rhumbDirect(p, (p.course + (x > 0 ? 90 : 270)) % 360, Math.abs(x));
        return { lat: q.lat, lon: q.lon, course: p.course };
    };
    const wxAt = (sNm: number, t: number, x = 0) => {
        const key = hr(t) * 1e6 + placeKey(sNm, x);
        let w = wxCache.get(key);
        if (w === undefined) {
            // read at the middle of the cell, so the same cell always gives the same weather
            const p = posAt(Math.round(sNm / W) * W, xc(x) * X);
            w = inp.wxAt(p.lat, p.lon, t);
            if (wxCache.size > 1_000_000) wxCache.clear();
            wxCache.set(key, w);
        }
        return w ?? null;
    };
    /** Weather met here: `alt` = course alteration (deg), `choice` STOP = lying stopped */
    const badAt = (sNm: number, t: number, choice: number, stw: number, x = 0, alt = 0): Hazard[] => {
        const wx = wxAt(sNm, t, x);
        if (!wx) return [];
        const p = inp.track.at(Math.min(S, sNm));
        // stopped and drifting: the ship lies about beam-on to the wind (conservative for the checks)
        const heading = choice === STOP ? ((wx.windDir ?? p.course) + 90) % 360 : (p.course + alt + 360) % 360;
        // same weather cell, heading (to 2°) and speed (to 0.5 kn) give the same answer
        const key = ((hr(t) * 1e6 + placeKey(sNm, x)) * 181 + Math.round(heading / 2)) * 64 + (choice === STOP ? 63 : Math.min(62, Math.round(stw * 2)));
        let h = hzCache.get(key);
        if (!h) {
            h = inp.hazards(wx, heading, stw, choice === STOP).filter(x => x.level >= inp.avoidLevel);
            if (hzCache.size > 1_000_000) hzCache.clear(); // keep the memory used in bounds
            hzCache.set(key, h);
        }
        return h;
    };
    const canStop = (sNm: number, x: number) => {
        if (!inp.allowStop) return false;
        const key = placeKey(sNm, x);
        if (!stopCache.has(key)) {
            const p = posAt(sNm, x);
            stopCache.set(key, inp.canStopAt ? inp.canStopAt(p.lat, p.lon) : true);
        }
        return stopCache.get(key) as boolean;
    };
    const canBe = (sNm: number, x: number) => {
        if (xc(x) === 0) return true;
        const key = placeKey(sNm, x);
        if (!beCache.has(key)) {
            const p = posAt(sNm, x);
            beCache.set(key, inp.canBeAt ? inp.canBeAt(p.lat, p.lon) : true);
        }
        return beCache.get(key) as boolean;
    };

    /** Sail one decision step along the track from s at t with a speed choice (or stop); null when not allowed */
    const step = (s: number, t: number, choice: number, hard: boolean) => {
        if (choice === STOP && !canStop(s, 0)) return null;
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
            if (pos >= S - 1e-6) return { s: S, fuel, bad, arriveMs: tt + frac * HOUR, pieces: null };
        }
        return { s: pos, fuel, bad, arriveMs: undefined as number | undefined, pieces: null };
    };

    /**
     * A course alteration: steer `alt` degrees off the track course for `n` decision steps, then the same
     * angle back towards the track until it is joined again, then on along the track to the end of the step.
     * Same speed throughout. Null when not allowed (land, too far off, or, when `hard`, weather met).
     */
    const excursion = (s: number, t: number, choice: number, alt: number, n: number, hard: boolean) => {
        const o = opts[choice];
        const rad = (Math.abs(alt) * Math.PI) / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        const sgn = Math.sign(alt);
        const outH = n * stepH;
        const maxH = 2 * n * stepH + stepH; // a little longer back if the weather slows the ship down
        let pos = s;
        let off = 0;
        let tt = t;
        let fuel = 0;
        let bad = 0;
        let phase: 0 | 1 | 2 = 0; // out, back, along the track again
        const pieces: Piece[] = [];
        for (let h = 0; h < maxH; h++) {
            if (phase === 2 && h % stepH === 0) break; // on the track again at a decision time
            if (phase === 0 && h === outH) {
                pieces.push({ s: pos, x: off, ms: tt, alt, choice });
                phase = 1;
            }
            let rem = 1;
            while (rem > 1e-6) {
                const a = phase === 0 ? alt : phase === 1 ? -alt : 0;
                const p = inp.track.at(Math.min(S, pos));
                const heading = (p.course + a + 360) % 360;
                const wx = wxAt(pos, tt, off);
                const stw = Math.max(0.5, o.sicw - Math.max(0, inp.lossKn(wx, heading, o.sicw, pos)));
                const along = stw * (phase === 2 ? 1 : cosA);
                const across = phase === 2 ? 0 : stw * sinA * (phase === 0 ? sgn : -sgn);
                let dt = rem;
                if (phase === 1 && across !== 0) dt = Math.min(dt, Math.abs(off) / Math.abs(across));
                const toEnd = (S - pos) / along;
                if (toEnd < dt) {
                    if (phase !== 2) return null; // must be back on the track to arrive
                    dt = toEnd;
                }
                const mid = pos + (along * dt) / 2;
                const midOff = off + (across * dt) / 2;
                if (badAt(pos, tt, choice, stw, off, a).length || badAt(mid, tt + (dt * HOUR) / 2, choice, stw, midOff, a).length) {
                    if (hard) return null;
                    bad += dt;
                }
                fuel += (o.fuelPerDay * dt) / 24;
                pos += along * dt;
                off += across * dt;
                tt += dt * HOUR;
                rem -= dt;
                if (Math.abs(off) > maxOff + 1e-6 || !canBe(pos, off)) return null;
                if (phase === 1 && Math.abs(off) < 1e-6) {
                    off = 0;
                    pieces.push({ s: pos, x: 0, ms: tt, alt: -alt, choice });
                    phase = 2;
                }
                if (phase === 2 && pos >= S - 1e-6) {
                    pieces.push({ s: S, x: 0, ms: tt, alt: 0, choice });
                    return { s: S, fuel, bad, arriveMs: tt, pieces, steps: Math.ceil((tt - t) / (stepH * HOUR) - 1e-9) };
                }
            }
        }
        if (phase !== 2) return null;
        pieces.push({ s: pos, x: 0, ms: tt, alt: 0, choice });
        return { s: pos, fuel, bad, arriveMs: undefined as number | undefined, pieces, steps: Math.round((tt - t) / (stepH * HOUR)) };
    };

    const maxFuelH = Math.max(...opts.map(o => o.fuelPerDay)) / 24;
    const changePenalty = maxFuelH * 0.5;
    const stopPenalty = maxFuelH * 0.05 * stepH;
    // a little for every hour off the track course, so the plan alters course only when it is worth it
    const altPenaltyH = maxFuelH * 0.08;
    const plannedH = planned.hours;
    const wantH = inp.arriveBy != null ? (inp.arriveBy - inp.startMs) / HOUR : plannedH;
    const horizonH = Math.min(45 * 24, Math.max(plannedH * 2, wantH + 72, togo / opts[opts.length - 1].sicw + 72));
    const maxSteps = Math.ceil(horizonH / stepH);
    const tol = (inp.toleranceH ?? 1) * HOUR;
    // how long an alteration may last before turning back: 1 … 4 decision steps, at most 12 h out
    const outSteps = [1, 2, 3, 4].filter(n => n * stepH <= Math.max(stepH, 12));
    const nearestOpt = (v: number) => opts.reduce((bi, o, i) => (Math.abs(o.sicw - v) < Math.abs(opts[bi].sicw - v) ? i : bi), 0);

    let labelsSeen = 0;
    let stepsRun = 0;
    let altCut = false;
    const run = (hard: boolean): Label[] => {
        // course alterations multiply the work: looked at for at most 8 s per pass (then speed only)
        const altUntil = Date.now() + (inp.altBudgetMs ?? 8_000);
        // layers[k] = where the ship can be at decision time k (a course alteration lands several steps on)
        const layers: Map<number, Label>[] = [];
        layers[0] = new Map([[Math.floor(inp.startNm / cellNm), { s: inp.startNm, x: 0, a: 0, cost: 0, fuel: 0, badH: 0, choice: NaN, prev: null, k: 0 }]]);
        const arrivals: Label[] = [];
        let firstArr = Infinity;
        for (let k = 0; k < maxSteps; k++) {
            const cur = layers[k];
            layers[k] = undefined as never; // free
            if (!cur?.size) {
                if (!layers.slice(k + 1).some(m => m?.size)) break;
                continue;
            }
            stepsRun++;
            const t = inp.startMs + k * stepH * HOUR;
            if (arrivals.length) {
                const doneBy = inp.arriveBy != null ? Math.max(inp.arriveBy + tol, firstArr) : firstArr;
                if (t > doneBy + 2 * HOUR) break;
            }
            const add = (L: Label, c: number, a: number, r: { s: number; fuel: number; bad: number; arriveMs?: number; pieces: Piece[] | null; steps?: number }) => {
                let cost = L.cost + r.fuel + (hard ? 0 : r.bad * 1000);
                if (!Number.isNaN(L.choice) && (L.choice !== c || L.a !== a || a !== 0)) cost += changePenalty;
                if (c === STOP) cost += stopPenalty;
                if (r.pieces) cost += altPenaltyH * ((r.pieces[1]?.ms ?? t) - t) / HOUR;
                const kk = k + (r.steps ?? 1);
                const lab: Label = { s: r.s, x: 0, a, cost, fuel: L.fuel + r.fuel, badH: L.badH + r.bad, choice: c, prev: L, k: kk, arriveMs: r.arriveMs, pieces: r.pieces };
                labelsSeen++;
                if (r.arriveMs != null) {
                    arrivals.push(lab);
                    firstArr = Math.min(firstArr, r.arriveMs);
                    return;
                }
                if (kk >= maxSteps) return;
                const next = (layers[kk] ??= new Map());
                const cell = Math.floor(r.s / cellNm);
                const old = next.get(cell);
                if (!old || cost < old.cost - 1e-9 || (Math.abs(cost - old.cost) <= 1e-9 && r.s > old.s)) next.set(cell, lab);
            };
            for (const L of cur.values()) {
                let metSome = false;
                for (let c = STOP; c < opts.length; c++) {
                    const r = step(L.s, t, c, hard);
                    if (!r || r.bad > 0) metSome = true;
                    if (r) add(L, c, 0, r);
                }
                // course alterations only where the track course meets the weather in this step
                if (!altering || !metSome) continue;
                if (Date.now() > altUntil) {
                    altCut = true;
                    continue;
                }
                const speeds = [...new Set([L.choice >= 0 ? L.choice : -1, nearestOpt(inp.plannedSicwAt(Math.min(S, L.s))), 0, opts.length - 1].filter(c => c >= 0))];
                for (let ai = 1; ai < alts.length; ai++) {
                    for (const n of outSteps) {
                        for (const c of speeds) {
                            if (opts[c].sicw * Math.sin((Math.abs(alts[ai]) * Math.PI) / 180) * n * stepH > maxOff * 1.15) continue;
                            const r = excursion(L.s, t, c, alts[ai], n, hard);
                            if (r) add(L, c, ai, r);
                        }
                    }
                }
            }
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
    const at = (sNm: number, x: number) => {
        const q = posAt(sNm, x);
        return { lat: q.lat, lon: q.lon };
    };
    let sPrev = inp.startNm;
    let xPrev = 0;
    let msPrev = inp.startMs;
    let fuelPrev = 0;
    let badPrev = 0;
    for (const L of chain) {
        const toMs = L.arriveMs ?? inp.startMs + L.k * stepH * HOUR;
        // the parts of this choice: one, or out / back / along the track for a course alteration
        const pieces: Piece[] = L.pieces ?? [{ s: L.s, x: 0, ms: toMs, alt: 0, choice: L.choice }];
        const span = Math.max(1, toMs - msPrev);
        const fuelL = L.fuel - fuelPrev;
        const badL = L.badH - badPrev;
        let pFrom = msPrev;
        for (const pc of pieces) {
            const pTo = pc === pieces[pieces.length - 1] ? toMs : pc.ms;
            if (pTo - pFrom < 60_000 && pc !== pieces[0]) continue;
            const share = (pTo - pFrom) / span;
            const o = pc.choice === STOP ? null : opts[pc.choice];
            const alt = o ? pc.alt : 0;
            const last = segments[segments.length - 1];
            if (last && ((last.action === 'stop' && !o) || (o && last.action === 'go' && last.sicw === o.sicw && last.alter === alt && (alt !== 0 || Math.abs(last.offTo) < 0.5)))) {
                last.toMs = pTo;
                last.toNm = pc.s;
                last.offTo = pc.x;
                last.to = at(pc.s, pc.x);
                last.fuel += fuelL * share;
                last.badH += badL * share;
            } else {
                const c0 = inp.track.at(Math.min(S, sPrev)).course;
                segments.push({
                    action: o ? 'go' : 'stop',
                    sicw: o ? o.sicw : 0,
                    rpm: o ? o.rpm : null,
                    fromMs: pFrom,
                    toMs: pTo,
                    fromNm: sPrev,
                    toNm: pc.s,
                    from: at(sPrev, xPrev),
                    to: at(pc.s, pc.x),
                    fuel: fuelL * share,
                    badH: badL * share,
                    plannedSicw: inp.plannedSicwAt(Math.min(S, sPrev)),
                    alter: alt,
                    heading: Math.round((c0 + alt + 360) % 360),
                    offFrom: xPrev,
                    offTo: pc.x,
                    why: '',
                });
            }
            sPrev = pc.s;
            xPrev = pc.x;
            pFrom = pTo;
        }
        msPrev = toMs;
        fuelPrev = L.fuel;
        badPrev = L.badH;
    }
    segments.forEach((seg, i) => (seg.why = reasonFor(inp, seg, segments.slice(0, i), wxAt, badAt)));
    if (altCut) notes.push('Course alterations were looked at only for the first part of the passage (it took too long); the rest of the plan changes the speed only.');
    if (segments.some(g => g.alter !== 0)) notes.push('Course alterations: the weather off the track is taken from the nearest forecast point along the route, so the plan alters course mainly for warnings that depend on the heading (wind and waves on the bow, beam or quarter, IMO warnings, roll and pitch). To go round a storm, use Change the track.');
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
    wxAt: (s: number, t: number, x?: number) => WxPoint | null,
    badAt: (s: number, t: number, choice: number, stw: number, x?: number, alt?: number) => Hazard[],
): string {
    const S = inp.track.totalNm;
    if (seg.action === 'go' && (seg.alter !== 0 || Math.abs(seg.offFrom) > 2.5)) return courseReason(inp, seg, badAt);
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

const side = (x: number) => (x > 0 ? 'starboard' : 'port');
const deg3 = (d: number) => `${String(Math.round(((d % 360) + 360) % 360)).padStart(3, '0')}°`;

/** Why this course: what the track course would meet here and now, and what the new course does. */
function courseReason(inp: SpeedPlanInput, seg: PlanSegment, badAt: (s: number, t: number, choice: number, stw: number, x?: number, alt?: number) => Hazard[]): string {
    const course = inp.track.at(Math.min(inp.track.totalNm, seg.fromNm)).course;
    const away = seg.alter !== 0 && Math.sign(seg.alter) === Math.sign(seg.offTo - seg.offFrom) && Math.abs(seg.offTo) >= Math.abs(seg.offFrom);
    // what the track course would meet during this part (same place and speed, no alteration)
    let met: Hazard | null = null;
    let metT = 0;
    const hours = Math.max(1, Math.round((seg.toMs - seg.fromMs) / HOUR));
    for (let h = 0; h < hours && !met; h++) {
        const f = hours > 1 ? h / (hours - 1) : 0;
        const s = seg.fromNm + (seg.toNm - seg.fromNm) * f;
        const x = seg.offFrom + (seg.offTo - seg.offFrom) * f;
        const hz = badAt(s, seg.fromMs + h * HOUR, -3, seg.sicw, x, 0);
        if (hz.length) {
            met = hz.reduce((a, b) => (b.level > a.level ? b : a));
            metT = seg.fromMs + h * HOUR;
        }
    }
    const still = seg.badH > 0.05 ? ` Still about ${Math.max(1, Math.round(seg.badH))} h in the weather you chose to avoid on this part.` : '';
    const offTxt = `${Math.abs(Math.round(seg.offTo))} nm ${side(seg.offTo)} of the track`;
    if (seg.alter === 0) return `Parallel to the track, ${Math.abs(Math.round(seg.offFrom))} nm to ${side(seg.offFrom)} (steer ${deg3(seg.heading)}), ${seg.sicw.toFixed(1)} kn.${still}`;
    if (away) {
        const turn = `Alter course ${Math.abs(seg.alter)}° to ${side(seg.alter)} (steer ${deg3(seg.heading)} instead of ${deg3(course)}) at ${seg.sicw.toFixed(1)} kn`;
        return met
            ? `${turn}: on the track course you would meet ${met.detail} on ${fmtShort(metT)} UTC; on ${deg3(seg.heading)} ${seg.badH > 0.05 ? 'it is less' : 'it is avoided'}. Ends about ${offTxt}.${still}`
            : `${turn}: keeps clear of the weather ahead on the track course. Ends about ${offTxt}.${still}`;
    }
    const back = `Back towards the track: steer ${deg3(seg.heading)} (${Math.abs(seg.alter)}° to ${side(seg.alter)} of the track course) at ${seg.sicw.toFixed(1)} kn`;
    return `${back}${met ? `; on the track course you would still meet ${met.detail} on ${fmtShort(metT)} UTC` : ': the weather that needed the alteration has eased'}. ${Math.abs(seg.offTo) < 2.5 ? 'Back on the track at the end.' : `Ends about ${offTxt}.`}${still}`;
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
 * The route with the plan in it: a waypoint wherever the speed or the course changes or the ship stops
 * (on the track an existing waypoint within 2 nm is used instead), each leg's speed from the plan, stops
 * as waypoint stops. Where the plan leaves the track (course alteration), waypoints are put at the
 * off-track positions and the planned waypoints passed while off the track are left out. Legs already
 * sailed stay as they are; fixed ETAs and planned stops after the start are cleared.
 */
export function applySpeedPlan(r: Route, p: PlanCalc, segs: PlanSegment[], startNm: number): Waypoint[] {
    const track = trackOf(p);
    const cum = [0, ...p.legs.map(l => l.cumNm)];
    const wps = r.waypoints.map(w => ({ ...w }));
    type Pt = { s: number; wp: Waypoint; off: number };
    const end = p.totalNm;
    // distance off the track at a distance along it (straight between segment ends)
    const offAt = (s: number): number => {
        for (const g of segs) {
            if (s < g.fromNm - 1e-6 || s > g.toNm + 1e-6) continue;
            const f = g.toNm - g.fromNm > 1e-6 ? (s - g.fromNm) / (g.toNm - g.fromNm) : 0;
            return (g.offFrom ?? 0) + ((g.offTo ?? 0) - (g.offFrom ?? 0)) * f;
        }
        return 0;
    };
    const pts: Pt[] = wps.map((w, i) => ({ s: cum[i] ?? 0, wp: w, off: 0 })).filter((q, i, a) => i === 0 || i === a.length - 1 || q.s <= startNm + 1e-6 || Math.abs(offAt(q.s)) < 1);
    const stopAt = new Map<Waypoint, number>();
    const ensure = (s: number, off: number, pos: LatLon, name: string): Waypoint => {
        const near = pts.find(q => Math.abs(q.s - s) < 2 && Math.abs(q.off - off) < 2);
        if (near) return near.wp;
        let k = pts.findIndex(x => x.s > s + 1e-9 || (Math.abs(x.s - s) <= 1e-9 && x.off !== off && x === pts[pts.length - 1]));
        if (k < 0) k = pts.length - 1;
        const next = pts[k].wp;
        const wp = newWaypoint(pos.lat, pos.lon, Math.abs(off) >= 1 ? 'RL' : next.legType, name);
        wp.allowance = next.allowance;
        pts.splice(k, 0, { s, wp, off });
        return wp;
    };
    const hrs = (g: PlanSegment) => Math.round((g.toMs - g.fromMs) / 3600_000);
    const nameOf = (g: PlanSegment) => (g.action === 'stop' ? `Wait ${hrs(g)} h` : g.alter ? `${g.alter > 0 ? 'Stbd' : 'Port'} ${Math.abs(g.alter)}° ${g.sicw.toFixed(1)} kn` : Math.abs(g.offFrom ?? 0) >= 1 ? `Back to track ${g.sicw.toFixed(1)} kn` : `${g.sicw.toFixed(1)} kn`);
    segs.forEach((seg, i) => {
        const off = seg.offFrom ?? 0;
        if (seg.fromNm > startNm + 0.5 && seg.fromNm < end - 2) ensure(seg.fromNm, off, seg.from, nameOf(seg));
        // where an off-track part ends (and the next part starts there anyway, unless it is the arrival)
        const offEnd = seg.offTo ?? 0;
        if (Math.abs(offEnd) >= 1 && (i === segs.length - 1 || segs[i + 1].fromNm >= end - 2)) ensure(seg.toNm, offEnd, seg.to, 'Off track');
        if (seg.action === 'stop') {
            const w = ensure(Math.max(startNm, seg.fromNm), off, seg.from, `Wait ${hrs(seg)} h`);
            stopAt.set(w, (stopAt.get(w) ?? 0) + (seg.toMs - seg.fromMs) / 3600_000);
        }
    });
    // back on the track after a course alteration: a waypoint where the track is joined again
    segs.forEach((seg, i) => {
        const nxt = segs[i + 1];
        if (Math.abs(seg.offFrom ?? 0) >= 1 && Math.abs(seg.offTo ?? 0) < 1 && seg.toNm < end - 2 && !(nxt && Math.abs(nxt.fromNm - seg.toNm) < 1e-6 && pts.some(q => Math.abs(q.s - seg.toNm) < 2 && Math.abs(q.off) < 1))) {
            ensure(seg.toNm, 0, track.at(seg.toNm), 'Rejoin track');
        }
    });
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
