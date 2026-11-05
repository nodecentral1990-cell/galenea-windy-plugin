// Roll and pitch motion estimate along the route: a light linear spectral calculation.
// Pure logic, no Windy calls. See windy/notes/roll-pitch-prediction.md for the method, the
// sources, what was verified and what was not. AID ONLY: not a substitute for the ship's own
// stability information, the IMO Circ.1228 checks (which cover parametric roll; this does not)
// or the master's judgement. Results are typically good to about ±30-50 % for roll, better for pitch.
//
// Method in one paragraph: each wave system from the forecast (wind sea, swell 1, swell 2) is
// turned into a wave spectrum (JONSWAP shape, directional spreading) from its height and period.
// A roll transfer function (one-degree-of-freedom, equivalent linear damping from the hull, speed
// and the bilge keels after Ikeda) and a pitch transfer function (closed-form strip theory for a
// box-shaped hull after Jensen, Mansour & Olsen 2004) are squared and multiplied with the
// spectrum at the frequency of encounter. The area under the result gives the standard deviation;
// the significant amplitude is 2× that and the likely maximum in 3 hours is σ·√(2·ln N).

import { encounterAngle, encounterPeriod, type WaveSystem } from './circ1228';
import type { Vessel } from './model';
import { shipTypeOf } from './shipTypes';
import { MS_TO_KN, rollPeriodFor, seaDirOf, type WxPoint } from './weather';

const G = 9.81;
const RHO = 1025;
const DEG = Math.PI / 180;

// ---------- Inputs ----------

/** One bilge-keel section (both sides assumed identical, so enter one side only). */
export interface BilgeKeelSection {
    /** Length of this section along the hull, m */
    lengthM: number;
    /** Breadth (height of the plate standing off the hull), m. Typical 0.3-0.6 m */
    breadthM: number;
}

export interface MotionShip {
    /** Length between perpendiculars, m */
    lbp: number;
    /** Moulded breadth, m */
    breadth: number;
    /** Mean draught, m */
    draft: number;
    /** Metacentric height (fluid), m */
    gm: number;
    /** Natural roll period, s (measured preferred; else the IS-Code estimate) */
    rollPeriod: number;
    /** Block coefficient. Empty = 0.65 */
    cb?: number | null;
    /** Height of the centre of gravity above keel, m. Empty = estimated for a box hull from GM */
    kg?: number | null;
    /** Bilge-keel sections (one side). Empty or [] = no bilge keels */
    bilgeKeels?: BilgeKeelSection[] | null;
    /**
     * Roll damping of the bare hull (waves, eddies, friction) without bilge keels and at rest,
     * % of critical damping. Empty = 2 %. The field a master can later tune from observed rolls.
     */
    hullDampingPct?: number | null;
    /**
     * Hull-pressure part of the bilge-keel damping as a multiple of the plate's own normal-force
     * part. Empty = 1.0 (hull pressure taken equal to the normal force: assumption, see notes).
     */
    bilgeKeelHullPressureFactor?: number | null;
    /**
     * Multiplier on the total roll damping from the master's observed rolls (fine-tuning, optional;
     * owner 2026-11-01). Empty = 1 (the plugin's own estimate).
     */
    dampingFactor?: number | null;
}

/** Which period definition the forecast's wave periods are. Windy's ECMWF periods are MEAN periods. */
export type PeriodKind = 'tm-1' | 'tm01' | 'tp';

export interface MotionOptions {
    /** Default 'tm-1' (ECMWF mean wave period, energy-weighted) */
    periodKind?: PeriodKind;
    /** Spread each wave system over directions (default true). False = long-crested */
    spreading?: boolean;
    /** Exposure time for the "likely maximum", hours. Default 3 */
    durationH?: number;
}

// ---------- Results ----------

