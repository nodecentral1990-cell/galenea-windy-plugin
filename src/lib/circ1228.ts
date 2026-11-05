// Checks from IMO MSC.1/Circ.1228 (11 January 2007), "Revised guidance to the master for
// avoiding dangerous situations in adverse weather and sea conditions".
// Formulas checked against the official PDF on 2026-10-11 (see windy/notes/imo-circ-1228.md).
// Generic guidance for all merchant ships, not ship-specific: results are ADVISORY ONLY.

import { norm360 } from './geo';

/** Para 1.5: wave length (m) from wave period (s). */
export const waveLength = (tw: number): number => 1.56 * tw * tw;

/**
 * Para 1.6: encounter period (s). V in knots, alpha = angle between keel direction and wave
 * direction, 0° = head sea. Returns Infinity when the ship runs with the waves at or above
 * their speed (the waves never pass).
 */
export function encounterPeriod(tw: number, vKn: number, alphaDeg: number): number {
    const den = 3 * tw + vKn * Math.cos((alphaDeg * Math.PI) / 180);
    if (Math.abs(den) <= 1e-9) {
        return Infinity;
    }
    // Ship outrunning following waves (negative denominator): the waves are met from astern,
    // the physical encounter period is the absolute value (review 2026-10-27)
    return Math.abs((3 * tw * tw) / den);
}

/** Angle of encounter as used in the circular: wave "from" direction relative to the bow, 0° = head sea, 90° = from starboard. */
export const encounterAngle = (waveFromDeg: number, headingDeg: number): number => norm360(waveFromDeg - headingDeg);

/** Para 4.2.1: surf-riding / broaching-to danger: 135° < α < 225° and V > 1.8·√L / cos(180° − α). L = LBP in m. */
export function surfRidingSpeed(lbp: number, alphaDeg: number): number | null {
    if (!(alphaDeg > 135 && alphaDeg < 225)) {
        return null;
    }
    return (1.8 * Math.sqrt(lbp)) / Math.cos(((180 - alphaDeg) * Math.PI) / 180);
}

/**
 * Natural roll period estimate, IMO 2008 IS Code Part A 2.3:
 * T = 2·C·B / √GM, C = 0.373 + 0.023·(B/d) − 0.043·(Lwl/100).
 * Lwl is taken as LBP (assumption). Often >10% wrong; a measured period is preferred
 * (the circular, para 2.3, says to observe it in calm sea).
 */
export function estimateRollPeriod(breadth: number, meanDraft: number, lwl: number, gm: number): number | null {
    if (!(breadth > 0 && meanDraft > 0 && lwl > 0 && gm > 0)) {
        return null;
    }
    const c = 0.373 + 0.023 * (breadth / meanDraft) - 0.043 * (lwl / 100);
    return (2 * c * breadth) / Math.sqrt(gm);
}

export type Phenomenon = 'surf' | 'highWaves' | 'synchronous' | 'parametric';

export const PHENOMENON_LABEL: Record<Phenomenon, string> = {
    surf: 'Surf-riding / broaching',
    highWaves: 'Successive high waves',
    synchronous: 'Synchronous rolling',
    parametric: 'Parametric rolling',
};

export interface WaveSystem {
    label: string;
    /** Height of this wave system, m */
    height: number;
    /** Direction the waves come FROM, degrees true */
    fromDir: number;
    /** Period, s */
    period: number;
}

export interface ResonanceSettings {
    /** Wave height (m) from which each warning is shown. Null = off */
    parametric: number | null;
    synchronous: number | null;
    highWaves: number | null;
    broaching: number | null;
    /** "Nearly equal" tolerance for the roll checks, % (IMO gives no number; owner chose 15) */
    tolerancePct: number;
}

export interface ResonanceHit {
    phenomenon: Phenomenon;
    system: string;
    /** Short explanation with the numbers used */
    detail: string;
    /** How close to the exact condition, 0 (edge of the band) to 1 (exactly on it). Not a probability */
    closeness?: number;
}

