// Fine-tuning the roll estimate from the master's own observed rolls (owner, 2026-11-01). OPTIONAL:
// the plugin's own estimate (motions.ts) stays the main figure; this only works out two corrections
// and the estimate uses them when the master switches them on. See windy/notes/roll-contour-research.md §2.3.
//
// Each observation keeps the forecast waves of its moment, so a new forecast never changes it.
// The two corrections: a multiplier on the roll damping (0.3–3) and on the roll period (0.85–1.15),
// found by a plain grid search (coarse, then finer) that minimises the MEDIAN of |ln(estimate/observed)|
// over the observations: robust against a few odd entries, no library, easy to explain.
// Statistics: "biggest roll in the last 10–20 min" ≈ σ·√(2·ln N), N = 900 s / roll zero-crossing period
// (≈ 2.7–2.9 σ), against "steady roll" = significant amplitude 2σ. Comparing like with like matters:
// otherwise the fit is biased by 30–40 %.

import type { ObsWaves, RollObservation } from './model';
import { likelyMax, predictMotions, type MotionOptions, type MotionResult, type MotionShip } from './motions';
import type { WxPoint } from './weather';

/** Smallest observed roll used for the fine-tuning (below it the reading is mostly noise) */
export const MIN_OBS_DEG = 2;
/** Fewest usable observations before the fine-tuning is worked out */
export const MIN_OBS = 5;
const WINDOW_S = 900;

/** The forecast values kept with an observation */
export function freezeWaves(wx: WxPoint): ObsWaves {
    return {
        hs: wx.hs,
        hsDir: wx.hsDir,
        hsPeriod: wx.hsPeriod,
        sw1: wx.sw1,
        sw1Dir: wx.sw1Dir,
        sw1Period: wx.sw1Period,
        sw2: wx.sw2,
        sw2Dir: wx.sw2Dir,
        sw2Period: wx.sw2Period,
        seaHs: wx.seaHs,
        seaDir: wx.seaDir ?? null,
        seaPeriod: wx.seaPeriod ?? null,
        seaWindy: !!wx.seaWindy,
        windKn: wx.windKn,
        windDir: wx.windDir,
    };
}

/** The kept values as a forecast point again (for the estimate) */
export const wavesToWx = (w: ObsWaves): WxPoint => ({ ...w, gustKn: null, pressureHpa: null, precipMm: null, fog: false, thunder: false });

/**
 * How much a clinometer over-reads the roll angle (independent review, 2026-11-02): a pendulum or an
 * accelerometer-type inclinometer h metres above the roll axis feels the sideways acceleration h·φ̈ as well as
 * gravity, so it shows φ·(1 + h·ω²/g), ω = 2π / roll period. E.g. ×1.35 at 25 m with a 16.9 s roll.
 * A gyro / motion sensor or the eye on the horizon reads the true angle. No height given: no correction.
 */
export function instrumentFactor(instrument: RollObservation['instrument'], heightM: number | null | undefined, rollPeriodS: number | null | undefined): number {
    if (instrument !== 'pendulum' && instrument !== 'electronic') return 1;
    if (!heightM || !(heightM > 0) || !rollPeriodS || !(rollPeriodS > 0)) return 1;
    const w = (2 * Math.PI) / rollPeriodS;
    return 1 + (heightM * w * w) / 9.81;
}

/** The estimate in the same terms as the observation: biggest in 10–20 min, or the steady (significant) roll; × the instrument's over-reading */
export function comparableRoll(m: MotionResult, kind: RollObservation['kind'], factor = 1): number {
    if (kind === 'steady') return m.rollSigDeg * factor;
    const sigma = m.rollRmsDeg;
    const n = m.rollPeriodS ? WINDOW_S / m.rollPeriodS : 0;
    return likelyMax(sigma, n) * factor;
}

/** A timed roll period is used when at least 3 rolls were counted and it is between 4 and 40 s */
export const periodUsable = (o: RollObservation): boolean => !!o.periodS && o.periodS >= 4 && o.periodS <= 40 && (o.periodRolls ?? 0) >= 3;
/** The roll angle seen is used when it is 2° or more */
const ampUsable = (o: RollObservation): boolean => o.observedDeg >= MIN_OBS_DEG;

/** Why an observation is not used for the fine-tuning ('' = used) */
export function obsUnusable(o: RollObservation): string {
    if (o.excluded) return 'left out by you';
    if (o.parametric) return 'IMO parametric-roll warning at the time';
    if (!ampUsable(o) && !periodUsable(o)) return o.observedDeg > 0 ? `under ${MIN_OBS_DEG}°` : 'no roll angle or timing';
    return '';
}