export interface MotionSystemResult {
    label: string;
    /** Height of this system, m */
    hs: number;
    /** Period as given by the forecast, s */
    period: number;
    /** Peak period used for the spectrum, s */
    tpUsed: number;
    /** Direction the waves come from, °T */
    fromDir: number;
    /** Angle off the bow of where the waves come from, 0 = head, 90 = starboard beam */
    alphaDeg: number;
    /** Period of encounter at the system's period, s (null = waves never pass) */
    encounterS: number | null;
    /** Significant roll amplitude due to this system alone, ° */
    rollSigDeg: number;
    /** Significant pitch amplitude due to this system alone, ° */
    pitchSigDeg: number;
}

export interface MotionResult {
    ok: true;
    /** Significant roll amplitude (mean of the highest third, single amplitude to one side), ° */
    rollSigDeg: number;
    /** Most probable largest single roll amplitude in `durationH` hours, ° */
    rollMaxDeg: number;
    rollRmsDeg: number;
    pitchSigDeg: number;
    pitchMaxDeg: number;
    pitchRmsDeg: number;
    /** Mean zero-crossing period of the roll motion, s (null = no roll) */
    rollPeriodS: number | null;
    /** Equivalent linear roll damping used, % of critical, and its parts */
    damping: { totalPct: number; hullPct: number; liftPct: number; bilgeKeelPct: number };
    /** Roll amplitude the damping was linearised at, ° */
    linearisedAtDeg: number;
    systems: MotionSystemResult[];
    /** Plain-language notes: assumptions made for this point and warnings */
    notes: string[];
}

export interface MotionSkip {
    ok: false;
    reason: string;
}

// ---------- Ship data from the Vessel record ----------

/** Vessel fields this module needs that are not yet in `Vessel` (to be added to model.ts). */
export interface MotionVesselExtras {
    bilgeKeels?: BilgeKeelSection[] | null;
    kg?: number | null;
    hullRollDampingPct?: number | null;
}

/** Ship data for the motion estimate from the Settings record, or why it cannot be done. */
export function motionShipFromVessel(v: Vessel & MotionVesselExtras): MotionShip | MotionSkip {
    const draft = v.draftFwd != null && v.draftAft != null ? (v.draftFwd + v.draftAft) / 2 : (v.draftFwd ?? v.draftAft);
    const missing: string[] = [];
    if (!(v.lbp && v.lbp > 0)) missing.push('LBP');
    if (!(v.breadth && v.breadth > 0)) missing.push('breadth');
    if (!(draft && draft > 0)) missing.push('draft');
    if (!(v.gm && v.gm > 0)) missing.push('GM');
    if (missing.length) return { ok: false, reason: `Enter ${missing.join(', ')} in Settings for the roll/pitch estimate` };
    const tr = rollPeriodFor(v);
    if (!tr.value || tr.value <= 0) return { ok: false, reason: 'No roll period (enter a measured one, or LBP, breadth, draft and GM for an estimate)' };
    return {
        lbp: v.lbp as number,
        breadth: v.breadth as number,
        draft: draft as number,
        gm: v.gm as number,
        rollPeriod: tr.value,
        cb: v.cb ?? shipTypeOf(v.shipType).cb,
        kg: v.kg ?? null,
        bilgeKeels: v.bilgeKeels ?? null,
        hullDampingPct: v.hullRollDampingPct ?? null,
    };
}

// ---------- Wave spectrum ----------

/** Frequency grid, rad/s. Fine enough to resolve a lightly damped roll peak (half-power width ≈ 2ζω ≈ 0.02 rad/s). */
const W_MIN = 0.15;
const W_MAX = 2.5;
// 300 points (2026-11-02): 1.8 × faster than 590 for a difference under 0.2 % over 120 test cases (two ships,
// all headings, periods 7–17 s); 15° direction steps were tried too but changed roll by up to 11 %.
const N_W = 300;
const DW = (W_MAX - W_MIN) / (N_W - 1);
const OMEGA: number[] = Array.from({ length: N_W }, (_, i) => W_MIN + i * DW);

/** Directions relative to the system's mean direction, ° (±90) and the spreading weights. */
const THETA_STEP = 10;
const THETAS: number[] = Array.from({ length: 180 / THETA_STEP + 1 }, (_, i) => -90 + i * THETA_STEP);

