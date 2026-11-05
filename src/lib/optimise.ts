// Route optimisation: least fuel between two points, using the weather to advantage while keeping
// to the user's weather limits. PROTOTYPE, pure logic: no Windy calls. Weather, land and extra
// constraints come in through callbacks, so it can run in a test, a worker or the plugin.
//
// Method (see windy/notes/route-optimisation.md): three-dimensional dynamic programming on a
// lens-shaped grid of lateral offsets around the great circle (stages along the track, offsets
// across it, arrival time as the third dimension). Each move picks the next grid node and a
// calm-water speed (= RPM from the owner's table). Fuel = fuel/day at that calm-water speed ×
// hours, where the hours include the Kwon weather speed loss and the current: this is the
// "fixed power setting" convention, the same as the speed-mode simulation in speed.ts.
//
// AID ONLY. The result must be checked against official charts / ECDIS: the land check here is
// whatever the caller supplies (coarse), there is no depth, traffic or routeing-measure data.

import { legGeometry, norm180, norm360, rhumbDirect, wrapLon, type LatLon, type LegType } from './geo';
import type { SpeedRow, Vessel } from './model';
import { fromTable, lossInputs, sogWithCurrent, weatherLossKn, type Current, type LossInputs } from './speed';
import { checkLimits, type Level, type Thresholds, type WxPoint } from './weather';

const HOUR = 3600_000;
const D2R = Math.PI / 180;

// ---------- Inputs ----------

/** What the optimiser asks the outside world. All optional except the weather. */
export interface OptimiseEnv {
    /** Weather at a place and time; null = no forecast there/then */
    wxAt(lat: number, lon: number, t: number): WxPoint | null;
    /** True when the position is navigable water. Missing = everything is water */
    isWater?(lat: number, lon: number): boolean;
    /** Ocean current at a place and time; missing/null = none */
    currentAt?(lat: number, lon: number, t: number): Current | null;
    /**
     * Hook for extra per-step costs or constraints (e.g. predicted roll above a limit, IMO
     * Circ.1228 warnings, piracy areas). Called for every sub-step of every candidate leg.
     * `cost` is added in fuel-equivalent tonnes; `forbidden` rules the step out.
     */
    extraCost?(ctx: StepContext): ExtraCost | null;
}

export interface StepContext {
    lat: number;
    lon: number;
    /** UTC ms at this step */
    t: number;
    /** Course made good, °T */
    course: number;
    /** Calm-water speed chosen for the leg, kn */
    sicw: number;
    /** Speed through water after the weather loss, kn */
    stw: number;
    /** Length of this sub-step, hours */
    hours: number;
    wx: WxPoint | null;
    vessel: Vessel;
}

export interface ExtraCost {
    cost?: number;
    forbidden?: boolean;
    /** Short label, counted in the result (e.g. 'Roll') */
    what?: string;
}

export interface OptimiseOptions {
    /** Wanted arrival time (UTC ms). Null = free: least fuel + timeValue × hours */
    eta?: number | null;
    /** Latest acceptable arrival after `eta`, hours (default 1) */
    etaToleranceH?: number;
    /** Value of an hour of voyage time in tonnes of fuel, used only with a free ETA (default 0) */
    timeValueTPerH?: number;
    /** Calm-water speeds the ship may use, kn. Default: from the speed table in ~0.5–1 kn steps */
    speeds?: number[];
    /** Planned calm-water speed (used when there is no table or only as the middle of the range) */
    plannedSpeed?: number;
    /** Number of stages along the track (default from the distance, ~150 nm each, 6–40) */
    stages?: number;
    /** Lateral grid nodes each side of the centre line (default 5 → 11 across) */
    halfWidth?: number;
    /** Largest lateral offset of the grid at mid-voyage, nm (default 15 % of the distance, 60–600) */
    maxOffsetNm?: number;
    /** Largest change of lateral index between consecutive stages (default 2) */
    maxJump?: number;
    /** Sub-steps per leg at which weather is read (default 3) */
    samples?: number;
    /** Arrival-time bin for the dynamic programming, hours (default 1). Smaller = more exact, slower */
    binH?: number;
    /** 'hard' = a red weather limit rules the step out; 'soft' = penalty per hour instead */
    limits?: 'hard' | 'soft';
    /** Penalty for an hour inside a red limit when limits are soft, fuel-equivalent tonnes (default 50) */
    breachPenaltyTPerH?: number;
    /** Penalty for an hour without forecast, t (default 0 = sail blind at calm-water speed) */
    noForecastPenaltyTPerH?: number;
    /** Base track for the grid: 'GC' (default) or 'RL' */
    baseTrack?: LegType;
}

