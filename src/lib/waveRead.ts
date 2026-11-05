// Reading a wave layer (height, direction, period) from Windy's map (owner, 2026-10-28: use Windy's
// sea = wind waves). Windy's interpolator gives three numbers per point for wave layers, but its type
// files do not say what they are. The plugin works it out once from Windy's SWH layer ("waves"),
// whose height, direction and period are also in the point forecast, then reads the wind-wave layer
// the same way (all Windy wave layers use one format).

import { decodeWave, type WaveDecode } from './waveColors';

export type DirDecode = 'vec' | 'vec+180' | 'swap' | 'swap+180';

export interface WaveReading {
    height: WaveDecode;
    /** How to get the direction the waves come FROM, or null (not found) */
    dir: DirDecode | null;
    /** Which number is the period, or null (not found) */
    period: 0 | 1 | 2 | null;
}

const norm = (d: number) => ((d % 360) + 360) % 360;
const diff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

export function decodeDir(raw: unknown, how: DirDecode): number {
    const v = Array.isArray(raw) ? (raw as number[]) : null;
    if (!v || !Number.isFinite(v[0]) || !Number.isFinite(v[1]) || (v[0] === 0 && v[1] === 0)) return NaN;
    const d = how.startsWith('vec') ? (Math.atan2(v[0], v[1]) * 180) / Math.PI : (Math.atan2(v[1], v[0]) * 180) / Math.PI;
    return norm(how.endsWith('+180') ? d + 180 : d);
}

export interface WaveSample {
    raw: unknown;
    height: number;
    /** FROM, °T */
    dir: number | null;
    period: number | null;
}

/** Work out the reading from samples where the answer is known (Windy's SWH layer vs the point forecast). */
export function calibrateWaveReading(samples: WaveSample[]): WaveReading | null {
    const good = samples.filter(s => s.height > 0.3);
    if (!good.length) return null;
    // height: as for the wave lines
    let height: WaveDecode | null = null;
    let bestH = Infinity;
    for (const how of ['hypot', 0, 1, 2] as WaveDecode[]) {
        const errs = good.map(s => Math.abs(decodeWave(s.raw, how) - s.height) / s.height);
        if (errs.some(e => !Number.isFinite(e))) continue;
        const e = errs.reduce((a, b) => a + b, 0) / errs.length;
        if (e < 0.25 && e < bestH) {
            bestH = e;
            height = how;
        }
    }
    if (height == null) return null;
    // direction: within 35° on average
    let dir: DirDecode | null = null;
    let bestD = 35;
    const withDir = good.filter(s => s.dir != null);
    for (const how of ['vec', 'vec+180', 'swap', 'swap+180'] as DirDecode[]) {
        if (!withDir.length) break;
        const errs = withDir.map(s => diff(decodeDir(s.raw, how), s.dir as number));
        if (errs.some(e => !Number.isFinite(e))) continue;
        const e = errs.reduce((a, b) => a + b, 0) / errs.length;
        if (e < bestD) {
            bestD = e;
            dir = how;
        }
    }
    // period: within 30 % on average, and not the number used for the height
    let period: 0 | 1 | 2 | null = null;
    let bestP = 0.3;
    const withP = good.filter(s => s.period != null && s.period > 0);
    for (const i of [2, 0, 1] as const) {
        if (!withP.length || height === i) continue;
        const errs = withP.map(s => {
            const v = (s.raw as number[])[i];
            return Number.isFinite(v) ? Math.abs(v - (s.period as number)) / (s.period as number) : Infinity;
        });
        const e = errs.reduce((a, b) => a + b, 0) / errs.length;
        if (e < bestP) {
            bestP = e;
            period = i;
        }
    }
    return { height, dir, period };
}

/** Height, FROM direction and period from one reading (NaN / null where not available) */
export function readWave(raw: unknown, r: WaveReading): { h: number; dir: number | null; period: number | null } {
    const h = decodeWave(raw, r.height);
    const dir = r.dir ? decodeDir(raw, r.dir) : NaN;
    const p = r.period != null && Array.isArray(raw) ? (raw as number[])[r.period] : NaN;
    return { h, dir: Number.isFinite(dir) ? dir : null, period: Number.isFinite(p) && p > 0 && p < 40 ? p : null };
}