/** Estimate (roll as seen, and the mean roll period) for an observation with the two corrections */
export function evalObs(o: RollObservation, ship: MotionShip, dampingFactor: number, periodFactor: number, opts: MotionOptions = {}, clinoHeightM: number | null = null): { amp: number; periodS: number | null } | null {
    const s: MotionShip = { ...ship, rollPeriod: ship.rollPeriod * periodFactor, dampingFactor };
    const m = predictMotions(wavesToWx(o.waves), o.headingDeg, o.speedKn, s, opts);
    return m.ok ? { amp: comparableRoll(m, o.kind, instrumentFactor(o.instrument, o.clinoHeightM ?? clinoHeightM, m.rollPeriodS)), periodS: m.rollPeriodS } : null;
}

/** Roll as seen, estimated for an observation with the two corrections */
export function estimateFor(o: RollObservation, ship: MotionShip, dampingFactor: number, periodFactor: number, opts: MotionOptions = {}): number | null {
    return evalObs(o, ship, dampingFactor, periodFactor, opts)?.amp ?? null;
}

const median = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface FitResult {
    ok: boolean;
    reason?: string;
    dampingFactor: number;
    periodFactor: number;
    n: number;
    /** Roll angles and timed roll periods among them */
    nAmp: number;
    nPeriod: number;
    /** Typical error (median) of the plugin alone and with the corrections, % */
    errBeforePct: number;
    errAfterPct: number;
    /** Estimate per observation (id → degrees) with the corrections */
    after: Record<string, number>;
}

/**
 * Work out the two corrections. Async: yields between grid rows so the screen stays alive.
 * `ship` is the plugin's own ship (no corrections). `progress(done, total)` is optional.
 */
/** `clinoHeightM` = the clinometer height for entries logged before it was entered (see instrumentFactor) */
export async function fitCalibration(obs: RollObservation[], ship: MotionShip, opts: MotionOptions = {}, progress?: (done: number, total: number) => void, clinoHeightM: number | null = null): Promise<FitResult> {
    const use = obs.filter(o => !obsUnusable(o));
    const nAmp = use.filter(ampUsable).length;
    const nPeriod = use.filter(periodUsable).length;
    const empty: FitResult = { ok: false, dampingFactor: 1, periodFactor: 1, n: use.length, nAmp, nPeriod, errBeforePct: 0, errAfterPct: 0, after: {} };
    if (use.length < MIN_OBS) return { ...empty, reason: `Needs at least ${MIN_OBS} usable observations (have ${use.length}).` };

    // each usable roll angle and each usable timed roll period is one comparison
    const score = (df: number, pf: number): { err: number; est: Record<string, number> } | null => {
        const errs: number[] = [];
        const est: Record<string, number> = {};
        for (const o of use) {
            const e = evalObs(o, ship, df, pf, opts, clinoHeightM);
            if (!e) continue;
            if (ampUsable(o) && e.amp > 0) {
                est[o.id] = e.amp;
                errs.push(Math.abs(Math.log(e.amp / o.observedDeg)));
            }
            if (periodUsable(o) && e.periodS) errs.push(Math.abs(Math.log(e.periodS / (o.periodS as number))));
        }
        if (errs.length < MIN_OBS) return null;
        // a small pull towards "no correction" so equal fits keep the plugin's own values
        return { err: median(errs) + 0.01 * Math.abs(Math.log(df)) + 0.05 * Math.abs(Math.log(pf)), est };
    };

    const coarseD = [0.3, 0.42, 0.6, 0.8, 1, 1.25, 1.6, 2.1, 3];
    const coarseP = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15];
    const total = coarseD.length * coarseP.length + 25;
    let done = 0;
    const base = score(1, 1);
    if (!base) return { ...empty, reason: 'The estimate could not be worked out for enough observations (wave data missing?).' };
    let best = { df: 1, pf: 1, ...base };
    for (const pf of coarseP) {
        for (const df of coarseD) {
            const s = score(df, pf);
            if (s && s.err < best.err) best = { df, pf, ...s };
            done++;
        }
        progress?.(done, total);
        await new Promise(r => setTimeout(r, 0));
    }
    // finer around the best
    const d0 = best.df;
    const p0 = best.pf;
    for (const pk of [-0.05, -0.025, 0, 0.025, 0.05]) {
        const pf = Math.min(1.2, Math.max(0.8, p0 + pk));
        for (const dk of [0.84, 0.92, 1, 1.09, 1.19]) {
            const df = Math.min(3.5, Math.max(0.25, d0 * dk));
            const s = score(df, pf);
            if (s && s.err < best.err) best = { df, pf, ...s };
            done++;
        }
        progress?.(done, total);
        await new Promise(r => setTimeout(r, 0));
    }
    const pct = (lnErr: number) => (Math.exp(lnErr) - 1) * 100;
    const errOf = (est: Record<string, number>) => {
        const e = use.filter(o => est[o.id] != null).map(o => Math.abs(Math.log(est[o.id] / o.observedDeg)));
        return e.length ? median(e) : 0;
    };
    return {
        ok: true,
        dampingFactor: best.df,
        periodFactor: best.pf,
        n: use.length,
        nAmp,
        nPeriod,
        errBeforePct: pct(errOf(base.est)),
        errAfterPct: pct(errOf(best.est)),
        after: best.est,
    };
}
