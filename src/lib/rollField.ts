// Roll chart (owner, 2026-11-01, step 2 of windy/notes/roll-contour-research.md): the roll estimate worked
// out on a grid of forecast points over the map view, then joined into lines of equal roll (2°, 4°, 6°…)
// coloured light red → dark red. Pure logic: the forecast, the heading / speed at each point and the
// roll estimate come in through callbacks, so it runs in tests without Windy.

import type { Grid2D } from './contours';
import type { WxPoint } from './weather';

/** Lines of equal roll, degrees (owner: 2°, 4°, 6°, continued) */
export const ROLL_LEVELS = [2, 4, 6, 8, 10, 12, 15];
/** Light red → dark red, one per level (never amber: that is the warning colour) */
const ROLL_COLORS = ['#ff9e9e', '#ff6b6b', '#f03c3c', '#d01f1f', '#a80f0f', '#800808', '#5a0000'];

/** Lines of equal pitch, degrees (step 4: pitch chart in blues) */
export const PITCH_LEVELS = [1, 2, 3, 4, 5, 6];
const PITCH_COLORS = ['#9ecbff', '#6aaeff', '#3c8ef0', '#1f6fd0', '#0f4fa8', '#082f80'];
export type ChartQuantity = 'roll' | 'pitch';
export const levelsOf = (q: ChartQuantity): number[] => (q === 'pitch' ? PITCH_LEVELS : ROLL_LEVELS);

/** Colour of a line of roll or pitch: the level's own, or for the owner's mark the shade of the next level up */
export function chartColor(q: ChartQuantity, level: number): string {
    const lv = levelsOf(q);
    const cs = q === 'pitch' ? PITCH_COLORS : ROLL_COLORS;
    const i = lv.findIndex(l => l >= level - 1e-9);
    return cs[i < 0 ? cs.length - 1 : i];
}

/** The levels to draw for roll or pitch, plus the owner's mark (drawn thicker), sorted */
export function chartLevels(q: ChartQuantity, limitDeg: number | null | undefined): { level: number; limit: boolean }[] {
    const out = levelsOf(q).map(level => ({ level, limit: limitDeg != null && Math.abs(level - limitDeg) < 1e-9 }));
    if (limitDeg != null && limitDeg > 0 && !out.some(o => o.limit)) out.push({ level: limitDeg, limit: true });
    return out.sort((a, b) => a.level - b.level);
}

/** Colour of a roll line: the level's own, or for the owner's limit the shade of the next level up */
export function rollColor(level: number): string {
    const i = ROLL_LEVELS.findIndex(l => l >= level - 1e-9);
    return ROLL_COLORS[i < 0 ? ROLL_COLORS.length - 1 : i];
}

/** The levels to draw: the standard ones plus the owner's roll limit (drawn thicker), sorted */
export function rollLevels(limitDeg: number | null | undefined): { level: number; limit: boolean }[] {
    const out = ROLL_LEVELS.map(level => ({ level, limit: limitDeg != null && Math.abs(level - limitDeg) < 1e-9 }));
    if (limitDeg != null && limitDeg > 0 && !out.some(o => o.limit)) out.push({ level: limitDeg, limit: true });
    return out.sort((a, b) => a.level - b.level);
}

export interface FieldPoint {
    r: number;
    c: number;
    lat: number;
    lon: number;
    wx: WxPoint | null;
}

export interface RollFieldInput {
    rows: number;
    cols: number;
    lat0: number;
    lon0: number;
    step: number;
    /** Sea points with their forecast for the chart time (land points left out: NaN) */
    points: FieldPoint[];
    /** Roll in degrees at a point (the heading and speed assumed there are the caller's), or null */
    rollAt(wx: WxPoint, lat: number, lon: number): number | null;
}

/**
 * Roll at every grid point. Worked out in small chunks so the map stays usable; stops (null) when
 * `signal.cancelled` is set (e.g. the time slider moved on). `progress(done, total)` is optional.
 */