// ---------- Grid ----------

export interface GridNode {
    stage: number;
    /** Lateral index, 0 = on the base track, + = to starboard of the track direction */
    k: number;
    lat: number;
    lon: number;
    /** Great-circle distance still to go to the destination, nm (for pruning) */
    toGoNm: number;
    water: boolean;
}

export interface Grid {
    start: LatLon;
    end: LatLon;
    /** Nodes by stage; stage 0 is the start only, the last stage the destination only */
    stages: GridNode[][];
    baseDistNm: number;
    baseTrack: LegType;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Distance in nm between two positions with a quick local formula (fine for < ~300 nm). */
export function quickNm(a: LatLon, b: LatLon): number {
    const dLat = (b.lat - a.lat) * 60;
    const dLon = norm180(b.lon - a.lon) * 60 * Math.cos(((a.lat + b.lat) / 2) * D2R);
    return Math.hypot(dLat, dLon);
}

/**
 * Lens-shaped grid: `stages` cuts across the base track, each with 2·halfWidth+1 nodes spread
 * across the track, widest at mid-voyage (width × sin(π·stage/stages)). Nodes on land (per
 * `isWater`) are kept but marked, so the caller can see them; the optimiser never uses them.
 */
export function buildGrid(start: LatLon, end: LatLon, opts: OptimiseOptions = {}, isWater?: (lat: number, lon: number) => boolean): Grid {
    const baseTrack = opts.baseTrack ?? 'GC';
    const base = legGeometry(start, end, baseTrack);
    const n = opts.stages ?? clamp(Math.round(base.distNm / 150), 6, 40);
    const half = opts.halfWidth ?? 5;
    const maxOff = opts.maxOffsetNm ?? clamp(base.distNm * 0.15, 60, 600);
    const toGo = (p: LatLon) => legGeometry(p, end, 'GC').distNm;
    const stages: GridNode[][] = [];
    for (let i = 0; i <= n; i++) {
        const f = i / n;
        const c = base.pointAt(base.distNm * f);
        const centre: LatLon = i === 0 ? start : i === n ? end : { lat: c.lat, lon: c.lon };
        const width = i === 0 || i === n ? 0 : maxOff * Math.sin(Math.PI * f);
        const row: GridNode[] = [];
        const ks = width > 0 ? Array.from({ length: 2 * half + 1 }, (_, j) => j - half) : [0];
        for (const k of ks) {
            let p: LatLon = centre;
            if (k !== 0) {
                const off = (width * k) / half;
                const q = rhumbDirect(centre, norm360(c.course + (off > 0 ? 90 : -90)), Math.abs(off));
                p = { lat: clamp(q.lat, -89, 89), lon: wrapLon(q.lon) };
            }
            row.push({ stage: i, k, lat: p.lat, lon: p.lon, toGoNm: toGo(p), water: isWater ? isWater(p.lat, p.lon) : true });
        }
        stages.push(row);
    }
    return { start, end, stages, baseDistNm: base.distNm, baseTrack };
}

/**
 * Where to fetch point forecasts for a grid: every node snapped to a `snapDeg` grid (default 1°),
 * duplicates removed. With weatherAt()'s 150 nm reach, 1° snapping is close enough.
 */
export function forecastPoints(grid: Grid, snapDeg = 1): LatLon[] {
    const seen = new Set<string>();
    const out: LatLon[] = [];
    for (const row of grid.stages) {
        for (const nd of row) {
            const lat = Math.round(nd.lat / snapDeg) * snapDeg;
            const lon = wrapLon(Math.round(nd.lon / snapDeg) * snapDeg);
            const key = `${lat},${lon}`;
            if (!seen.has(key)) {
                seen.add(key);
                out.push({ lat, lon });
            }
        }
    }
    return out;
}

// ---------- Fuel and leg model ----------

export type FuelUnit = 't' | 'relative';

/** Fuel per day at a calm-water speed: the owner's table, else a cubic stand-in (relative units). */
export function fuelPerDay(table: SpeedRow[] | undefined, sicw: number): { fuel: number; unit: FuelUnit; outside: boolean } {
    const tv = fromTable(table, sicw);
    if (tv && tv.fuel != null) return { fuel: Math.max(0, tv.fuel), unit: 't', outside: tv.outside };
    return { fuel: Math.pow(sicw / 10, 3) * 10, unit: 'relative', outside: false };
}

/** Speeds to try: the table's range in steps of 0.5 kn (1 kn if that is more than 9 choices). */
export function defaultSpeeds(table: SpeedRow[] | undefined, planned?: number): number[] {
    const rows = (table ?? []).filter(r => r.sicw != null && isFinite(r.sicw as number)).map(r => r.sicw as number);
    let lo: number;
    let hi: number;
    if (rows.length >= 2) {
        lo = Math.min(...rows);
        hi = Math.max(...rows);
    } else {
        const p = planned ?? rows[0] ?? 12;
        lo = Math.max(4, p - 2);
        hi = p + 2;
    }
    let step = 0.5;
    while ((hi - lo) / step + 1 > 9) step *= 2;
    const out: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
    if (planned != null && planned >= lo && planned <= hi && !out.some(v => Math.abs(v - planned) < 1e-6)) out.push(planned);
    return out.sort((a, b) => a - b);
}

export interface LegEval {
    distNm: number;
    hours: number;
    /** Fuel in the unit of the result */
    fuel: number;
    /** Objective: fuel + penalties (+ time value) */
    cost: number;
    /** Hours inside a red weather limit */
    breachH: number;
    /** Hours with no forecast available */
    noWxH: number;
    /** Hours ruled out by the extra-cost hook or a limit (hard mode) */
    forbidden: boolean;
    /** Touches land (per isWater) */
    land: boolean;
    avgLossKn: number;
    avgCurAlong: number;
    /** Highest limit level met (0 none, 1 alert, 2 limit) */
    level: Level;
    /** Counts of what the hook flagged, by its `what` */
    extra: Record<string, number>;
    course: number;
    arriveMs: number;
}

interface Model {
    vessel: Vessel;
    th: Thresholds;
    env: OptimiseEnv;
    li: LossInputs | null;
    samples: number;
    limits: 'hard' | 'soft';
    breachPenalty: number;
    noWxPenalty: number;
    timeValue: number;
}

/** Sail one leg a→b leaving at `departMs` at calm-water speed `sicw`, reading weather at `samples` sub-steps. */
function evalLeg(m: Model, a: LatLon, b: LatLon, departMs: number, sicw: number): LegEval {
    const geom = legGeometry(a, b, 'GC');
    const n = Math.max(1, m.samples);
    const seg = geom.distNm / n;
    const fpd = fuelPerDay(m.vessel.speedTable, sicw);
    let t = departMs;
    let s = 0;
    const out: LegEval = { distNm: geom.distNm, hours: 0, fuel: 0, cost: 0, breachH: 0, noWxH: 0, forbidden: false, land: false, avgLossKn: 0, avgCurAlong: 0, level: 0, extra: {}, course: geom.course, arriveMs: departMs };
    if (geom.distNm <= 1e-9) return out;
    let lossSum = 0;
    let curSum = 0;
    for (let i = 0; i < n; i++) {
        const p = geom.pointAt(s + seg / 2);
        if (m.env.isWater && !m.env.isWater(p.lat, p.lon)) out.land = true;
        const wx = m.env.wxAt(p.lat, p.lon, t);
        const cur = m.env.currentAt?.(p.lat, p.lon, t) ?? null;
        let loss = m.li ? weatherLossKn(wx, p.course, sicw, m.li) : 0;
        let stw = Math.max(1, sicw - loss);
        if (m.li && loss > 0) {
            // the loss depends a little on the speed: average the estimate at the set speed and at the reduced speed
            loss = (loss + weatherLossKn(wx, p.course, stw, m.li)) / 2;
            stw = Math.max(1, sicw - loss);
        }
        const g = sogWithCurrent(stw, p.course, cur);
        const sog = Math.max(0.5, g.sog);
        const dtH = seg / sog;
        out.hours += dtH;
        out.fuel += (fpd.fuel * dtH) / 24;
        lossSum += loss * dtH;
        curSum += g.along * dtH;
        if (wx) {
            const hits = checkLimits(wx, p.course, m.th);
            const lvl = Math.max(0, ...hits.map(h => h.level)) as Level;
            if (lvl > out.level) out.level = lvl;
            if (lvl === 2) out.breachH += dtH;
        } else {
            out.noWxH += dtH;
        }
        if (m.env.extraCost) {
            const x = m.env.extraCost({ lat: p.lat, lon: p.lon, t, course: p.course, sicw, stw, hours: dtH, wx, vessel: m.vessel });
            if (x) {
                if (x.forbidden) out.forbidden = true;
                if (x.cost) out.cost += x.cost;
                if (x.what) out.extra[x.what] = (out.extra[x.what] ?? 0) + dtH;
            }
        }
        t += dtH * HOUR;
        s += seg;
    }
    out.arriveMs = t;
    out.avgLossKn = lossSum / out.hours;
    out.avgCurAlong = curSum / out.hours;
    if (out.land) out.forbidden = true;
    if (out.breachH > 0) {
        if (m.limits === 'hard') out.forbidden = true;
        else out.cost += out.breachH * m.breachPenalty;
    }
    out.cost += out.fuel + out.noWxH * m.noWxPenalty + out.hours * m.timeValue;
    return out;
}

function makeModel(vessel: Vessel, th: Thresholds, env: OptimiseEnv, opts: OptimiseOptions): Model {
    return {
        vessel,
        th,
        env,
        li: lossInputs(vessel),
        samples: opts.samples ?? 3,
        limits: opts.limits ?? 'hard',
        breachPenalty: opts.breachPenaltyTPerH ?? 50,
        noWxPenalty: opts.noForecastPenaltyTPerH ?? 0,
        timeValue: opts.eta == null ? (opts.timeValueTPerH ?? 0) : 0,
    };
}

// ---------- Results ----------

export interface OptimisedLeg {
    from: LatLon;
    to: LatLon;
    distNm: number;
    course: number;
    /** Calm-water speed to set (kn) and the RPM from the table, if any */
    sicw: number;
    rpm: number | null;
    /** Average speed over ground, kn */
    sog: number;
    hours: number;
    fuel: number;
    departMs: number;
    arriveMs: number;
    avgLossKn: number;
    avgCurAlong: number;
    /** Highest weather limit level met on the leg */
    level: Level;
    breachH: number;
    noWxH: number;
    extra: Record<string, number>;
}

export interface TrackEval {
    points: LatLon[];
    legs: OptimisedLeg[];
    distNm: number;
    hours: number;
    fuel: number;
    cost: number;
    eta: number;
    breachH: number;
    noWxH: number;
    /** Any leg ruled out (land, hard limit, hook) */
    forbidden: boolean;
    extra: Record<string, number>;
}

export interface OptimiseResult {
    ok: boolean;
    /** The optimised track and its figures (null when nothing feasible was found) */
    route: TrackEval | null;
    /** The straight route along the base track at a constant speed meeting the same ETA, for comparison */
    direct: TrackEval | null;
    fuelUnit: FuelUnit;
    grid: Grid;
    /** Speeds that were tried, kn */
    speeds: number[];
    /** Whether red limits were treated as hard or soft (soft also when hard found nothing) */
    limitsMode: 'hard' | 'soft';
    /** Plain-language notes: assumptions, fallbacks, warnings */
    notes: string[];
    stats: { nodes: number; labels: number; legEvals: number; ms: number };
}

// ---------- Dynamic programming ----------

interface Label {
    node: GridNode;
    t: number;
    cost: number;
    fuel: number;
    breachH: number;
    prev: Label | null;
    leg: LegEval | null;
    sicw: number;
}

/**
 * Least-fuel route from `start` to `end` leaving at `etd` (UTC ms). With `opts.eta` the route
 * arrives by then (within the tolerance) at least fuel; without, it minimises fuel + time value.
 * Red weather limits (Settings → Weather limits) are avoided; when that is impossible the least
 * exposed route is returned and a note says so.
 */
export function optimise(start: LatLon, end: LatLon, etd: number, vessel: Vessel, th: Thresholds, env: OptimiseEnv, opts: OptimiseOptions = {}): OptimiseResult {
    const t0 = Date.now();
    const notes: string[] = [];
    const grid = buildGrid(start, end, opts, env.isWater);
    const speeds = (opts.speeds && opts.speeds.length ? [...opts.speeds] : defaultSpeeds(vessel.speedTable, opts.plannedSpeed)).filter(v => v > 0).sort((a, b) => a - b);
    const unit = fuelPerDay(vessel.speedTable, speeds[0]).unit;
    if (unit === 'relative') notes.push('No RPM/speed/fuel table (⚙ Settings): fuel is in relative units (speed³), only good for comparing routes.');
    if (!lossInputs(vessel)) notes.push('Weather speed loss needs LBP, breadth and drafts (⚙ Settings → Ship particulars): the weather here only affects the limits, not the speed.');
    if (opts.eta == null && (opts.timeValueTPerH ?? 0) === 0 && speeds.length > 1) notes.push('No ETA and no value of time given: the slowest speed is always cheapest, so only the path is really optimised.');
    const landNodes = grid.stages.flat().filter(n => !n.water).length;
    if (landNodes) notes.push(`${landNodes} grid positions are on land (coarse check) and were not used.`);

    const run = (limits: 'hard' | 'soft') => {
        const m = makeModel(vessel, th, env, { ...opts, limits });
        const stats = { labels: 0, legEvals: 0 };
        const binMs = (opts.binH ?? 1) * HOUR;
        const eta = opts.eta ?? null;
        const latest = eta != null ? eta + (opts.etaToleranceH ?? 1) * HOUR : Infinity;
        const vMax = speeds[speeds.length - 1];
        const maxJump = opts.maxJump ?? 2;
        let front = new Map<number, Label>();
        const first = grid.stages[0][0];
        front.set(0, { node: first, t: etd, cost: 0, fuel: 0, breachH: 0, prev: null, leg: null, sicw: 0 });
        const key = (k: number, bin: number) => (k + 1000) * 100000 + bin;
        for (let i = 1; i < grid.stages.length; i++) {
            const next = new Map<number, Label>();
            for (const lab of front.values()) {
                for (const nd of grid.stages[i]) {
                    if (!nd.water || Math.abs(nd.k - lab.node.k) > maxJump) continue;
                    // cannot reach the destination in time even at full speed in calm water: skip
                    if (eta != null && lab.t + ((quickNm(lab.node, nd) + nd.toGoNm) / vMax) * HOUR > latest) continue;
                    for (const v of speeds) {
                        const le = evalLeg(m, lab.node, nd, lab.t, v);
                        stats.legEvals++;
                        if (le.forbidden || le.arriveMs > latest) continue;
                        if (eta != null && le.arriveMs + (nd.toGoNm / vMax) * HOUR > latest) continue;
                        const cost = lab.cost + le.cost;
                        const bin = Math.floor((le.arriveMs - etd) / binMs);
                        const kk = key(nd.k, bin);
                        const old = next.get(kk);
                        if (!old || cost < old.cost) {
                            next.set(kk, { node: nd, t: le.arriveMs, cost, fuel: lab.fuel + le.fuel, breachH: lab.breachH + le.breachH, prev: lab, leg: le, sicw: v });
                        }
                    }
                }
            }
            stats.labels += next.size;
            front = next;
            if (!front.size) break;
        }
        let best: Label | null = null;
        for (const lab of front.values()) if (!best || lab.cost < best.cost) best = lab;
        return { best, stats };
    };

    let limitsMode: 'hard' | 'soft' = opts.limits ?? 'hard';
    let r = run(limitsMode);
    let legEvals = r.stats.legEvals;
    let labels = r.stats.labels;
    if (!r.best && limitsMode === 'hard') {
        limitsMode = 'soft';
        r = run('soft');
        legEvals += r.stats.legEvals;
        labels += r.stats.labels;
        if (r.best) notes.push('No route keeps inside all your weather limits (within the ETA): the route with the least time inside the limits is shown. Check it leg by leg.');
    }
    const nodes = grid.stages.reduce((s, row) => s + row.length, 0);
    const route = r.best ? labelToTrack(r.best, vessel) : null;
    if (!route) notes.push(opts.eta != null ? 'No route reaches the destination by the ETA at any speed in the table (or everything is on land / outside the forecast).' : 'No feasible route found (land or forbidden steps everywhere).');
    if (route && route.breachH > 0) notes.push(`${route.breachH.toFixed(1)} h of the route are inside a red limit.`);
    if (route && route.noWxH > 0) notes.push(`${route.noWxH.toFixed(0)} h of the route have no forecast (beyond its end or too far from a forecast point): sailed at calm-water speed.`);

    // Reference: the base track (centre line of the grid) at one constant speed arriving at the same time
    const centre = grid.stages.map(row => row.find(n => n.k === 0) as GridNode);
    const targetEta = opts.eta ?? route?.eta ?? null;
    const direct = targetEta != null ? constantSpeedTrack(centre, etd, targetEta, vessel, th, env, opts, speeds) : null;
    return { ok: !!route, route, direct, fuelUnit: unit, grid, speeds, limitsMode, notes, stats: { nodes, labels, legEvals, ms: Date.now() - t0 } };
}

function labelToTrack(best: Label, vessel: Vessel): TrackEval {
    const chain: Label[] = [];
    for (let l: Label | null = best; l; l = l.prev) chain.push(l);
    chain.reverse();
    const points: LatLon[] = chain.map(l => ({ lat: l.node.lat, lon: l.node.lon }));
    const legs: OptimisedLeg[] = [];
    const extra: Record<string, number> = {};
    for (let i = 1; i < chain.length; i++) {
        const l = chain[i];
        const le = l.leg as LegEval;
        for (const [k, v] of Object.entries(le.extra)) extra[k] = (extra[k] ?? 0) + v;
        legs.push({
            from: points[i - 1],
            to: points[i],
            distNm: le.distNm,
            course: le.course,
            sicw: l.sicw,
            rpm: fromTable(vessel.speedTable, l.sicw)?.rpm ?? null,
            sog: le.hours > 0 ? le.distNm / le.hours : 0,
            hours: le.hours,
            fuel: le.fuel,
            departMs: chain[i - 1].t,
            arriveMs: l.t,
            avgLossKn: le.avgLossKn,
            avgCurAlong: le.avgCurAlong,
            level: le.level,
            breachH: le.breachH,
            noWxH: le.noWxH,
            extra: le.extra,
        });
    }
    return {
        points,
        legs,
        distNm: legs.reduce((s, l) => s + l.distNm, 0),
        hours: legs.reduce((s, l) => s + l.hours, 0),
        fuel: best.fuel,
        cost: best.cost,
        eta: best.t,
        breachH: best.breachH,
        noWxH: legs.reduce((s, l) => s + l.noWxH, 0),
        forbidden: false,
        extra,
    };
}

/**
 * Sail a given list of points (GC legs between them) with a calm-water speed per leg, through the
 * same weather/fuel model as the optimiser. For comparing the user's own route or a fixed track.
 */
export function evaluateTrack(points: LatLon[], sicwPerLeg: number[], etd: number, vessel: Vessel, th: Thresholds, env: OptimiseEnv, opts: OptimiseOptions = {}): TrackEval {
    const m = makeModel(vessel, th, env, { ...opts, limits: 'soft' });
    const legs: OptimisedLeg[] = [];
    const extra: Record<string, number> = {};
    let t = etd;
    let cost = 0;
    let forbidden = false;
    for (let i = 1; i < points.length; i++) {
        const v = sicwPerLeg[Math.min(i - 1, sicwPerLeg.length - 1)];
        const le = evalLeg(m, points[i - 1], points[i], t, v);
        if (le.forbidden) forbidden = true;
        cost += le.cost;
        for (const [k, x] of Object.entries(le.extra)) extra[k] = (extra[k] ?? 0) + x;
        legs.push({
            from: points[i - 1],
            to: points[i],
            distNm: le.distNm,
            course: le.course,
            sicw: v,
            rpm: fromTable(vessel.speedTable, v)?.rpm ?? null,
            sog: le.hours > 0 ? le.distNm / le.hours : 0,
            hours: le.hours,
            fuel: le.fuel,
            departMs: t,
            arriveMs: le.arriveMs,
            avgLossKn: le.avgLossKn,
            avgCurAlong: le.avgCurAlong,
            level: le.level,
            breachH: le.breachH,
            noWxH: le.noWxH,
            extra: le.extra,
        });
        t = le.arriveMs;
    }
    return {
        points,
        legs,
        distNm: legs.reduce((s, l) => s + l.distNm, 0),
        hours: legs.reduce((s, l) => s + l.hours, 0),
        fuel: legs.reduce((s, l) => s + l.fuel, 0),
        cost,
        eta: t,
        breachH: legs.reduce((s, l) => s + l.breachH, 0),
        noWxH: legs.reduce((s, l) => s + l.noWxH, 0),
        forbidden,
        extra,
    };
}

/** The given track at the one constant calm-water speed (within the speed range) that arrives closest to `eta`, found by bisection. */
export function constantSpeedTrack(points: LatLon[], etd: number, eta: number, vessel: Vessel, th: Thresholds, env: OptimiseEnv, opts: OptimiseOptions, speeds: number[]): TrackEval {
    let lo = speeds[0];
    let hi = speeds[speeds.length - 1];
    const at = (v: number) => evaluateTrack(points, [v], etd, vessel, th, env, opts);
    let best = at(hi);
    if (best.eta > eta) return best; // even full speed is late: show full speed
    const slow = at(lo);
    if (slow.eta <= eta) return slow; // even the slowest speed arrives early: no need for more
    for (let i = 0; i < 25; i++) {
        const mid = (lo + hi) / 2;
        const e = at(mid);
        if (e.eta <= eta) {
            best = e;
            hi = mid;
        } else lo = mid;
        if (hi - lo < 0.01) break;
    }
    return best;
}

// ---------- GC / RL / composite versions of a track ----------

export type RouteStyle = 'GC' | 'RL' | 'composite' | 'asPlanned';

export interface StyledWaypoint extends LatLon {
    /** Leg type of the leg ARRIVING here (as in the route model) */
    legType: LegType;
}

export interface StyleOptions {
    /** Nodes closer than this to the straightened leg are dropped, nm (default 3) */
    toleranceNm?: number;
    /** Composite: the latitude the route must not pass, ° (positive north, negative south) */
    limitLat?: number;
    /** asPlanned: the user's own route, whose leg types are copied to the nearest optimised legs */
    planned?: { lat: number; lon: number; legType: LegType }[];
}

/** Perpendicular distance (nm) of point p from the leg a→b of type `type`, by sampling the leg. */
function offLegNm(p: LatLon, a: LatLon, b: LatLon, type: LegType): number {
    const g = legGeometry(a, b, type);
    const n = Math.max(2, Math.ceil(g.distNm / 5));
    let best = Infinity;
    for (let i = 0; i <= n; i++) best = Math.min(best, quickNm(p, g.pointAt((g.distNm * i) / n)));
    return best;
}

/** Douglas–Peucker on the node list, deviation measured against GC or RL legs. */
export function simplifyTrack(points: LatLon[], type: LegType, toleranceNm = 3): LatLon[] {
    if (points.length <= 2) return [...points];
    const keep = new Array(points.length).fill(false);
    keep[0] = keep[points.length - 1] = true;
    const rec = (i0: number, i1: number) => {
        if (i1 - i0 < 2) return;
        let worst = -1;
        let wd = toleranceNm;
        for (let i = i0 + 1; i < i1; i++) {
            const d = offLegNm(points[i], points[i0], points[i1], type);
            if (d > wd) {
                wd = d;
                worst = i;
            }
        }
        if (worst >= 0) {
            keep[worst] = true;
            rec(i0, worst);
            rec(worst, i1);
        }
    };
    rec(0, points.length - 1);
    return points.filter((_, i) => keep[i]);
}

/**
 * Longitude of the vertex of the great circle through `p` whose highest latitude is `limitLat`
 * (spherical formula tan φ = tan L · cos(λ − λv)), on the side towards `towardsLon`. Null when
 * `p` is already at or beyond the limiting latitude.
 */
function tangentVertexLon(p: LatLon, limitLat: number, towardsLon: number): number | null {
    const r = Math.tan(p.lat * D2R) / Math.tan(limitLat * D2R);
    if (!(r < 1) || r < -1) return null;
    const d = Math.acos(r) / D2R;
    const sign = norm180(towardsLon - p.lon) >= 0 ? 1 : -1;
    return wrapLon(p.lon + sign * d);
}

/** Highest |latitude| along a GC leg (sampled), with its sign. */
function vertexLat(a: LatLon, b: LatLon): number {
    const g = legGeometry(a, b, 'GC');
    const n = Math.max(2, Math.ceil(g.distNm / 20));
    let best = a.lat;
    for (let i = 0; i <= n; i++) {
        const lat = g.pointAt((g.distNm * i) / n).lat;
        if (Math.abs(lat) > Math.abs(best)) best = lat;
    }
    return best;
}

/**
 * Turn an optimised track into waypoints of one style:
 *  - 'GC': straightened into as few great-circle legs as the tolerance allows;
 *  - 'RL': straightened into rhumb-line legs (each leg a constant course);
 *  - 'composite': GC legs, but no leg goes beyond `limitLat`: where it would, the leg becomes
 *    GC to the limiting parallel, RL along the parallel, GC down to the next point (Bowditch,
 *    "composite sailing");
 *  - 'asPlanned': straightened track, each leg taking the leg type of the user's own leg it lies
 *    nearest to (`planned`), so the user's RL/GC choice is kept.
 */
export function toLegType(track: LatLon[], style: RouteStyle, opts: StyleOptions = {}): StyledWaypoint[] {
    const tol = opts.toleranceNm ?? 3;
    if (style === 'RL') return simplifyTrack(track, 'RL', tol).map(p => ({ ...p, legType: 'RL' as LegType }));
    if (style === 'asPlanned') {
        const pts = simplifyTrack(track, 'GC', tol);
        const planned = opts.planned ?? [];
        return pts.map((p, i) => {
            if (i === 0 || planned.length < 2) return { ...p, legType: 'GC' as LegType };
            const mid = legGeometry(pts[i - 1], p, 'GC');
            const mp = mid.pointAt(mid.distNm / 2);
            let best = 1;
            let bd = Infinity;
            for (let j = 1; j < planned.length; j++) {
                const d = offLegNm(mp, planned[j - 1], planned[j], planned[j].legType);
                if (d < bd) {
                    bd = d;
                    best = j;
                }
            }
            return { ...p, legType: planned[best].legType };
        });
    }
    const pts = simplifyTrack(track, 'GC', tol);
    const out: StyledWaypoint[] = [{ ...pts[0], legType: 'GC' }];
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const L = opts.limitLat;
        if (style === 'composite' && L != null && L !== 0) {
            const v = vertexLat(a, b);
            const beyond = L > 0 ? v > L + 1e-6 : v < L - 1e-6;
            if (beyond) {
                const l1 = tangentVertexLon(a, L, b.lon);
                const l2 = tangentVertexLon(b, L, a.lon);
                const v1: LatLon = l1 == null ? { lat: L, lon: a.lon } : { lat: L, lon: l1 };
                const v2: LatLon = l2 == null ? { lat: L, lon: b.lon } : { lat: L, lon: l2 };
                // Only sensible when the first vertex comes before the second along the way
                const fwd = Math.sign(norm180(b.lon - a.lon)) || 1;
                if (norm180(v2.lon - v1.lon) * fwd > 1e-6) {
                    if (l1 != null) out.push({ ...v1, legType: 'GC' });
                    out.push({ ...v2, legType: 'RL' });
                    out.push({ ...b, legType: 'GC' });
                    continue;
                }
            }
        }
        out.push({ ...b, legType: 'GC' });
    }
    return out;
}

/** Total distance (nm) of a styled waypoint list. */
export function styledDistance(wps: StyledWaypoint[]): number {
    let d = 0;
    for (let i = 1; i < wps.length; i++) d += legGeometry(wps[i - 1], wps[i], wps[i].legType).distNm;
    return d;
}

/** Highest |latitude| reached by a styled route (sampled), for checking a composite. */
export function maxAbsLat(wps: StyledWaypoint[]): number {
    let m = 0;
    for (let i = 1; i < wps.length; i++) {
        const g = legGeometry(wps[i - 1], wps[i], wps[i].legType);
        const n = Math.max(2, Math.ceil(g.distNm / 20));
        for (let j = 0; j <= n; j++) m = Math.max(m, Math.abs(g.pointAt((g.distNm * j) / n).lat));
    }
    return m;
}