/** cos^(2s) spreading weights over THETAS, summing to 1. */
function spreadWeights(s: number): number[] {
    const w = THETAS.map(t => Math.cos(t * DEG) ** (2 * s));
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map(x => x / sum);
}
const SPREAD_SEA = spreadWeights(1); // cos² : wind sea (the classic ITTC/ISSC choice)
const SPREAD_SWELL = spreadWeights(10); // cos²⁰ : swell is much narrower (Goda's s_max for swell is 25-75; assumption)
const NO_SPREAD = THETAS.map(t => (t === 0 ? 1 : 0));

/** JONSWAP shape (unnormalised) with peak enhancement gamma. */
function jonswapShape(w: number, wp: number, gamma: number): number {
    const sigma = w <= wp ? 0.07 : 0.09;
    const r = Math.exp(-((w - wp) ** 2) / (2 * sigma * sigma * wp * wp));
    return w ** -5 * Math.exp(-1.25 * (wp / w) ** 4) * gamma ** r;
}

interface Spectrum {
    /** S(ω) on OMEGA, m²·s/rad, normalised so that m0 = Hs²/16 */
    s: number[];
    tp: number;
}

/** Spectral moment m_n of a tabulated spectrum on OMEGA. */
function moment(s: number[], n: number): number {
    let m = 0;
    for (let i = 0; i < N_W; i++) m += s[i] * OMEGA[i] ** n;
    return m * DW;
}

/**
 * Spectrum for one wave system from its height and period. The peak frequency is adjusted
 * numerically until the spectrum's own mean period (of the kind given) equals the forecast period,
 * so no memorised Tp/Tm ratios are needed.
 */
export function makeSpectrum(hs: number, period: number, kind: PeriodKind, gamma: number): Spectrum {
    let wp = (2 * Math.PI) / period;
    let s: number[] = [];
    for (let it = 0; it < 6; it++) {
        const raw = OMEGA.map(w => jonswapShape(w, wp, gamma));
        const m0 = moment(raw, 0);
        const scale = (hs * hs) / 16 / m0;
        s = raw.map(v => v * scale);
        if (kind === 'tp') break;
        const m = kind === 'tm-1' ? (2 * Math.PI * moment(s, -1)) / moment(s, 0) : (2 * Math.PI * moment(s, 0)) / moment(s, 1);
        const ratio = m / period;
        if (Math.abs(ratio - 1) < 0.002) break;
        wp *= ratio;
    }
    return { s, tp: (2 * Math.PI) / wp };
}

// ---------- Transfer functions ----------

/**
 * Effective wave slope coefficient r for a rectangular section, roll axis at G: the Froude-Krylov
 * roll moment divided by (wave slope × ρ·g·∇·GM). Pressure decays with depth as exp(−k·z), so r → 1
 * for long waves and falls off for short ones. kY = transverse wave number k·|sin α|.
 * Derived here from first principles (bottom pressure moment + side pressure moment about G);
 * not copied from a text, see notes. Clamped to 0…1.
 * Fixed 2026-11-02 after the independent review (windy/notes/roll-validation-review.md): the pressure
 * decays with depth at the FULL wave number k, so the side-pressure depth integrals use k and k², not kY;
 * before, only exact beam seas were right (checked against a numerical Froude–Krylov integration).
 */
export function effectiveWaveSlope(k: number, kY: number, breadth: number, draft: number, kg: number, gm: number): number {
    if (kY < 1e-6) return 1;
    const e = Math.exp(-k * draft);
    const x = (kY * breadth) / 2;
    const sinHalf = Math.sin(x);
    // bottom pressure: ρ g ζ e^{-kT} ∫ y sin(kY y) dy = ρ g ζ e^{-kT} · 2 [sin x − x cos x] / kY²
    const sxc = x < 0.01 ? (x * x * x) / 3 - x ** 5 / 30 : sinHalf - x * Math.cos(x);
    const bottom = (e * 2 * sxc) / (kY * kY);
    // side pressure difference 2 ρ g ζ e^{kz} sin(kY B/2): moment about the waterline axis and shift to G
    const side = (-(2 * sinHalf) / (k * k)) * (1 - e * (1 + k * draft)) + ((2 * sinHalf) / k) * (1 - e) * (draft - kg);
    const r = (bottom + side) / (kY * breadth * draft * gm);
    return Math.min(1, Math.abs(r));
}