export async function rollField(inp: RollFieldInput, signal: { cancelled: boolean } = { cancelled: false }, progress?: (done: number, total: number) => void, chunk = 12): Promise<Grid2D | null> {
    const values: number[][] = Array.from({ length: inp.rows }, () => new Array(inp.cols).fill(NaN));
    let done = 0;
    for (const p of inp.points) {
        if (p.wx) {
            const v = inp.rollAt(p.wx, p.lat, p.lon);
            if (v != null && isFinite(v)) values[p.r][p.c] = v;
        }
        done++;
        if (done % chunk === 0) {
            progress?.(done, inp.points.length);
            await new Promise(res => setTimeout(res, 0));
            if (signal.cancelled) return null;
        }
    }
    progress?.(done, inp.points.length);
    return { lat0: inp.lat0, lon0: inp.lon0, dLat: inp.step, dLon: inp.step, values };
}

/** Largest roll on the grid (for the key), or null */
export function maxOf(g: Grid2D): number | null {
    let m = -Infinity;
    for (const row of g.values) for (const v of row) if (isFinite(v) && v > m) m = v;
    return m === -Infinity ? null : m;
}

// ---------- step 3 (owner, 2026-11-01): worst heading, filled bands ----------

/**
 * Worst heading: the most roll over all headings. Tries 8 headings (every 45°), then refines twice around
 * the worst (±22.5°, then ±11.25°): 12 estimates instead of 24, accurate to about 11°. `also` = headings
 * that are always tried too (e.g. the planned course), so the worst is never less than those.
 */
export function worstHeading(rollFor: (heading: number) => number | null, also: number[] = []): { roll: number; heading: number } | null {
    let best: { roll: number; heading: number } | null = null;
    const tryH = (h: number) => {
        const hh = ((h % 360) + 360) % 360;
        const r = rollFor(hh);
        if (r != null && isFinite(r) && (!best || r > best.roll)) best = { roll: r, heading: hh };
    };
    for (let h = 0; h < 360; h += 45) tryH(h);
    for (const h of also) tryH(h);
    for (const d of [22.5, 11.25]) {
        const b = best as { roll: number; heading: number } | null;
        if (!b) break;
        tryH(b.heading - d);
        tryH(b.heading + d);
    }
    return best;
}

/** Colour of the band a roll value falls in (the level at or below it), or null below the first level */
export function bandOf(v: number, levels: number[]): number | null {
    let out: number | null = null;
    for (const l of levels) if (v >= l - 1e-9) out = l;
    return out;
}

const hexRgb = (hex: string): [number, number, number] => {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
};
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

/**
 * Filled bands as an RGBA image covering [south, north] × [west, east], rows spaced in Web-Mercator so that
 * the image lines up with the map when stretched over those bounds (Leaflet image overlay). Below the first
 * level and where there is no value (land, no forecast): transparent.
 */
export function paintBands(g: Grid2D, south: number, north: number, west: number, east: number, width: number, height: number, levels: number[], alpha = 255, colorOf: (level: number) => string = rollColor): Uint8ClampedArray {
    const out = new Uint8ClampedArray(width * height * 4);
    const rows = g.values.length;
    const cols = g.values[0]?.length ?? 0;
    const y0 = mercY(north);
    const y1 = mercY(south);
    const rgb = new Map(levels.map(l => [l, hexRgb(colorOf(l))]));
    for (let py = 0; py < height; py++) {
        const lat = invMercY(y0 + ((py + 0.5) / height) * (y1 - y0));
        const fr = (lat - g.lat0) / g.dLat;
        const r = Math.round(fr);
        if (r < 0 || r >= rows) continue;
        for (let px = 0; px < width; px++) {
            const lon = west + ((px + 0.5) / width) * (east - west);
            let dl = lon - g.lon0;
            while (dl < 0) dl += 360;
            while (dl >= 360) dl -= 360;
            const c = Math.round(dl / g.dLon);
            if (c < 0 || c >= cols) continue;
            const v = g.values[r][c];
            if (!isFinite(v)) continue;
            const band = bandOf(v, levels);
            if (band == null) continue;
            const [R, G, B] = rgb.get(band) as [number, number, number];
            const i = (py * width + px) * 4;
            out[i] = R;
            out[i + 1] = G;
            out[i + 2] = B;
            out[i + 3] = alpha;
        }
    }
    return out;
}
