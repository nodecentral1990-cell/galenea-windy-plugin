// Data model for the route, the vessel and the plan calculations (ETA, speed, slip).
// Times are UTC milliseconds. Speeds in knots, distances in nautical miles.

import { legGeometry, viaGeometry, type LegGeometry, type LegType } from './geo';

export interface Waypoint {
    /** Internal unique id (not the ECDIS number) */
    uid: string;
    name: string;
    lat: number;
    lon: number;
    /** Type of the leg ARRIVING at this waypoint (ignored for the first waypoint), as in RTZ */
    legType: LegType;
    /** Planned calm-water speed for the leg arriving here (kn). Empty = route default */
    speed: number | null;
    /** Weather/current allowance for the leg arriving here (kn, positive = slower) */
    allowance: number;
    /** Engine RPM for the leg arriving here (optional, for slip) */
    rpm: number | null;
    /** Speed at 0 slip for the leg arriving here (kn, optional, for slip) */
    engineSpeed: number | null;
    turnRadius?: number;
    xtdPort?: number;
    xtdStbd?: number;
    /** Ship's time offset from UTC in minutes for the leg arriving here (east positive). Kept for RTZ round trip; not shown */
    zoneMin?: number | null;
    /** Planned stop (drifting) at this waypoint, hours. Null/0 = no stop */
    delayH?: number | null;
    /** Arrival time fixed by the user (UTC ms). The legs before it are timed to arrive then */
    fixedEta?: number | null;
    /** Data from the source file kept for a faithful round trip (RTZ extensions etc.) */
    raw?: Record<string, unknown>;
}

export type ScheduleMode = 'speed' | 'eta';

export interface Route {
    name: string;
    waypoints: Waypoint[];
    defaultSpeed: number;
    defaultLegType: LegType;
    mode: ScheduleMode;
    /** ETD at the first waypoint, UTC ms */
    etd: number | null;
    /** Wanted ETA at the last waypoint (used in 'eta' mode), UTC ms */
    eta: number | null;
    /** How weather slows the ship: 'manual' = your allowance per leg, 'kwon' = estimate from forecast */
    lossMethod?: 'manual' | 'kwon';
    /** Add ocean currents (read from Windy's currents layer) to the speed over ground */
    useCurrents?: boolean;
    /** Track colour on the map */
    color?: string;
    /** Colour of the part already sailed, when a voyage is running */
    doneColor?: string;
    /** Voyage running on this route: started time, and the last present position typed in (UTC) */
    voyage?: { startedAt: number; fix?: { lat: number; lon: number; t: number } | null } | null;
    /** Information about the file the route came from */
    source?: { format: string; fileName?: string; raw?: Record<string, unknown> };
}

