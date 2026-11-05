// Roll / pitch estimate for one place, time, heading and speed, for the screens (weather table, ship
// window, Polar tab, optimiser comparison), with a cache so the same point is not worked out twice.
// The estimate itself is in motions.ts (linear spectral method; see windy/notes/roll-pitch-prediction.md).

import type { Vessel } from './model';
import { motionShipFromVessel, predictMotions, type MotionOptions, type MotionResult, type MotionShip } from './motions';
import { rollPeriodFor, type WxPoint } from './weather';

export interface MotionShort {
    /** Significant roll / pitch amplitude, ° (to one side) */
    roll: number;
    /** Likely largest in 3 hours, ° */
    rollMax: number;
    pitch: number;
    pitchMax: number;
    /** The full result (notes, damping, per wave system) */
    full: MotionResult;
}

const cache = new Map<string, MotionShort | null>();
let shipKey = '';
let ship: MotionShip | null = null;
let shipReason = '';
let opts: MotionOptions = {};

/**
 * Is the fine-tuning from observed rolls in use? Only when the master switched it on and the roll
 * period is still the one it was worked out with (a new loading = a new roll period = work it out again).
 */
export function calibState(v: Vessel): { applied: boolean; why: string } {
    const c = v.rollCalib;
    if (!c) return { applied: false, why: 'not worked out' };
    if (!c.on) return { applied: false, why: 'switched off' };
    const tr = rollPeriodFor(v).value;
    if (c.rollPeriodS != null && tr != null && Math.abs(c.rollPeriodS - tr) > 0.05) return { applied: false, why: `roll period changed since it was worked out (${c.rollPeriodS.toFixed(1)} s → ${tr.toFixed(1)} s): work it out again` };
    return { applied: true, why: '' };
}

/** The plugin's own ship (no fine-tuning), or null */
export function baseShip(v: Vessel): MotionShip | null {
    const s = motionShipFromVessel(v);
    return 'ok' in s && s.ok === false ? null : (s as MotionShip);
}
export const motionOptions = (v: Vessel): MotionOptions => ({ periodKind: v.wavePeriodKind ?? 'tm-1' });

function shipFor(v: Vessel): MotionShip | null {
    const cal = calibState(v).applied ? v.rollCalib : null;
    const key = JSON.stringify([v.lbp, v.breadth, v.draftFwd, v.draftAft, v.gm, v.rollPeriod, v.cb, v.shipType, v.kg, v.bilgeKeels, v.hullRollDampingPct, v.wavePeriodKind, cal?.dampingFactor, cal?.periodFactor]);
    if (key !== shipKey) {
        shipKey = key;
        cache.clear();
        const s = motionShipFromVessel(v);
        ship = 'ok' in s && s.ok === false ? null : (s as MotionShip);
        shipReason = 'ok' in s && s.ok === false ? s.reason : '';
        if (ship && cal) ship = { ...ship, dampingFactor: cal.dampingFactor, rollPeriod: ship.rollPeriod * cal.periodFactor };
        opts = motionOptions(v);
    }
    return ship;
}

/** Why there is no estimate for this ship ('' when there is one) */
export function motionMissing(v: Vessel): string {
    shipFor(v);
    return shipReason;
}

const r1 = (n: number | null | undefined) => (n == null ? '' : Math.round(n * 10) / 10);

/** Estimate, or null (no ship data, no wave data). */
export function motionAt(wx: WxPoint | null, headingDeg: number, speedKn: number, v: Vessel): MotionShort | null {
    if (!wx) return null;
    const s = shipFor(v);
    if (!s) return null;
    const key = [r1(wx.hs), r1(wx.hsPeriod), Math.round(wx.hsDir ?? -1), r1(wx.sw1), r1(wx.sw1Period), Math.round(wx.sw1Dir ?? -1), r1(wx.sw2), r1(wx.sw2Period), Math.round(wx.sw2Dir ?? -1), r1(wx.seaHs), Math.round(wx.seaDir ?? -1), r1(wx.seaPeriod), Math.round(wx.windDir ?? -1), Math.round(headingDeg), r1(speedKn)].join('|');
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const m = predictMotions(wx, headingDeg, Math.max(0, speedKn), s, opts);
    const out = m.ok ? { roll: m.rollSigDeg, rollMax: m.rollMaxDeg, pitch: m.pitchSigDeg, pitchMax: m.pitchMaxDeg, full: m } : null;
    if (cache.size > 40000) cache.clear();
    cache.set(key, out);
    return out;
}
