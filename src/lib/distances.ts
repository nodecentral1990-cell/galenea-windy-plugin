// Point 8 (owner, 2026-11-02): places near the planned route (ports, canals, straits) with the distance along
// the route, distance to go and ETA at the plan's speeds. Pure logic; tested in test/seanet.test.ts.

import { projectOnLegs, type PlanCalc } from './model';
import { PASSAGES, ports, sphereNm } from './seaNet';

export interface RoutePlace {
    name: string;
    kind: 'port' | 'canal' | 'strait' | 'cape';
    code?: string;
    lat: number;
    lon: number;
    /** Along the route from the first waypoint, nm */
    alongNm: number;
    toGoNm: number;
    /** How far off the route line, nm */
    offNm: number;
    etaMs: number | null;
    note?: string;
}

/** Ports within `portNm` and canals / straits / capes within their own range of the route, in route order */
export function placesAlongRoute(plan: PlanCalc, portNm = 25): RoutePlace[] {
    if (!plan.legs.length) return [];
    const out: RoutePlace[] = [];
    // quick filter: only places inside the route's box (plus a margin)
    const pts = plan.legs.flatMap(l => {
        const n = Math.max(2, Math.ceil(l.distNm / 50));
        return Array.from({ length: n + 1 }, (_, i) => l.geom.pointAt((l.distNm * i) / n));
    });
    const near = (lat: number, lon: number, nm: number) => pts.some(p => sphereNm(p, { lat, lon }) <= nm + 30);
    const add = (name: string, kind: RoutePlace['kind'], lat: number, lon: number, maxOff: number, extra: Partial<RoutePlace> = {}) => {
        if (!near(lat, lon, maxOff)) return;
        const pr = projectOnLegs(plan.legs, lat, lon);
        if (!pr || pr.offNm > maxOff) return;
        const leg = plan.legs[pr.legIdx];
        const etaMs = leg.departMs != null && leg.arriveMs != null && leg.distNm > 0 ? leg.departMs + (pr.sNm / leg.distNm) * (leg.arriveMs - leg.departMs) : null;
        out.push({ name, kind, lat, lon, alongNm: pr.alongNm, toGoNm: Math.max(0, plan.totalNm - pr.alongNm), offNm: pr.offNm, etaMs, ...extra });
    };
    for (const p of ports()) add(p.name, 'port', p.lat, p.lon, portNm, { code: p.code });
    for (const ps of PASSAGES) {
        const q = ps.points[0];
        add(ps.name, ps.kind, q.lat, q.lon, ps.kind === 'cape' ? 80 : 30, ps.lengthNote ? { note: ps.lengthNote } : {});
    }
    return out.sort((a, b) => a.alongNm - b.alongNm);
}