export interface Vessel {
    name: string;
    /** Length between perpendiculars, m (IMO MSC.1/Circ.1228 uses LBP) */
    lbp: number | null;
    loa: number | null;
    breadth: number | null;
    draftFwd: number | null;
    draftAft: number | null;
    gm: number | null;
    /** Measured natural roll period, s. Preferred over the estimate */
    rollPeriod: number | null;
    /** Propeller pitch, m (optional: lets RPM give the speed at 0 slip) */
    pitch: number | null;
    /** Owner's table: RPM, speed in calm water (kn), fuel (t/day) */
    speedTable?: SpeedRow[];
    /** Block coefficient (for the weather speed-loss estimate) */
    cb?: number | null;
    condition?: 'laden' | 'ballast';
    /** Ship type (see lib/shipTypes.ts); 'other' = old saved value, read as general cargo */
    shipType?: import('./shipTypes').ShipTypeId;
    /** Wind drift (leeway) when stopped, % of wind speed. Empty = estimated by the plugin */
    leewayPct?: number | null;
    /** Average height of the side above water incl. deck cargo / superstructure, m (for the drift estimate). Empty = typical for the type */
    windageHeight?: number | null;
    /** Drift direction off downwind when stopped, ° (+ = to the right of downwind). Empty = 0 */
    driftAngleDeg?: number | null;
    /** Bilge keel sections on ONE side (both sides taken as the same): length and breadth, m (roll estimate) */
    bilgeKeels?: { lengthM: number; breadthM: number }[] | null;
    /** KG above keel, m. Empty = estimated from breadth, draft and GM (roll estimate) */
    kg?: number | null;
    /** Roll damping of the bare hull, % of critical. Empty = 2 % (roll estimate) */
    hullRollDampingPct?: number | null;
    /** Roll / pitch (significant) above which the weather table marks the value, °. Empty = no mark */
    rollLimitDeg?: number | null;
    pitchLimitDeg?: number | null;
    /** RPM ranges the engine must not be run in (critical / barred speed range, cut-in / cut-out of shaft
     *  generator or boiler…) (owner, 2026-10-30). Never suggested by the plugin */
    barredRpm?: BarredRpm[] | null;
    /** When the measured roll period was entered (UTC ms) (owner, 2026-11-01) */
    rollPeriodDate?: number | null;
    /** How the forecast wave periods are read by the roll / pitch estimate. Empty = mean period (ECMWF) */
    wavePeriodKind?: 'tm-1' | 'tm01' | 'tp' | null;
    /** Rolls the master observed (optional log, to fine-tune the estimate) */
    rollObs?: RollObservation[] | null;
    /** Fine-tuning worked out from the observed rolls (applied only when switched on) */
    rollCalib?: RollCalibration | null;
    /** Height of the bridge clinometer above the waterline, m (review 2026-11-02: pendulum over-reading) */
    clinometerHeightM?: number | null;
}

/** Wave and wind values kept with an observation, so a later forecast never changes it */
export interface ObsWaves {
    hs: number | null;
    hsDir: number | null;
    hsPeriod: number | null;
    sw1: number | null;
    sw1Dir: number | null;
    sw1Period: number | null;
    sw2: number | null;
    sw2Dir: number | null;
    sw2Period: number | null;
    seaHs: number | null;
    seaDir: number | null;
    seaPeriod: number | null;
    seaWindy: boolean;
    windKn: number | null;
    windDir: number | null;
}

/** One roll the master saw (owner, 2026-11-01: optional; the plugin's own estimate stays the main figure) */
export interface RollObservation {
    id: string;
    /** UTC ms */
    t: number;
    lat: number;
    lon: number;
    headingDeg: number;
    /** Speed through the water, kn */
    speedKn: number;
    /** What was seen, degrees to one side (0 = not noted: a roll-period timing only) */
    observedDeg: number;
    /** Roll period timed at sea with the stopwatch in the ship window, s (owner, 2026-11-01), and rolls counted */
    periodS?: number | null;
    periodRolls?: number | null;
    /** 'max' = biggest roll in the last 10–20 minutes (what a clinometer shows); 'steady' = typical roll */
    kind: 'max' | 'steady';
    /** pendulum / electronic (accelerometer) clinometers over-read high above the roll axis; gyro = true angle */
    instrument: 'pendulum' | 'electronic' | 'gyro' | 'eye';
    /** Height of the clinometer above the waterline at the time, m (null = not given: no correction) */
    clinoHeightM?: number | null;
    note: string;
    /** An IMO parametric-roll warning applied at the time (such entries are left out of the fine-tuning) */
    parametric: boolean;
    /** Left out of the fine-tuning by the user */
    excluded?: boolean;
    waves: ObsWaves;
    /** Ship condition at the time */
    rollPeriodS: number | null;
    gm: number | null;
    draftM: number | null;
    /** Plugin's own estimate at the time, comparable with the observation, ° */
    estimateDeg: number | null;
    /** Plugin's own mean roll period at the time (zero-crossing period of the roll motion), s */
    estimatePeriodS?: number | null;
}

