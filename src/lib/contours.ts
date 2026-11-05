// Lines of equal value (like isobars) on a regular latitude / longitude grid: marching squares,
// with the short pieces joined into lines. Used for the wave chart (lines of equal wave height).

export interface Grid2D {
    /** South-west corner of the grid */
    lat0: number;
    lon0: number;
    /** Spacing, ° */
    dLat: number;
    dLon: number;
    /** values[row][col], row 0 = south; NaN = no value (land, no forecast) */
    values: number[][];
}

export type Line = [number, number][]; // [lat, lon] points

/** Bilinear refinement: `k` times finer, so the lines come out smooth. NaN stays NaN nearby. */
export function refine(g: Grid2D, k: number): Grid2D {
    if (k <= 1) return g;
    const R = g.values.length;
    const C = g.values[0]?.length ?? 0;
    const out: number[][] = [];
    for (let r = 0; r <= (R - 1) * k; r++) {
        const row: number[] = [];
        const y = r / k;
        const r0 = Math.min(R - 2, Math.floor(y));
        const fy = y - r0;
        for (let c = 0; c <= (C - 1) * k; c++) {
            const x = c / k;
            const c0 = Math.min(C - 2, Math.floor(x));
            const fx = x - c0;
            const a = g.values[r0][c0];
            const b = g.values[r0][c0 + 1];
            const d = g.values[r0 + 1][c0];
            const e = g.values[r0 + 1][c0 + 1];
            row.push((a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy);
        }
        out.push(row);
    }
    return { lat0: g.lat0, lon0: g.lon0, dLat: g.dLat / k, dLon: g.dLon / k, values: out };
}

/** Lines where the grid crosses `level`. */
export function isolines(g: Grid2D, levelIn: number): Line[] {
    // a hair above the level, so a grid value exactly on it never makes a zero-length piece
    const level = levelIn + 1e-9;
    const V = g.values;
    const R = V.length;
    const C = V[0]?.length ?? 0;
    const segs: [[number, number], [number, number]][] = [];
    // point on the edge between grid nodes (r1,c1) and (r2,c2) where the value equals the level
    const edge = (r1: number, c1: number, r2: number, c2: number): [number, number] => {
        const a = V[r1][c1];
        const b = V[r2][c2];
        const f = a === b ? 0.5 : (level - a) / (b - a);
        return [g.lat0 + (r1 + (r2 - r1) * f) * g.dLat, g.lon0 + (c1 + (c2 - c1) * f) * g.dLon];
    };
    for (let r = 0; r < R - 1; r++) {
        for (let c = 0; c < C - 1; c++) {
            const v0 = V[r][c]; // SW
            const v1 = V[r][c + 1]; // SE
            const v2 = V[r + 1][c + 1]; // NE
            const v3 = V[r + 1][c]; // NW
            if (![v0, v1, v2, v3].every(Number.isFinite)) continue;
            const idx = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0);
            if (idx === 0 || idx === 15) continue;
            const S = () => edge(r, c, r, c + 1);
            const E = () => edge(r, c + 1, r + 1, c + 1);
            const N = () => edge(r + 1, c, r + 1, c + 1);
            const W = () => edge(r, c, r + 1, c);
            const centreHigh = (v0 + v1 + v2 + v3) / 4 >= level;
            switch (idx) {
                case 1: case 14: segs.push([W(), S()]); break;
                case 2: case 13: segs.push([S(), E()]); break;
                case 3: case 12: segs.push([W(), E()]); break;
                case 4: case 11: segs.push([E(), N()]); break;
                case 6: case 9: segs.push([S(), N()]); break;
                case 7: case 8: segs.push([W(), N()]); break;
                case 5:
                    if (centreHigh) segs.push([W(), N()], [S(), E()]);
                    else segs.push([W(), S()], [E(), N()]);
                    break;
                case 10:
                    if (centreHigh) segs.push([W(), S()], [E(), N()]);
                    else segs.push([W(), N()], [S(), E()]);
                    break;
            }
        }
    }
    return joinSegments(segs);
}

