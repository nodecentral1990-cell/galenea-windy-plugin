// Turning an optimiser result into routes the user can compare and take: the stretch of the route
// being optimised (WP a → WP b, timed as planned), the optimised track as GC, RL and composite
// legs, each sailed through the same weather / fuel model at one speed meeting the same ETA, and
// putting the chosen version back into the route.

import { legGeometry, type LatLon, type LegType } from './geo';
import type { PlanCalc, Route, Vessel, Waypoint } from './model';
import { newWaypoint } from './model';
import { constantSpeedTrack, toLegType, type OptimiseEnv, type OptimiseOptions, type OptimiseResult, type StyledWaypoint, type TrackEval } from './optimise';
import type { Thresholds } from './weather';

/** Departure from WP a and arrival at WP b (indexes in route.waypoints) in the current plan. */
export function stretchTimes(plan: PlanCalc, a: number, b: number): { etd: number | null; eta: number | null } {
    const dep = plan.legs.find(l => l.index === a + 1)?.departMs ?? null;
    const arr = plan.legs.find(l => l.index === b)?.arriveMs ?? null;
    return { etd: dep, eta: arr };
}

/** Points along styled legs every `stepNm`, so GC steps between them follow RL legs closely too. */
export function densify(wps: { lat: number; lon: number; legType: LegType }[], stepNm = 30): LatLon[] {
    if (!wps.length) return [];
    const out: LatLon[] = [{ lat: wps[0].lat, lon: wps[0].lon }];
    for (let i = 1; i < wps.length; i++) {
        const g = legGeometry(wps[i - 1], wps[i], wps[i].legType);
        const n = Math.max(1, Math.ceil(g.distNm / stepNm));
        for (let j = 1; j <= n; j++) {
            const p = g.pointAt((g.distNm * j) / n);
            out.push({ lat: p.lat, lon: p.lon });
        }
    }
    return out;
}

export type VersionId = 'planned' | 'optimised' | 'GC' | 'RL' | 'composite';

export interface RouteVersion {
    id: VersionId;
    label: string;
    /** Waypoints of the stretch, first = WP a, last = WP b (leg type = leg arriving there) */
    wps: StyledWaypoint[];
    /** Calm-water speed per leg (same length as wps − 1) */
    speeds: number[];
    ev: TrackEval;
    /** Highest latitude reached (north or south, °) */
    maxLat: number;
    /** Largest roll / pitch estimate (significant, °) along the way; null = no estimate */
    motion?: { roll: number; pitch: number } | null;
}

const maxLatOf = (pts: LatLon[]) => pts.reduce((m, p) => (Math.abs(p.lat) > Math.abs(m) ? p.lat : m), 0);

/**
 * The versions shown side by side: your route, the optimised track as found (speed changing leg
 * by leg), and the optimised track straightened into GC, RL and composite legs at one speed.
 * Composite (owner, 2026-10-28) = each leg takes the RL / GC choice of your own leg it lies nearest to.
 */
export function buildVersions(
    res: OptimiseResult,
    planned: { lat: number; lon: number; legType: LegType }[],
    etd: number,
    eta: number,
    vessel: Vessel,
    th: Thresholds,
    env: OptimiseEnv,
    opts: OptimiseOptions,
): RouteVersion[] {
    const out: RouteVersion[] = [];
    const sailed = (id: VersionId, label: string, wps: StyledWaypoint[]) => {
        const pts = densify(wps);
        const ev = constantSpeedTrack(pts, etd, eta, vessel, th, env, opts, res.speeds);
        const v = ev.legs[0]?.sicw ?? res.speeds[0];
        out.push({ id, label, wps, speeds: wps.slice(1).map(() => v), ev, maxLat: maxLatOf(pts) });
    };
    const mine: StyledWaypoint[] = planned.map((p, i) => ({ lat: p.lat, lon: p.lon, legType: i === 0 ? 'GC' : p.legType }));
    sailed('planned', 'Your route', mine);
    if (!res.route) return out;
    const track = res.route.points;
    out.push({
        id: 'optimised',
        label: 'Optimised (speed per leg)',
        wps: track.map(p => ({ lat: p.lat, lon: p.lon, legType: 'GC' as LegType })),
        speeds: res.route.legs.map(l => l.sicw),
        ev: res.route,
        maxLat: maxLatOf(track),
    });
    sailed('GC', 'Optimised as great circles', toLegType(track, 'GC', { toleranceNm: 5 }));
    sailed('RL', 'Optimised as rhumb lines', toLegType(track, 'RL', { toleranceNm: 5 }));
    const comp = toLegType(track, 'asPlanned', { toleranceNm: 5, planned });
    sailed('composite', 'Optimised composite (your RL / GC choice per leg)', comp);
    return out;
}

/** The route with WP a → WP b replaced by a version (WP a and WP b themselves are kept). */
export function applyVersion(route: Route, a: number, b: number, v: RouteVersion): Waypoint[] {
    const before = route.waypoints.slice(0, a + 1);
    const after = route.waypoints.slice(b).map(w => ({ ...w }));
    const mid = v.wps.slice(1, -1).map((p, i) => ({ ...newWaypoint(p.lat, p.lon, p.legType), name: `OPT${i + 1}`, speed: Math.round(v.speeds[i] * 10) / 10 }));
    after[0].legType = v.wps[v.wps.length - 1].legType;
    after[0].speed = Math.round(v.speeds[v.speeds.length - 1] * 10) / 10;
    return [...before.map(w => ({ ...w })), ...mid, ...after];
}