export interface RollCalibration {
    /** Applied to the estimate only when on (default off) */
    on: boolean;
    /** Multiplier on the roll damping */
    dampingFactor: number;
    /** Multiplier on the roll period */
    periodFactor: number;
    /** Observations used, and how many roll angles / timed roll periods among them */
    n: number;
    nAmp?: number;
    nPeriod?: number;
    /** Typical error of the plugin alone and fine-tuned, % */
    errBeforePct: number;
    errAfterPct: number;
    /** When worked out (UTC ms) and the roll period it was worked out with (fine-tuning applies only with that period) */
    at: number;
    rollPeriodS: number | null;
}

export interface BarredRpm {
    from: number | null;
    to: number | null;
    /** Why, in the user's words (e.g. "critical: vibration") */
    why: string;
}

export interface SpeedRow {
    rpm: number | null;
    /** Speed in calm water, kn */
    sicw: number | null;
    /** Fuel consumption, t/day */
    fuel: number | null;
    /** Engine power, kW (optional; for the graphs) (owner, 2026-10-29) */
    powerKw?: number | null;
}

export const emptyVessel = (): Vessel => ({
    name: '',
    lbp: null,
    loa: null,
    breadth: null,
    draftFwd: null,
    draftAft: null,
    gm: null,
    rollPeriod: null,
    pitch: null,
    speedTable: [],
    cb: null,
    condition: 'laden',
    shipType: 'container',
    leewayPct: null,
    windageHeight: null,
    driftAngleDeg: null,
    bilgeKeels: [],
    kg: null,
    hullRollDampingPct: null,
    rollLimitDeg: null,
    pitchLimitDeg: null,
});