export interface ShipState {
    headingDeg: number;
    speedKn: number;
    lbp: number | null;
    rollPeriod: number | null;
}

const near = (a: number, b: number, tolPct: number) => b > 0 && Math.abs(a - b) / b <= tolPct / 100;
/** 1 when a = b, falling to 0 at the edge of the tolerance band */
const closeTo = (a: number, b: number, tolPct: number) => Math.max(0, 1 - Math.abs(a - b) / b / (tolPct / 100));

/**
 * Run the circular's checks for one wave system. With `geometryOnly` the wave-height conditions
 * are skipped: that gives where the danger zones lie (for drawing), whatever the height.
 */
export function checkWaveSystem(ws: WaveSystem, ship: ShipState, s: ResonanceSettings, geometryOnly = false): ResonanceHit[] {
    const hits: ResonanceHit[] = [];
    if (!(ws.period > 0) || !(ws.height >= 0)) {
        return hits;
    }
    const alpha = encounterAngle(ws.fromDir, ship.headingDeg);
    const te = encounterPeriod(ws.period, ship.speedKn, alpha);
    const teTxt = isFinite(te) ? `${te.toFixed(1)} s` : 'very long';
    const L = ship.lbp;

    const tall = (limit: number | null) => limit != null && (geometryOnly || ws.height >= limit);
    if (L && tall(s.broaching)) {
        const vLim = surfRidingSpeed(L, alpha);
        if (vLim != null && ship.speedKn > vLim) {
            hits.push({
                phenomenon: 'surf',
                system: ws.label,
                detail: `${ws.label} ${Math.round(alpha)}° off bow, speed ${ship.speedKn.toFixed(1)} kn > ${vLim.toFixed(1)} kn (1.8√L/cos(180−α))`,
                // full shade 20 % or more above the surf-riding speed
                closeness: Math.min(1, (ship.speedKn / vLim - 1) / 0.2),
            });
        }
    }
    // Para 4.3: successive high waves also need H > 0.04·L (the circular's own condition)
    if (L && tall(s.highWaves) && (geometryOnly || ws.height > 0.04 * L)) {
        const lambda = waveLength(ws.period);
        const ratio = te / ws.period;
        if (lambda > 0.8 * L && ratio >= 1.8 && ratio <= 3.0) {
            hits.push({
                phenomenon: 'highWaves',
                system: ws.label,
                detail: `${ws.label} λ ${Math.round(lambda)} m > 0.8L, TE/TW ${ratio.toFixed(1)} (1.8–3.0), H ${ws.height.toFixed(1)} m`,
                closeness: Math.max(0, 1 - Math.abs(ratio - 2.4) / 0.6),
            });
        }
    }
    const tr = ship.rollPeriod;
    if (tr && isFinite(te)) {
        if (tall(s.synchronous) && near(te, tr, s.tolerancePct)) {
            hits.push({
                phenomenon: 'synchronous',
                system: ws.label,
                detail: `${ws.label} TE ${teTxt} ≈ TR ${tr.toFixed(1)} s`,
                closeness: closeTo(te, tr, s.tolerancePct),
            });
        }
        if (tall(s.parametric)) {
            if (near(te, tr, s.tolerancePct)) {
                hits.push({ phenomenon: 'parametric', system: ws.label, detail: `${ws.label} TE ${teTxt} ≈ TR ${tr.toFixed(1)} s (1:1)`, closeness: closeTo(te, tr, s.tolerancePct) });
            } else if (near(te, tr / 2, s.tolerancePct)) {
                hits.push({
                    phenomenon: 'parametric',
                    system: ws.label,
                    detail: `${ws.label} TE ${teTxt} ≈ ½TR ${(tr / 2).toFixed(1)} s (1:0.5)`,
                    closeness: closeTo(te, tr / 2, s.tolerancePct),
                });
            }
        }
    }
    return hits;
}