/** Longitudinal averaging of the excitation along the hull: |sin(x)/x| with x = k·cos α·L/2. */
const sinc = (x: number): number => (Math.abs(x) < 1e-6 ? 1 : Math.abs(Math.sin(x) / x));

export interface RollRaoInput {
    /** Wave frequency, rad/s */
    w: number;
    /** Encounter frequency, rad/s (≥ 0) */
    we: number;
    /** Wave "from" direction off the bow, ° (0 head, 90 beam) */
    alphaDeg: number;
    lbp: number;
    breadth: number;
    draft: number;
    kg: number;
    gm: number;
    /** Natural roll frequency, rad/s */
    wPhi: number;
    /** Equivalent linear damping ratio (fraction of critical) */
    zeta: number;
}

/** Roll excitation per metre of wave amplitude, rad/m: effective wave slope × transverse component × hull-length averaging. */
export function rollExcitation(i: Omit<RollRaoInput, 'we' | 'wPhi' | 'zeta'>): number {
    const k = (i.w * i.w) / G;
    const sinA = Math.abs(Math.sin(i.alphaDeg * DEG));
    const cosA = Math.cos(i.alphaDeg * DEG);
    const kY = k * sinA;
    const r = effectiveWaveSlope(k, kY, i.breadth, i.draft, i.kg, i.gm);
    return kY * r * sinc((k * cosA * i.lbp) / 2);
}

/** Dynamic magnification of a 1-DOF oscillator at frequency ratio x = ω_e/ω_φ with damping ratio ζ. */
export const magnification = (x: number, zeta: number): number => 1 / Math.sqrt((1 - x * x) ** 2 + (2 * zeta * x) ** 2);

/** Roll amplitude per metre of wave amplitude, rad/m. One degree of freedom, linear. */
export function rollRao(i: RollRaoInput): number {
    return rollExcitation(i) * magnification(i.we / i.wPhi, i.zeta);
}

export interface PitchRaoInput {
    w: number;
    we: number;
    alphaDeg: number;
    lbp: number;
    breadth: number;
    draft: number;
    cb: number;
}

/**
 * Pitch amplitude per metre of wave amplitude, rad/m, closed form after Jensen, Mansour & Olsen
 * (2004): box-shaped hull of breadth B·Cb, linear strip theory (Gerritsma & Beukelman), sectional
 * added mass = displaced water, sectional damping from the 2-D rectangular-section approximation,
 * no heave-pitch coupling, Smith correction exp(−k_e·T). Zero in exact beam seas (the paper's own
 * limitation; directional spreading supplies the rest).
 */
export function pitchRao(i: PitchRaoInput): number {
    const k = (i.w * i.w) / G;
    const B = i.breadth * i.cb;
    const T = i.draft;
    const L = i.lbp;
    // = 1 − Fn·√(kL)·cos β in the paper; kept above 0 so waves that never pass give no pitch, not NaN (review 2026-11-02)
    const a = Math.max(i.we / i.w, 1e-6);
    const ke = Math.abs(k * Math.cos(i.alphaDeg * DEG));
    const kappa = Math.exp(-ke * T);
    const A = 2 * Math.sin((k * B * a * a) / 2) * Math.exp(-k * T * a * a);
    const f = Math.sqrt((1 - k * T) ** 2 + ((A * A) / (k * B * a * a * a)) ** 2);
    const eta = 1 / Math.sqrt((1 - 2 * k * T * a * a) ** 2 + ((A * A) / (k * B * a * a)) ** 2);
    const x = (ke * L) / 2;
    const Gm = x < 1e-4 ? ke : (24 / ((ke * L) ** 2 * L)) * (Math.sin(x) - x * Math.cos(x));
    return Math.abs(eta * kappa * f * Gm);
}

