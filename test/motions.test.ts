import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    predictMotions,
    makeSpectrum,
    effectiveWaveSlope,
    pitchRao,
    rollRao,
    rollDamping,
    motionWaveSystems,
    motionShipFromVessel,
    likelyMax,
    type MotionShip,
    type MotionResult,
} from '../src/lib/motions';
import type { WxPoint } from '../src/lib/weather';
import { emptyVessel } from '../src/lib/model';

const near = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} vs ${b}`);

/** 230 m container ship used throughout (figures chosen for the tests, not a real ship). */
const SHIP: MotionShip = { lbp: 230, breadth: 32.2, draft: 12.8, gm: 1.6, rollPeriod: 16.9, cb: 0.65, bilgeKeels: [{ lengthM: 40, breadthM: 0.4 }, { lengthM: 40, breadthM: 0.4 }] };
const BARE: MotionShip = { ...SHIP, bilgeKeels: [] };

const calm: WxPoint = {
    windKn: 10, gustKn: 12, windDir: 0, pressureHpa: 1013, precipMm: 0, fog: false, thunder: false,
    hs: null, hsDir: null, hsPeriod: null, sw1: null, sw1Dir: null, sw1Period: null, sw2: null, sw2Dir: null, sw2Period: null, seaHs: null,
};

/** One swell system only (no wind sea): height, period, direction it comes from. */
const swellOnly = (h: number, t: number, from: number): WxPoint => ({
    ...calm, hs: h, hsDir: from, hsPeriod: t, sw1: h, sw1Dir: from, sw1Period: t, seaHs: 0,
});
/** Wind sea only, from the wind direction. */
const seaOnly = (h: number, t: number, from: number): WxPoint => ({ ...calm, windDir: from, hs: h, hsDir: from, hsPeriod: t, seaHs: h });

const ok = (m: ReturnType<typeof predictMotions>): MotionResult => {
    assert.ok(m.ok, (m as { reason?: string }).reason);
    return m as MotionResult;
};

test('spectrum: m0 = Hs²/16 and the mean period matches the one asked for', () => {
    const s = makeSpectrum(4, 12, 'tm-1', 3.3);
    const dw = (2.5 - 0.15) / (s.s.length - 1);
    let m0 = 0;
    let mm1 = 0;
    s.s.forEach((v, i) => {
        const w = 0.15 + i * dw;
        m0 += v * dw;
        mm1 += (v * dw) / w;
    });
    near(m0, 1, 1e-6, 'm0');
    near((2 * Math.PI * mm1) / m0, 12, 0.05, 'Tm-1');
    assert.ok(s.tp > 12 && s.tp < 14.5, `Tp ${s.tp} should be a little above the mean period`);
    const p = makeSpectrum(4, 12, 'tp', 3.3);
    near(p.tp, 12, 1e-9, 'tp kind');
});

test('effective wave slope: 1 for long waves, falls for short ones, never above 1', () => {
    const kg = 12.8 / 2 + 32.2 ** 2 / (12 * 12.8) - 1.6;
    const veryLong = effectiveWaveSlope(0.0003, 0.0003, 32.2, 12.8, kg, 1.6);
    near(veryLong, 1, 0.01, 'very long wave');
    const long = effectiveWaveSlope(0.002, 0.002, 32.2, 12.8, kg, 1.6);
    assert.ok(long > 0.9 && long < veryLong, `45 s wave r=${long}`);
    const mid = effectiveWaveSlope(0.028, 0.028, 32.2, 12.8, kg, 1.6);
    assert.ok(mid < long && mid > 0.1, `12 s wave r=${mid}`);
    for (let k = 0.01; k < 0.4; k += 0.01) {
        const r = effectiveWaveSlope(k, k, 32.2, 12.8, kg, 1.6);
        assert.ok(r >= 0 && r <= 1, `r in range at k=${k}: ${r}`);
    }
});

test('pitch transfer function: follows the wave slope in long waves, zero in exact beam seas', () => {
    const w = 0.25; // 25 s wave, 390 m long
    const k = (w * w) / 9.81;
    const head = pitchRao({ w, we: w, alphaDeg: 0, lbp: 100, breadth: 20, draft: 8, cb: 1 });
    near(head / k, 1, 0.15, 'long wave: pitch ≈ wave slope');
    near(pitchRao({ w: 0.6, we: 0.6, alphaDeg: 90, lbp: 230, breadth: 32.2, draft: 12.8, cb: 0.65 }), 0, 1e-9, 'beam sea');
});

test('roll transfer function: resonance peak = excitation / (2ζ)', () => {
    const base = { w: 0.37, alphaDeg: 90, lbp: 230, breadth: 32.2, draft: 12.8, kg: 11.5, gm: 1.6, wPhi: 0.37 };
    const atRes = rollRao({ ...base, we: 0.37, zeta: 0.05 });
    const slow = rollRao({ ...base, we: 0.001, zeta: 0.05 });
    near(atRes / slow, 10, 0.01, 'dynamic magnification 1/(2ζ)');
    assert.equal(rollRao({ ...base, we: 0.37, zeta: 0.05, alphaDeg: 0 }), 0, 'no roll excitation in exact head seas');
});

test('roll damping: bilge keels and speed add damping; longer or deeper keels add more', () => {
    const kg = 11.5;
    const d0 = rollDamping({ ship: BARE, kg, cb: 0.65, speedMs: 0, phiA: 0.1 });
    near(d0.total, 0.02, 1e-9, 'bare hull at rest = setting');
    const dBK = rollDamping({ ship: SHIP, kg, cb: 0.65, speedMs: 0, phiA: 0.1 });
    assert.ok(dBK.bilgeKeel > 0.005 && dBK.bilgeKeel < 0.05, `bilge keel part ${dBK.bilgeKeel}`);
    const dSpeed = rollDamping({ ship: SHIP, kg, cb: 0.65, speedMs: 9, phiA: 0.1 });
    assert.ok(dSpeed.lift > 0.01 && dSpeed.lift < 0.06, `lift part at 18 kn ${dSpeed.lift}`);
    const longer = rollDamping({ ship: { ...SHIP, bilgeKeels: [{ lengthM: 120, breadthM: 0.4 }] }, kg, cb: 0.65, speedMs: 0, phiA: 0.1 });
    near(longer.bilgeKeel, 1.5 * dBK.bilgeKeel, 1e-9, 'sections add up: 120 m = 1.5 × (40 + 40) m');
    const deeper = rollDamping({ ship: { ...SHIP, bilgeKeels: [{ lengthM: 80, breadthM: 0.6 }] }, kg, cb: 0.65, speedMs: 0, phiA: 0.1 });
    assert.ok(deeper.bilgeKeel > dBK.bilgeKeel, 'wider plate damps more');
});

test('zero waves → zero motion; missing data → reason', () => {
    const z = ok(predictMotions({ ...calm, hs: 0, seaHs: 0 }, 0, 15, SHIP));
    assert.equal(z.rollSigDeg, 0);
    assert.equal(z.pitchSigDeg, 0);
    const none = predictMotions(calm, 0, 15, SHIP);
    assert.ok(!none.ok && /No wave/.test(none.reason));
    const noShip = predictMotions(swellOnly(4, 12, 90), 0, 15, { ...SHIP, gm: 0 });
    assert.ok(!noShip.ok && /Ship data/.test(noShip.reason));
    const v = motionShipFromVessel(emptyVessel());
    assert.ok(!v.ok && /LBP/.test(v.reason));
    const full = motionShipFromVessel({ ...emptyVessel(), lbp: 230, breadth: 32.2, draftFwd: 12.8, draftAft: 12.8, gm: 1.6, rollPeriod: 16.9 });
    assert.ok(full.ok !== false && (full as MotionShip).rollPeriod === 16.9);
});

test('beam swell at the roll period rolls far more than the same swell on the bow; roll grows with height', () => {
    // Ship stopped so that encounter period = wave period = roll period
    const beam = ok(predictMotions(swellOnly(4, 16.9, 90), 0, 0, SHIP, { periodKind: 'tp' }));
    const head = ok(predictMotions(swellOnly(4, 16.9, 0), 0, 0, SHIP, { periodKind: 'tp' }));
    assert.ok(beam.rollSigDeg > 3 * head.rollSigDeg, `beam ${beam.rollSigDeg.toFixed(1)}° vs head ${head.rollSigDeg.toFixed(1)}°`);
    assert.ok(beam.rollSigDeg > 5 && beam.rollSigDeg < 40, `resonant beam roll plausible: ${beam.rollSigDeg.toFixed(1)}°`);
    const bigger = ok(predictMotions(swellOnly(6, 16.9, 90), 0, 0, SHIP, { periodKind: 'tp' }));
    assert.ok(bigger.rollSigDeg > beam.rollSigDeg, 'higher waves, more roll');
    // Off resonance (short beam sea) rolls much less
    const short = ok(predictMotions(swellOnly(4, 7, 90), 0, 0, SHIP, { periodKind: 'tp' }));
    assert.ok(short.rollSigDeg < beam.rollSigDeg / 2, `short beam sea ${short.rollSigDeg.toFixed(1)}° < resonant ${beam.rollSigDeg.toFixed(1)}°`);
    assert.ok(beam.rollMaxDeg > beam.rollSigDeg * 1.4 && beam.rollMaxDeg < beam.rollSigDeg * 2.2, '3 h maximum ≈ 1.6-2 × significant');
});

test('bilge keels reduce roll; the reduction is in the usual 20-50 % band at resonance', () => {
    const wx = swellOnly(4, 16.9, 90);
    const bare = ok(predictMotions(wx, 0, 0, BARE, { periodKind: 'tp' }));
    const keeled = ok(predictMotions(wx, 0, 0, SHIP, { periodKind: 'tp' }));
    const cut = 1 - keeled.rollSigDeg / bare.rollSigDeg;
    assert.ok(cut > 0.15 && cut < 0.6, `bilge keels cut roll by ${(100 * cut).toFixed(0)} %`);
    assert.ok(keeled.damping.bilgeKeelPct > 0 && bare.damping.bilgeKeelPct === 0);
    assert.ok(bare.notes.some(n => /No bilge keels/.test(n)));
});

test('pitch: largest in head seas with wave length about the ship length, small in beam seas', () => {
    // 230 m ship: λ = L at T = √(230/1.56) ≈ 12.1 s
    const headL = ok(predictMotions(seaOnly(4, 12.1, 0), 0, 15, SHIP, { periodKind: 'tp', spreading: false }));
    const headShort = ok(predictMotions(seaOnly(4, 6, 0), 0, 15, SHIP, { periodKind: 'tp', spreading: false }));
    const beam = ok(predictMotions(seaOnly(4, 12.1, 90), 0, 15, SHIP, { periodKind: 'tp', spreading: false }));
    assert.ok(headL.pitchSigDeg > headShort.pitchSigDeg, `λ≈L ${headL.pitchSigDeg.toFixed(2)}° > short ${headShort.pitchSigDeg.toFixed(2)}°`);
    assert.ok(headL.pitchSigDeg > 3 * beam.pitchSigDeg, `head ${headL.pitchSigDeg.toFixed(2)}° ≫ beam ${beam.pitchSigDeg.toFixed(2)}°`);
    assert.ok(headL.pitchSigDeg > 0.5 && headL.pitchSigDeg < 6, `plausible pitch in a 4 m head sea: ${headL.pitchSigDeg.toFixed(2)}°`);
    const spread = ok(predictMotions(seaOnly(4, 12.1, 90), 0, 15, SHIP, { periodKind: 'tp' }));
    assert.ok(spread.pitchSigDeg > beam.pitchSigDeg, 'spreading gives some pitch even in beam seas');
});

test('wind-sea period is derived from the total and the swells; wave systems listed', () => {
    const wx: WxPoint = {
        ...calm, windDir: 300, hs: 4, hsDir: 100, hsPeriod: 10, sw1: 3, sw1Dir: 100, sw1Period: 12, sw2: 1, sw2Dir: 200, sw2Period: 8,
        seaHs: Math.sqrt(16 - 9 - 1),
    };
    const sys = motionWaveSystems(wx);
    assert.deepEqual(sys.map(s => s.label), ['Swell 1', 'Swell 2', 'Wind sea']);
    const sea = sys[2];
    near(sea.fromDir, 300, 1e-9, 'wind sea from the wind');
    // (10·16 − 12·9 − 8·1) / 6 = 7.33 s
    near(sea.period, 44 / 6, 1e-9, 'derived wind-sea period');
    const m = ok(predictMotions(wx, 0, 15, SHIP));
    assert.equal(m.systems.length, 3);
    assert.ok(m.rollSigDeg > 0 && m.pitchSigDeg > 0);
    assert.ok(m.systems.every(s => s.rollSigDeg >= 0 && s.pitchSigDeg >= 0));
});

test('likely maximum: Rayleigh most-probable max', () => {
    near(likelyMax(1, Math.E ** 2), 2, 1e-9);
    assert.equal(likelyMax(1, 1), 2);
});

test('review fix 2026-11-02: the effective wave slope hardly changes with the wave angle (full k in the depth decay)', async () => {
    const { effectiveWaveSlope, pitchRao } = await import('../src/lib/motions');
    const B = 32.2, T = 12.8, GM = 1.6, KG = T / 2 + (B * B) / (12 * T) - GM;
    for (const Tw of [9, 12, 16.9]) {
        const k = ((2 * Math.PI) / Tw) ** 2 / 9.81;
        const beam = effectiveWaveSlope(k, k, B, T, KG, GM);
        const at60 = effectiveWaveSlope(k, k * Math.sin((60 * Math.PI) / 180), B, T, KG, GM);
        const at30 = effectiveWaveSlope(k, k * Math.sin((30 * Math.PI) / 180), B, T, KG, GM);
        // independent numerical Froude–Krylov integration gave 0.238/0.220/0.183, 0.469/0.463/0.450, 0.693/0.692/0.689
        assert.ok(at30 < 1 && Math.abs(at60 - beam) / beam < 0.1, `T ${Tw} s: r ${beam.toFixed(3)} / ${at60.toFixed(3)} / ${at30.toFixed(3)}`);
    }
    const k = ((2 * Math.PI) / 16.9) ** 2 / 9.81;
    assert.ok(Math.abs(effectiveWaveSlope(k, k * Math.sin(Math.PI / 3), B, T, KG, GM) - 0.692) < 0.005, 'matches the numerical integration');
    assert.ok(Number.isFinite(pitchRao({ w: 0.5, we: 0, alphaDeg: 180, lbp: 230, breadth: 32.2, draft: 12.8, cb: 0.65 })), 'waves that never pass: no NaN pitch');
});

test('clinometer over-reading: pendulum high above the roll axis shows more roll; gyro and eye do not', async () => {
    const { instrumentFactor } = await import('../src/lib/rollCalib');
    assert.ok(Math.abs(instrumentFactor('pendulum', 25, 16.9) - 1.352) < 0.01, '×1.35 at 25 m, 16.9 s');
    assert.equal(instrumentFactor('gyro', 25, 16.9), 1);
    assert.equal(instrumentFactor('eye', 25, 16.9), 1);
    assert.equal(instrumentFactor('pendulum', null, 16.9), 1, 'no height given: no correction');
});

test('regression: reference values for a sample 230 m container ship (frozen 2026-11-02 after the review fix)', async () => {
    const { predictMotions } = await import('../src/lib/motions');
    const ship = { lbp: 230, breadth: 32.2, draft: 12.8, gm: 1.6, rollPeriod: 16.9, cb: 0.65, bilgeKeels: [{ lengthM: 40, breadthM: 0.4 }] };
    // [swell m, period s, from °, heading °, speed kn, significant roll °, significant pitch °]
    const table: number[][] = [
        [4, 14, 90, 0, 15, 5.291, 0.652],
        [4, 14, 90, 0, 0, 6.074, 0.652],
        [3, 9, 135, 0, 15, 0.731, 0.476],
        [4, 12, 0, 0, 15, 0.069, 1.617],
        [4, 14, 180, 0, 15, 0.297, 0.903],
        [2, 16, 60, 0, 12, 2.325, 0.574],
    ];
    for (const [h, t, d, hdg, v, roll, pitch] of table) {
        const wx = { hs: h, hsDir: d, hsPeriod: t, sw1: h, sw1Dir: d, sw1Period: t, sw2: null, sw2Dir: null, sw2Period: null, seaHs: 0, seaDir: null, seaPeriod: null, seaWindy: false, windKn: 10, windDir: d, gustKn: null, pressureHpa: null, precipMm: null, fog: false, thunder: false };
        const m = predictMotions(wx as never, hdg, v, ship);
        assert.ok(m.ok);
        if (!m.ok) continue;
        assert.ok(Math.abs(m.rollSigDeg - roll) <= Math.max(0.01 * roll, 0.005), `${h} m ${t} s from ${d}° at ${v} kn: roll ${m.rollSigDeg.toFixed(3)} (was ${roll}); if the method was changed on purpose, update this table`);
        assert.ok(Math.abs(m.pitchSigDeg - pitch) <= Math.max(0.01 * pitch, 0.005), `pitch ${m.pitchSigDeg.toFixed(3)} (was ${pitch})`);
    }
});