/** Join pieces that share end points into longer lines. */
function joinSegments(segs: [[number, number], [number, number]][]): Line[] {
    const key = (p: [number, number]) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    const ends = new Map<string, number[]>();
    segs.forEach((s, i) => {
        for (const p of s) {
            const k = key(p);
            const l = ends.get(k);
            if (l) l.push(i);
            else ends.set(k, [i]);
        }
    });
    const used = new Array(segs.length).fill(false);
    const lines: Line[] = [];
    const nextFrom = (p: [number, number]): [number, number] | null => {
        for (const j of ends.get(key(p)) ?? []) {
            if (used[j]) continue;
            used[j] = true;
            const [a, b] = segs[j];
            return key(a) === key(p) ? b : a;
        }
        return null;
    };
    for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const line: Line = [segs[i][0], segs[i][1]];
        for (let q = nextFrom(line[line.length - 1]); q; q = nextFrom(line[line.length - 1])) line.push(q);
        for (let q = nextFrom(line[0]); q; q = nextFrom(line[0])) line.unshift(q);
        lines.push(line);
    }
    return lines;
}

/** Levels from `min` upwards every `step` up to the highest value in the grid. */
export function levelsFor(g: Grid2D, min: number, step: number): number[] {
    let hi = -Infinity;
    for (const row of g.values) for (const v of row) if (Number.isFinite(v) && v > hi) hi = v;
    const out: number[] = [];
    if (!(step > 0) || !Number.isFinite(hi)) return out;
    for (let l = Math.max(step, Math.ceil((min - 1e-9) / step) * step); l <= hi + 1e-9 && out.length < 60; l += step) out.push(Math.round(l * 100) / 100);
    return out;
}

/** Catmull-Rom (smooth curve) refinement, `k` times finer: curved lines instead of straight pieces on a coarse grid. */
export function refineSmooth(g: Grid2D, k: number): Grid2D {
    if (k <= 1) return g;
    const R = g.values.length;
    const C = g.values[0]?.length ?? 0;
    if (R < 2 || C < 2) return g;
    const at = (r: number, c: number) => g.values[Math.max(0, Math.min(R - 1, r))][Math.max(0, Math.min(C - 1, c))];
    const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
        0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    // a missing neighbour falls back to the nearer known value, so gaps do not spread
    const pick = (v: number, alt: number) => (Number.isFinite(v) ? v : alt);
    const out: number[][] = [];
    for (let r = 0; r <= (R - 1) * k; r++) {
        const y = r / k;
        const r1 = Math.min(R - 2, Math.floor(y));
        const ty = y - r1;
        const row: number[] = [];
        for (let c = 0; c <= (C - 1) * k; c++) {
            const x = c / k;
            const c1 = Math.min(C - 2, Math.floor(x));
            const tx = x - c1;
            const a = at(r1, c1), b = at(r1, c1 + 1), d = at(r1 + 1, c1), e = at(r1 + 1, c1 + 1);
            if (![a, b, d, e].every(Number.isFinite)) {
                row.push(NaN);
                continue;
            }
            // smooth along each of the 4 rows around the point, then across them
            const along = (rr: number) => cr(pick(at(rr, c1 - 1), at(rr, c1)), at(rr, c1), at(rr, c1 + 1), pick(at(rr, c1 + 2), at(rr, c1 + 1)), tx);
            const cols = [-1, 0, 1, 2].map(j => along(r1 + j));
            const v0 = pick(cols[0], cols[1]);
            const v3 = pick(cols[3], cols[2]);
            row.push(cr(v0, cols[1], cols[2], v3, ty));
        }
        out.push(row);
    }
    return { lat0: g.lat0, lon0: g.lon0, dLat: g.dLat / k, dLon: g.dLon / k, values: out };
}

/** Chaikin corner cutting: rounds the corners of a line (closed lines stay closed). */
export function smoothLine(line: Line, iterations = 2): Line {
    let pts = line;
    for (let it = 0; it < iterations && pts.length > 2; it++) {
        const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-9;
        const out: Line = closed ? [] : [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
            const [a, b] = [pts[i], pts[i + 1]];
            out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
        }
        if (closed) out.push(out[0]);
        else out.push(pts[pts.length - 1]);
        pts = out;
    }
    return pts;
}