// ---------- Roll damping (equivalent linear, fraction of critical) ----------

export interface DampingInput {
    ship: MotionShip;
    kg: number;
    cb: number;
    speedMs: number;
    /** Roll amplitude the damping is linearised at, rad */
    phiA: number;
}

export interface DampingParts {
    hull: number;
    lift: number;
    bilgeKeel: number;
    total: number;
}

/**
 * Roll damping ratio ζ = B44 / (2·(I+A44)·ω_φ), with (I+A44) = C44/ω_φ² from the roll period and
 * C44 = Δ·g·GM. Parts: bare hull (setting, default 2 % of critical), hull lift at speed (Ikeda) and
 * bilge keels (Ikeda normal-force term, plus hull-pressure term as a factor). Formulas after
 * Ikeda/Himeno (1981) and ITTC 7.5-02-07-04.5 as remembered; see notes for what was checked.
 */
export function rollDamping(d: DampingInput): DampingParts {
    const s = d.ship;
    const L = s.lbp;
    const B = s.breadth;
    const T = s.draft;
    const wPhi = (2 * Math.PI) / s.rollPeriod;
    const disp = RHO * d.cb * L * B * T; // kg
    const c44 = disp * G * s.gm;
    const bCrit = (2 * c44) / wPhi; // 2·(I+A44)·ω_φ = 2·C44/ω_φ
    const hull = (s.hullDampingPct ?? 2) / 100;

    // Lift (Ikeda): B_L = ½ ρ U L d kN l0 lR (1 − 1.4 OG/lR + 0.7 OG²/(l0 lR)); OG = waterline to G, + downward
    const og = T - d.kg;
    const l0 = 0.3 * T;
    const lR = 0.5 * T;
    const cm = Math.min(0.995, 0.977 + 0.085 * (d.cb - 0.6)); // midship coefficient estimate
    const kap = cm <= 0.92 ? 0 : cm <= 0.97 ? 0.1 : 0.3;
    const kN = (2 * Math.PI * T) / L + kap * ((4.1 * B) / L - 0.045);
    const bL = 0.5 * RHO * d.speedMs * L * T * kN * l0 * lR * (1 - (1.4 * og) / lR + (0.7 * og * og) / (l0 * lR));
    const lift = Math.max(0, bL) / bCrit;

    // Bilge keels (Ikeda normal force, both sides): B = (8/3π) ρ r³ b ω φa f² Cd per metre of keel,
    // Cd = 22.5 b / (π r f φa) + 2.4; hull-pressure part = factor × normal-force part
    let bBK = 0;
    const phiA = Math.max(d.phiA, 0.005);
    const f = 1 + 0.3 * Math.exp(-160 * (1 - cm));
    for (const sec of s.bilgeKeels ?? []) {
        if (!(sec.lengthM > 0 && sec.breadthM > 0)) continue;
        // keel tip at the bilge corner: distance from G
        const r = Math.hypot(B / 2, d.kg) + sec.breadthM;
        const cd = (22.5 * sec.breadthM) / (Math.PI * r * f * phiA) + 2.4;
        const perM = (8 / (3 * Math.PI)) * RHO * r ** 3 * sec.breadthM * wPhi * phiA * f * f * cd;
        bBK += perM * sec.lengthM;
    }
    bBK *= 1 + (s.bilgeKeelHullPressureFactor ?? 1);
    const bilgeKeel = bBK / bCrit;
    return { hull, lift, bilgeKeel, total: hull + lift + bilgeKeel };
}

// ---------- Wave systems from the forecast ----------

interface MotionWave extends WaveSystem {
    kind: 'sea' | 'swell';
    /** Note on how the period was obtained, if it had to be derived */
    note?: string;
}

/**
 * The wave systems for the motion estimate: swell 1, swell 2 and the WIND SEA (not the total).
 * The wind-sea period is derived from the total mean period: for energy-weighted mean periods,
 * T_total·Hs² = Σ T_i·H_i², so T_sea = (T_total·Hs² − Σ T_swell·H_swell²) / H_sea².
 */
