// Navigation maths on the WGS84 ellipsoid.
// Great circle (GC) legs use geographiclib (Karney). Rhumb line (RL) legs use the
// ellipsoidal loxodrome via meridian arc length and isometric latitude.
// Distances are in nautical miles (1852 m), courses in degrees true.

import * as geographiclib from 'geographiclib-geodesic';

// The package is CommonJS; read Geodesic from the namespace (works in Node and in the bundle).
const { Geodesic } = ((geographiclib as unknown as { default?: typeof geographiclib }).default ?? geographiclib);

export type LegType = 'RL' | 'GC';

export interface LatLon {
    lat: number;
    lon: number;
}

export interface LegGeometry {
    type: LegType;
    distNm: number;
    /** Course at the start of the leg (constant for RL) */
    course: number;
    /** Position and course after travelling `nm` along the leg */
    pointAt(nm: number): LatLon & { course: number };
}

const geod = Geodesic.WGS84;
const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const E = Math.sqrt(E2);
const NM = 1852;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;
export const norm180 = (deg: number): number => {
    const d = norm360(deg);
    return d > 180 ? d - 360 : d;
};

// Meridian arc length from the equator to latitude phi (radians), metres.
const M0 = 1 + (3 / 4) * E2 + (45 / 64) * E2 ** 2 + (175 / 256) * E2 ** 3;
const M2 = (3 / 8) * E2 + (15 / 32) * E2 ** 2 + (525 / 1024) * E2 ** 3;
const M4 = (15 / 256) * E2 ** 2 + (105 / 1024) * E2 ** 3;
const M6 = (35 / 3072) * E2 ** 3;
export const meridianArc = (phi: number): number =>
    A * (1 - E2) * (M0 * phi - M2 * Math.sin(2 * phi) + M4 * Math.sin(4 * phi) - M6 * Math.sin(6 * phi));

// Inverse of meridianArc by Newton iteration.
const latFromArc = (m: number): number => {
    let phi = m / (A * (1 - E2) * M0);
    for (let i = 0; i < 8; i++) {
        const s = Math.sin(phi);
        const dmdphi = (A * (1 - E2)) / Math.pow(1 - E2 * s * s, 1.5);
        phi -= (meridianArc(phi) - m) / dmdphi;
    }
    return phi;
};

const isoLat = (phi: number): number => Math.atanh(Math.sin(phi)) - E * Math.atanh(E * Math.sin(phi));

const primeVertical = (phi: number): number => A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);

/** Rhumb line distance (nm) and course (deg) from a to b. Takes the shorter way round in longitude. */
export function rhumbInverse(a: LatLon, b: LatLon): { distNm: number; course: number } {
    const p1 = a.lat * D2R;
    const p2 = b.lat * D2R;
    const dl = norm180(b.lon - a.lon) * D2R;
    const dpsi = isoLat(p2) - isoLat(p1);
    const c = Math.atan2(dl, dpsi);
    let d: number;
    if (Math.abs(p2 - p1) < 1e-12) {
        d = Math.abs(dl) * primeVertical(p1) * Math.cos(p1);
    } else {
        d = (meridianArc(p2) - meridianArc(p1)) / Math.cos(c);
    }
    return { distNm: Math.abs(d) / NM, course: norm360(c * R2D) };
}

/** Point reached by sailing `distNm` on rhumb line `course` from `a`. Longitude is not wrapped. */
export function rhumbDirect(a: LatLon, course: number, distNm: number): LatLon {
    const p1 = a.lat * D2R;
    const c = course * D2R;
    const d = distNm * NM;
    const cosC = Math.cos(c);
    if (Math.abs(cosC) < 1e-12) {
        const dl = (d * Math.sin(c)) / (primeVertical(p1) * Math.cos(p1));
        return { lat: a.lat, lon: a.lon + dl * R2D };
    }
    const p2 = latFromArc(meridianArc(p1) + d * cosC);
    const dl = Math.tan(c) * (isoLat(p2) - isoLat(p1));
    return { lat: p2 * R2D, lon: a.lon + dl * R2D };
}

/** Geometry of one leg from a to b. */
export function legGeometry(a: LatLon, b: LatLon, type: LegType): LegGeometry {
    if (type === 'GC') {
        const inv = geod.Inverse(a.lat, a.lon, b.lat, b.lon);
        const line = geod.InverseLine(a.lat, a.lon, b.lat, b.lon);
        const distNm = (inv.s12 ?? 0) / NM;
        return {
            type,
            distNm,
            course: norm360(inv.azi1 ?? 0),
            pointAt(nm: number) {
                const p = line.Position(Math.min(Math.max(nm, 0), distNm) * NM);
                return { lat: p.lat2 ?? a.lat, lon: p.lon2 ?? a.lon, course: norm360(p.azi2 ?? 0) };
            },
        };
    }
    const { distNm, course } = rhumbInverse(a, b);
    return {
        type,
        distNm,
        course,
        pointAt(nm: number) {
            const p = rhumbDirect(a, course, Math.min(Math.max(nm, 0), distNm));
            return { ...p, course };
        },
    };
}

/**
 * Points along a leg for drawing on a Mercator map. Longitudes are kept continuous
 * (they may go beyond ±180) so the line does not jump across the map at the date line.
 * RL legs are straight on Mercator, so two points are enough.
 */
export function legPolyline(a: LatLon, b: LatLon, type: LegType, maxStepNm = 20): [number, number][] {
    const g = legGeometry(a, b, type);
    const steps = type === 'RL' ? 1 : Math.max(1, Math.ceil(g.distNm / maxStepNm));
    const pts: [number, number][] = [];
    let prevLon = a.lon;
    for (let i = 0; i <= steps; i++) {
        const p = i === steps ? b : g.pointAt((g.distNm * i) / steps);
        const lon = prevLon + norm180(p.lon - prevLon);
        pts.push([p.lat, lon]);
        prevLon = lon;
    }
    return pts;
}

/** One leg made of two parts, a→via then via→b (e.g. through the ship's present position). */
export function viaGeometry(first: LegGeometry, second: LegGeometry): LegGeometry {
    const d1 = first.distNm;
    return {
        type: first.type,
        distNm: d1 + second.distNm,
        course: first.course,
        pointAt: nm => (nm <= d1 ? first.pointAt(nm) : second.pointAt(nm - d1)),
    };
}

/** Wrap longitude into [-180, 180). */
export const wrapLon = (lon: number): number => {
    const l = norm360(lon + 180) - 180;
    return l === 180 ? -180 : l;
};