let uidCounter = 0;
export const newUid = (): string => `wp${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export const newWaypoint = (lat: number, lon: number, legType: LegType = 'RL', name = ''): Waypoint => ({
    uid: newUid(),
    name,
    lat,
    lon,
    legType,
    speed: null,
    allowance: 0,
    rpm: null,
    engineSpeed: null,
});

export const newRoute = (name = 'New route'): Route => ({
    name,
    waypoints: [],
    defaultSpeed: 12,
    defaultLegType: 'RL',
    mode: 'speed',
    etd: null,
    eta: null,
});

export interface LegCalc {
    /** Index of the waypoint this leg arrives at (1..n-1) */
    index: number;
    type: LegType;
    distNm: number;
    course: number;
    cumNm: number;
    calmSpeed: number;
    allowance: number;
    /** Expected speed through water = calm speed − allowance */
    stw: number;
    /** Speed over ground used for the ETA (currents not yet included, so = stw) */
    sog: number;
    engineSpeed: number | null;
    /** Planned slip %, (engine speed − stw) / engine speed */
    slipPct: number | null;
    /** Speed over ground needed to keep a fixed time (ETA mode or a fixed waypoint ETA); null = planned speed */
    targetSog: number | null;
    hours: number;
    departMs: number | null;
    arriveMs: number | null;
    /** Stop at the arriving waypoint after this leg, hours */
    delayAfterH: number;
    geom: LegGeometry;
}

export interface PlanCalc {
    legs: LegCalc[];
    totalNm: number;
    totalHours: number;
    etd: number | null;
    eta: number | null;
    /** In 'eta' mode without fixed waypoint ETAs: the average speed over ground needed */
    requiredSog: number | null;
    /** Total planned stops, hours (included in the ETA) */
    totalDelayH: number;
    /** Stop at WP1 before departure, hours */
    delayAtStartH: number;
    problems: string[];
    /** Time-stepped track (when weather/currents are applied); positions come from here if present */
    track?: TrackPoint[];
    /**
     * Present position typed in during a voyage, placed on the track: leg index (in legs), distance
     * along that leg (nm), distance from WP1 (nm), distance off the track (nm) and time. The plan
     * from here on starts at this point and time.
     */
    fix?: { legIdx: number; sNm: number; alongNm: number; offNm: number; t: number; lat: number; lon: number } | null;
}

/** The point on the planned track nearest to a position (sampled, then refined). */
export function projectOnLegs(legs: LegCalc[], lat: number, lon: number): { legIdx: number; sNm: number; alongNm: number; offNm: number } | null {
    if (!legs.length) return null;
    const dist = (p: { lat: number; lon: number }) => {
        const dLat = (p.lat - lat) * 60;
        let dLon = p.lon - lon;
        if (dLon > 180) dLon -= 360;
        if (dLon < -180) dLon += 360;
        return Math.hypot(dLat, dLon * 60 * Math.cos((((p.lat + lat) / 2) * Math.PI) / 180));
    };
    let best = { legIdx: 0, sNm: 0, d: Infinity };
    legs.forEach((l, i) => {
        const n = Math.max(10, Math.ceil(l.distNm / 10));
        for (let j = 0; j <= n; j++) {
            const sNm = (l.distNm * j) / n;
            const d = dist(l.geom.pointAt(sNm));
            if (d < best.d) best = { legIdx: i, sNm, d };
        }
    });
    const l = legs[best.legIdx];
    const step = l.distNm / Math.max(10, Math.ceil(l.distNm / 10));
    for (let j = -40; j <= 40; j++) {
        const sNm = Math.max(0, Math.min(l.distNm, best.sNm + (step * j) / 40));
        const d = dist(l.geom.pointAt(sNm));
        if (d < best.d) best = { legIdx: best.legIdx, sNm, d };
    }
    return { legIdx: best.legIdx, sNm: best.sNm, alongNm: l.cumNm - l.distNm + best.sNm, offNm: best.d };
}

export interface TrackPoint {
    t: number;
    lat: number;
    lon: number;
    course: number;
    legIdx: number;
    stopped: boolean;
    /** Speed in calm water being used, kn */
    sicw: number;
    /** Speed through water, kn */
    stw: number;
    /** Speed over ground, kn */
    sog: number;
    /** Weather speed loss, kn */
    lossKn: number;
    /** Current along the track, kn (+ = helping) */
    curAlong: number;
    /** Drift while stopped: speed kn and direction TOWARDS, °T */
    drift?: { kn: number; toward: number } | null;
}

const HOUR = 3600_000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "25 Oct 21:40 UTC" for messages */
const utc = (ms: number | null | undefined): string => {
    if (ms == null) return '—';
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
};

/** Speed at 0 slip from RPM and pitch: pitch (m) × RPM × 60 min / 1852 m. */
export const engineSpeedFromRpm = (rpm: number | null, pitch: number | null): number | null =>
    rpm && pitch ? (pitch * rpm * 60) / 1852 : null;

export function computePlan(route: Route, vessel?: Vessel): PlanCalc {
    const wps = route.waypoints;
    const problems: string[] = [];
    const legs: LegCalc[] = [];
    let cum = 0;
    for (let i = 1; i < wps.length; i++) {
        const geom = legGeometry(wps[i - 1], wps[i], wps[i].legType);
        cum += geom.distNm;
        legs.push({
            index: i,
            type: wps[i].legType,
            distNm: geom.distNm,
            course: geom.course,
            cumNm: cum,
            calmSpeed: 0,
            allowance: wps[i].allowance || 0,
            stw: 0,
            sog: 0,
            engineSpeed: null,
            slipPct: null,
            targetSog: null,
            hours: 0,
            departMs: null,
            arriveMs: null,
            delayAfterH: i < wps.length - 1 ? Math.max(0, wps[i].delayH ?? 0) : 0,
            geom,
        });
    }
    let totalNm = cum;
    let requiredSog: number | null = null;

    const delayAtStartH = wps.length > 1 ? Math.max(0, wps[0].delayH ?? 0) : 0;
    const totalDelayH = delayAtStartH + legs.reduce((s, l) => s + l.delayAfterH, 0);
    // Fixed times split the voyage into stretches; each stretch gets speeds over ground that arrive
    // on time (planned stops inside it excluded), in proportion to the planned leg speeds. The ETA in 'eta' mode fixes the last waypoint.
    let stretches = 0;
    /** Fix speeds from leg `from` (departing at `depart`, its first `firstDist` nm still to go) to each fixed time after it */
    const applyAnchors = (from: number, depart: number, firstDist: number) => {
        const n = wps.length;
        let first = firstDist;
        for (let k = legs[from].index; k < n; k++) {
            const isEta = k === n - 1 && route.mode === 'eta';
            const tk = isEta ? route.eta : (wps[k].fixedEta ?? null);
            if (tk == null) continue;
            const part = legs.slice(from, k);
            if (!part.length) continue;
            const dists = part.map((l, j) => (j === 0 ? first : l.distNm));
            const stops = part.slice(0, -1).reduce((s, l) => s + l.delayAfterH, 0);
            const hours = (tk - depart) / HOUR - stops;
            if (hours <= 0) {
                const before = from === 0 && first === legs[0].distNm ? `the ETD (${utc(route.etd)})` : fixInfo && from === fixInfo.legIdx ? `your present position time (${utc(fixInfo.t)})` : `the fixed time at WP${legs[from].index}`;
                problems.push(
                    `${isEta ? `The ETA (${utc(tk)})` : `The fixed ETA 📌 at WP${k + 1} (${utc(tk)})`} is not after ${before}${stops || (from === 0 && delayAtStartH) ? ' plus the planned stops' : ''}, so it is ignored. ${isEta ? 'Change the ETA.' : 'Change or unfix it in the waypoint table (it may have come from the route file).'}`,
                );
                continue;
            }
            // Keep the planned speeds in proportion (e.g. slow in port, faster at sea), scaled to arrive on time
            const planned = part.map(l => (wps[l.index].speed ?? route.defaultSpeed) - l.allowance);
            if (planned.every(v => v > 0)) {
                const f = part.reduce((s, _l, j) => s + dists[j] / planned[j], 0) / hours;
                part.forEach((l, j) => (l.targetSog = planned[j] * f));
            } else {
                const sog = dists.reduce((s, d) => s + d, 0) / hours;
                part.forEach(l => (l.targetSog = sog));
            }
            stretches++;
            from = k;
            first = legs[from]?.distNm ?? 0;
            depart = tk + legs[k - 1].delayAfterH * HOUR;
            if (from >= legs.length) break;
        }
    };
    // Present position during a voyage: the plan restarts from there
    const vf = route.voyage?.fix;
    const fixInfo = vf && route.etd != null && legs.length ? (() => {
        const pr = projectOnLegs(legs, vf.lat, vf.lon);
        return pr && vf.t > route.etd ? { ...pr, t: vf.t, lat: vf.lat, lon: vf.lon } : null;
    })() : null;
    if (vf && !fixInfo && route.etd != null) problems.push('Present position: its time must be after the ETD.');
    if (fixInfo) {
        // The ship is at the present position, which may be off the planned track: the leg it is on
        // now runs from its start waypoint to the present position (sailed) and from there straight
        // to the leg's end waypoint (to go). The legs after it are unchanged; distances shift.
        const l = legs[fixInfo.legIdx];
        const here = { lat: fixInfo.lat, lon: fixInfo.lon };
        const g1 = legGeometry(wps[l.index - 1], here, l.type);
        const g2 = legGeometry(here, wps[l.index], l.type);
        l.geom = viaGeometry(g1, g2);
        l.distNm = g1.distNm + g2.distNm;
        let c = 0;
        for (const x of legs) {
            c += x.distNm;
            x.cumNm = c;
        }
        totalNm = c;
        fixInfo.sNm = g1.distNm;
        fixInfo.alongNm = l.cumNm - l.distNm + g1.distNm;
    }
    if (route.etd != null && legs.length) {
        applyAnchors(0, route.etd + delayAtStartH * HOUR, legs[0].distNm);
        if (fixInfo) {
            legs.slice(fixInfo.legIdx).forEach(l => (l.targetSog = null));
            stretches = 0;
            applyAnchors(fixInfo.legIdx, fixInfo.t, legs[fixInfo.legIdx].distNm - fixInfo.sNm);
        }
    }
    if (route.mode === 'eta' && stretches === 1 && legs.length && legs.every(l => l.targetSog != null) && route.etd != null && route.eta != null) {
        requiredSog = totalNm / ((route.eta - route.etd) / HOUR - totalDelayH);
    }

    for (const leg of legs) {
        const wp = wps[leg.index];
        if (leg.targetSog != null) {
            leg.sog = leg.targetSog;
            leg.stw = leg.targetSog;
            leg.calmSpeed = leg.targetSog + leg.allowance;
        } else {
            leg.calmSpeed = wp.speed ?? route.defaultSpeed;
            leg.stw = leg.calmSpeed - leg.allowance;
            leg.sog = leg.stw;
        }
        if (leg.sog <= 0) {
            problems.push(`Leg to WP${leg.index + 1}: speed must be above 0.`);
            leg.hours = 0;
        } else {
            leg.hours = leg.distNm / leg.sog;
        }
        leg.engineSpeed = wp.engineSpeed ?? engineSpeedFromRpm(wp.rpm, vessel?.pitch ?? null);
        leg.slipPct =
            leg.engineSpeed && leg.engineSpeed > 0
                ? ((leg.engineSpeed - leg.stw) / leg.engineSpeed) * 100
                : null;
    }

    let eta: number | null = null;
    if (route.etd != null) {
        let t = route.etd + delayAtStartH * HOUR;
        const t0 = t;
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            if (fixInfo && i <= fixInfo.legIdx) {
                // Before the present position: sailed at the average rate from ETD to the fix
                const rate = fixInfo.alongNm / Math.max(1e-6, (fixInfo.t - t0) / HOUR);
                const at = (nm: number) => t0 + (nm / Math.max(1e-6, rate)) * HOUR;
                if (i < fixInfo.legIdx) {
                    leg.departMs = at(leg.cumNm - leg.distNm);
                    leg.arriveMs = at(leg.cumNm);
                    leg.hours = leg.distNm / Math.max(1e-6, rate);
                    t = leg.arriveMs;
                    continue;
                }
                // The leg with the fix: from the fix at the new speed
                const rem = leg.distNm - fixInfo.sNm;
                leg.hours = leg.sog > 0 ? rem / leg.sog : 0;
                leg.departMs = fixInfo.t - (leg.sog > 0 ? (fixInfo.sNm / leg.sog) * HOUR : 0);
                leg.arriveMs = fixInfo.t + leg.hours * HOUR;
                t = leg.arriveMs + leg.delayAfterH * HOUR;
                continue;
            }
            leg.departMs = t;
            t += leg.hours * HOUR;
            leg.arriveMs = t;
            t += leg.delayAfterH * HOUR;
        }
        eta = legs.length ? (legs[legs.length - 1].arriveMs as number) : t;
    }
    const totalHours = legs.reduce((s, l) => s + l.hours, 0);
    return { legs, totalNm, totalHours, etd: route.etd, eta, requiredSog, totalDelayH, delayAtStartH, problems, fix: fixInfo };
}

export interface ShipPosition {
    time: number;
    lat: number;
    lon: number;
    course: number;
    /** Index of the leg (in plan.legs) the ship is on; -1 before departure */
    legIdx: number;
    /** Distance run from WP1, nm */
    runNm: number;
    /** True while stopped (planned delay at a waypoint) */
    stopped?: boolean;
}

/** Planned position of the ship at time t (UTC ms). Null if there is no ETD or no legs. */
export function positionAt(route: Route, plan: PlanCalc, t: number): ShipPosition | null {
    if (plan.etd == null || plan.legs.length === 0) {
        return null;
    }
    if (plan.track && plan.track.length > 1) {
        return trackPositionAt(plan, t);
    }
    const first = route.waypoints[0];
    const firstLeg = plan.legs[0];
    if (t <= (firstLeg.departMs ?? plan.etd)) {
        return { time: t, lat: first.lat, lon: first.lon, course: firstLeg.course, legIdx: -1, runNm: 0, stopped: t >= plan.etd && plan.delayAtStartH > 0 };
    }
    for (let i = 0; i < plan.legs.length; i++) {
        const leg = plan.legs[i];
        if (leg.arriveMs != null && leg.departMs != null && t <= leg.arriveMs) {
            const nm = ((t - leg.departMs) / HOUR) * leg.sog;
            const p = leg.geom.pointAt(nm);
            return { time: t, lat: p.lat, lon: p.lon, course: p.course, legIdx: i, runNm: leg.cumNm - leg.distNm + nm };
        }
        const next = plan.legs[i + 1];
        if (next && leg.arriveMs != null && next.departMs != null && t < next.departMs) {
            // Stopped at the waypoint between this leg and the next
            const p = leg.geom.pointAt(leg.distNm);
            return { time: t, lat: p.lat, lon: p.lon, course: next.course, legIdx: i, runNm: leg.cumNm, stopped: true };
        }
    }
    const last = plan.legs[plan.legs.length - 1];
    const end = last.geom.pointAt(last.distNm);
    return { time: t, lat: end.lat, lon: end.lon, course: end.course, legIdx: plan.legs.length - 1, runNm: plan.totalNm };
}

function trackPositionAt(plan: PlanCalc, t: number): ShipPosition {
    const tr = plan.track as TrackPoint[];
    if (t <= tr[0].t) {
        const a = tr[0];
        return { time: t, lat: a.lat, lon: a.lon, course: a.course, legIdx: a.legIdx < 0 ? -1 : a.legIdx, runNm: 0, stopped: a.stopped };
    }
    let lo = 0;
    let hi = tr.length - 1;
    if (t >= tr[hi].t) {
        const z = tr[hi];
        return { time: t, lat: z.lat, lon: z.lon, course: z.course, legIdx: z.legIdx, runNm: plan.totalNm };
    }
    while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (tr[m].t <= t) lo = m;
        else hi = m;
    }
    const a = tr[lo];
    const b = tr[hi];
    const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    let dLon = b.lon - a.lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const leg = plan.legs[Math.max(0, a.legIdx)];
    return {
        time: t,
        lat: a.lat + (b.lat - a.lat) * f,
        lon: a.lon + dLon * f,
        course: a.course,
        legIdx: a.legIdx,
        runNm: leg ? leg.cumNm - leg.distNm : 0,
        stopped: a.stopped,
    };
}

/** Ship positions from ETD every `stepHours`, plus the arrival. */
export function shipPositions(route: Route, plan: PlanCalc, stepHours: number, max = 2000): ShipPosition[] {
    if (plan.etd == null || plan.eta == null || stepHours <= 0) {
        return [];
    }
    const out: ShipPosition[] = [];
    for (let t = plan.etd; t < plan.eta && out.length < max; t += stepHours * HOUR) {
        const p = positionAt(route, plan, t);
        if (p) {
            out.push(p);
        }
    }
    const end = positionAt(route, plan, plan.eta);
    if (end) {
        out.push(end);
    }
    return out;
}

/** Ship's time offset (minutes) for a position: the leg's zone if the file gave one, else nautical zone from longitude. */
export function zoneOffsetMin(route: Route, legIdx: number, lon: number): number {
    const wp = legIdx >= 0 ? route.waypoints[legIdx + 1] : route.waypoints[0];
    if (wp && wp.zoneMin != null) {
        return wp.zoneMin;
    }
    return Math.round(lon / 15) * 60;
}