export function motionWaveSystems(wx: WxPoint): MotionWave[] {
    const ok = (v: number | null | undefined): v is number => v != null && isFinite(v);
    const out: MotionWave[] = [];
    const swells: { h: number; t: number }[] = [];
    if (ok(wx.sw1) && ok(wx.sw1Dir) && ok(wx.sw1Period) && wx.sw1 > 0.05) {
        out.push({ label: 'Swell 1', height: wx.sw1, fromDir: wx.sw1Dir, period: wx.sw1Period, kind: 'swell' });
        swells.push({ h: wx.sw1, t: wx.sw1Period });
    }
    if (ok(wx.sw2) && ok(wx.sw2Dir) && ok(wx.sw2Period) && wx.sw2 > 0.05) {
        out.push({ label: 'Swell 2', height: wx.sw2, fromDir: wx.sw2Dir, period: wx.sw2Period, kind: 'swell' });
        swells.push({ h: wx.sw2, t: wx.sw2Period });
    }
    const seaDir = seaDirOf(wx);
    if (ok(wx.hs) && ok(wx.hsPeriod) && ok(seaDir)) {
        const seaHs = ok(wx.seaHs) ? wx.seaHs : wx.hs;
        if (seaHs > 0.05 && wx.seaWindy && ok(wx.seaPeriod)) {
            // Windy's own wind-wave height, direction and period (owner, 2026-10-28)
            out.push({ label: 'Wind sea', height: seaHs, fromDir: seaDir, period: wx.seaPeriod, kind: 'sea' });
        } else if (seaHs > 0.05) {
            let period = wx.hsPeriod;
            let note: string | undefined;
            if (swells.length) {
                const derived = (wx.hsPeriod * wx.hs * wx.hs - swells.reduce((a, s) => a + s.t * s.h * s.h, 0)) / (seaHs * seaHs);
                if (derived >= 2 && derived <= 25) period = derived;
                else note = `wind-sea period could not be derived (${derived.toFixed(1)} s), total mean period ${wx.hsPeriod.toFixed(1)} s used`;
            }
            out.push({ label: 'Wind sea', height: seaHs, fromDir: seaDir, period, kind: 'sea', note });
        }
    }
    return out;
}

// ---------- The estimate ----------

const STAT = {
    /** Equivalent regular roll amplitude for linearising quadratic damping in irregular motion: 1.88·σ (= ¾·√(8π)/2·σ) */
    linAmp: (3 / 8) * Math.sqrt(8 * Math.PI),
};

/** Most probable largest amplitude in N cycles of a Rayleigh-distributed process: σ·√(2·ln N). */
export const likelyMax = (sigma: number, nCycles: number): number => (nCycles > 1 ? sigma * Math.sqrt(2 * Math.log(nCycles)) : 2 * sigma);

/**
 * Significant roll and pitch at one forecast point for the ship on `headingDeg` at `speedKn`.
 * Returns {ok:false, reason} when the weather or ship data is not enough.
 */
