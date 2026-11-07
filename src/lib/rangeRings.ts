// Range rings around the ship (owner, 2026-11-02): three rings whose spacing follows the map scale (10 / 20 / 30 nm,
// 20 / 40 / 60 … 100 / 200 / 300 …) so the distance to a weather system or the land can be judged at a glance.
// Pure logic; tested in test/rangerings.test.ts.

import type { LatLon } from './geo';

/** Ring spacings offered, nm */
export const RING_STEPS = [0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];

/**
 * Spacing for 3 rings so that the outer ring is about 40 % of the smaller map side (span in nm).
 * Returns the nearest offered step.
 */
export function ringStep(minSpanNm: number): number {
    if (!(minSpanNm > 0)) return 10;
    const want = (minSpanNm * 0.4) / 3;
    let best = RING_STEPS[0];
    for (const s of RING_STEPS) if (Math.abs(Math.log(s / want)) < Math.abs(Math.log(best / want))) best = s;
    return best;
}

/** Points of a circle of `radiusNm` around `c` (great-circle distance on a sphere), longitudes kept continuous */
export function circlePoints(c: LatLon, radiusNm: number, n = 96): [number, number][] {
    const R = 3440.065;
    const d = radiusNm / R;
    const la1 = (c.lat * Math.PI) / 180;
    const lo1 = (c.lon * Math.PI) / 180;
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
        const b = (2 * Math.PI * i) / n;
        const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
        let lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
        let lon = (lo2 * 180) / Math.PI;
        while (lon - c.lon > 180) lon -= 360;
        while (lon - c.lon < -180) lon += 360;
        out.push([(la2 * 180) / Math.PI, lon]);
    }
    return out;
}

/** Label of a ring distance */
export const ringLabel = (nm: number): string => `${nm < 1 ? nm.toFixed(1) : nm.toFixed(0)} nm`;