export function predictMotions(wx: WxPoint, headingDeg: number, speedKn: number, ship: MotionShip, opts: MotionOptions = {}): MotionResult | MotionSkip {
    if (!(ship.lbp > 0 && ship.breadth > 0 && ship.draft > 0 && ship.gm > 0 && ship.rollPeriod > 0)) {
        return { ok: false, reason: 'Ship data incomplete (LBP, breadth, draft, GM and roll period are needed)' };
    }
    const systems = motionWaveSystems(wx);
    if (!systems.length) {
        if (wx.hs != null && wx.hs <= 0.05) {
            return zeroResult(['Calm sea: no wave motion']);
        }
        return { ok: false, reason: 'No wave height, period or direction in the forecast at this point' };
    }
    const kind = opts.periodKind ?? 'tm-1';
    const spread = opts.spreading ?? true;
    const durationS = (opts.durationH ?? 3) * 3600;
    const cb = ship.cb && ship.cb > 0 ? ship.cb : 0.65;
    const T = ship.draft;
    const B = ship.breadth;
    const kgBox = T / 2 + (B * B) / (12 * T) - ship.gm;
    const kg = ship.kg && ship.kg > 0 ? ship.kg : kgBox;
    const wPhi = (2 * Math.PI) / ship.rollPeriod;
    const speedMs = Math.max(0, speedKn) / MS_TO_KN;
    const dampingFactor = ship.dampingFactor && ship.dampingFactor > 0 ? ship.dampingFactor : 1;
    const notes: string[] = [];
    if (dampingFactor !== 1) notes.push(`Roll damping × ${dampingFactor.toFixed(2)} (fine-tuned from your observed rolls)`);
    if (!(ship.kg && ship.kg > 0)) notes.push(`KG taken as ${kgBox.toFixed(1)} m (box hull from GM)`);
    if (!(ship.cb && ship.cb > 0)) notes.push('Block coefficient 0.65 assumed');
    if (!ship.bilgeKeels?.length) notes.push('No bilge keels entered: bare-hull damping only (roll likely overestimated if the ship has them)');
    for (const s of systems) if (s.note) notes.push(s.note);

    // Precompute per system everything that does not depend on the roll damping: for each direction and
    // frequency the encounter frequency ratio x = ω_e/ω_φ, the roll excitation² × S × weight × dω and the
    // pitch response² × S × weight × dω. Flattened to plain arrays for speed.
    type Prep = { sys: MotionWave; spec: Spectrum; alpha: number; x: Float64Array; we2: Float64Array; rollExc: Float64Array; pitchResp: Float64Array; n: number };
    const preps: Prep[] = systems.map(sys => {
        const spec = makeSpectrum(sys.height, sys.period, kind, sys.kind === 'sea' ? 3.3 : 7);
        const weights = !spread ? NO_SPREAD : sys.kind === 'sea' ? SPREAD_SEA : SPREAD_SWELL;
        const alpha = encounterAngle(sys.fromDir, headingDeg);
        const dirs = THETAS.filter((_, ti) => weights[ti] > 0);
        const n = dirs.length * N_W;
        const x = new Float64Array(n);
        const we2 = new Float64Array(n);
        const rollExc = new Float64Array(n);
        const pitchResp = new Float64Array(n);
        let j = 0;
        THETAS.forEach((th, ti) => {
            const wgt = weights[ti];
            if (wgt === 0) return;
            const a = alpha + th;
            for (let i = 0; i < N_W; i++, j++) {
                const w = OMEGA[i];
                const te = encounterPeriod((2 * Math.PI) / w, speedKn, a);
                const wE = isFinite(te) && te > 0 ? (2 * Math.PI) / te : 0;
                const sw = spec.s[i] * wgt * DW;
                x[j] = wE / wPhi;
                we2[j] = wE * wE;
                rollExc[j] = rollExcitation({ w, alphaDeg: a, lbp: ship.lbp, breadth: B, draft: T, kg, gm: ship.gm }) ** 2 * sw;
                pitchResp[j] = pitchRao({ w, we: wE, alphaDeg: a, lbp: ship.lbp, breadth: B, draft: T, cb }) ** 2 * sw;
            }
        });
        return { sys, spec, alpha, x, we2, rollExc, pitchResp, n };
    });

    // Roll: iterate the equivalent linear damping with the roll amplitude it produces
    let phiA = 0.05;
    let damping = rollDamping({ ship, kg, cb, speedMs, phiA });
    let rollM0 = 0;
    let rollM2 = 0;
    let perSystemRoll: number[] = [];
    for (let it = 0; it < 15; it++) {
        rollM0 = 0;
        rollM2 = 0;
        perSystemRoll = [];
        const z2 = (2 * damping.total * dampingFactor) ** 2;
        for (const p of preps) {
            let m0 = 0;
            for (let j = 0; j < p.n; j++) {
                const xx = p.x[j] * p.x[j];
                const v = p.rollExc[j] / ((1 - xx) ** 2 + z2 * xx);
                m0 += v;
                rollM2 += v * p.we2[j];
            }
            perSystemRoll.push(m0);
            rollM0 += m0;
        }
        const next = STAT.linAmp * Math.sqrt(rollM0);
        const done = Math.abs(next - phiA) < 0.01 * Math.max(next, 0.005);
        phiA = Math.max(next, 0.005);
        damping = rollDamping({ ship, kg, cb, speedMs, phiA });
        if (done) break;
    }

    // Pitch (linear: no iteration)
    let pitchM0 = 0;
    let pitchM2 = 0;
    const perSystemPitch: number[] = [];
    for (const p of preps) {
        let m0 = 0;
        for (let j = 0; j < p.n; j++) {
            m0 += p.pitchResp[j];
            pitchM2 += p.pitchResp[j] * p.we2[j];
        }
        perSystemPitch.push(m0);
        pitchM0 += m0;
    }

    const rollSigma = Math.sqrt(rollM0);
    const pitchSigma = Math.sqrt(pitchM0);
    const rollTz = rollM0 > 0 && rollM2 > 0 ? 2 * Math.PI * Math.sqrt(rollM0 / rollM2) : null;
    const pitchTz = pitchM0 > 0 && pitchM2 > 0 ? 2 * Math.PI * Math.sqrt(pitchM0 / pitchM2) : null;
    const toDeg = (rad: number) => rad / DEG;

    notes.push(`Wave periods read as ${kind === 'tm-1' ? 'mean (energy) periods' : kind === 'tm01' ? 'mean periods (Tm01)' : 'peak periods'}; ${spread ? 'directional spreading applied' : 'long-crested waves'}`);
    notes.push('Linear estimate: does not include parametric roll, water on deck or slamming. See the Circ.1228 warnings for parametric roll.');

    return {
        ok: true,
        rollSigDeg: toDeg(2 * rollSigma),
        rollMaxDeg: toDeg(likelyMax(rollSigma, rollTz ? durationS / rollTz : 0)),
        rollRmsDeg: toDeg(rollSigma),
        pitchSigDeg: toDeg(2 * pitchSigma),
        pitchMaxDeg: toDeg(likelyMax(pitchSigma, pitchTz ? durationS / pitchTz : 0)),
        pitchRmsDeg: toDeg(pitchSigma),
        rollPeriodS: rollTz,
        damping: {
            totalPct: 100 * damping.total * dampingFactor,
            hullPct: 100 * damping.hull,
            liftPct: 100 * damping.lift,
            bilgeKeelPct: 100 * damping.bilgeKeel,
        },
        linearisedAtDeg: toDeg(phiA),
        systems: preps.map((p, i) => {
            const te = encounterPeriod(p.sys.period, speedKn, p.alpha);
            return {
                label: p.sys.label,
                hs: p.sys.height,
                period: p.sys.period,
                tpUsed: p.spec.tp,
                fromDir: p.sys.fromDir,
                alphaDeg: Math.abs(p.alpha > 180 ? p.alpha - 360 : p.alpha),
                encounterS: isFinite(te) ? te : null,
                rollSigDeg: toDeg(2 * Math.sqrt(perSystemRoll[i] ?? 0)),
                pitchSigDeg: toDeg(2 * Math.sqrt(perSystemPitch[i] ?? 0)),
            };
        }),
        notes,
    };
}

function zeroResult(notes: string[]): MotionResult {
    return {
        ok: true,
        rollSigDeg: 0,
        rollMaxDeg: 0,
        rollRmsDeg: 0,
        pitchSigDeg: 0,
        pitchMaxDeg: 0,
        pitchRmsDeg: 0,
        rollPeriodS: null,
        damping: { totalPct: 0, hullPct: 0, liftPct: 0, bilgeKeelPct: 0 },
        linearisedAtDeg: 0,
        systems: [],
        notes,
    };
}

/** Short text for a table cell, e.g. "roll 6.1° (max 11), pitch 1.2°". */
export function fmtMotions(m: MotionResult | MotionSkip): string {
    if (!m.ok) return m.reason;
    return `roll ${m.rollSigDeg.toFixed(1)}° (max ${m.rollMaxDeg.toFixed(0)}), pitch ${m.pitchSigDeg.toFixed(1)}°`;
}
