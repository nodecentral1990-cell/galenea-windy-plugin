import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateFor, fitCalibration, freezeWaves, obsUnusable, MIN_OBS } from '../src/lib/rollCalib';
import { predictMotions, type MotionShip } from '../src/lib/motions';
import { calibState } from '../src/lib/motionEstimate';
import { emptyVessel, type RollObservation } from '../src/lib/model';

const ship: MotionShip = { lbp: 230, breadth: 32.2, draft: 12.8, gm: 1.6, rollPeriod: 16.9, cb: 0.65, bilgeKeels: [{ lengthM: 40, breadthM: 0.4 }] };
const wx = (h: number, t: number, dir: number) => ({ hs: h, hsDir: dir, hsPeriod: t, sw1: h, sw1Dir: dir, sw1Period: t, sw2: null, sw2Dir: null, sw2Period: null, seaHs: 0, seaDir: null, seaPeriod: null, seaWindy: false, windKn: 10, windDir: dir, gustKn: null, pressureHpa: null, precipMm: null, fog: false, thunder: false });

function obs(i: number, observedDeg: number, extra: Partial<RollObservation> = {}): RollObservation {
    const cases = [
        [5, 13, 90], [6, 14, 70], [4.5, 15, 110], [5.5, 16, 95], [5, 15, 80], [6.5, 13, 100], [4.8, 17, 85], [5.2, 14, 90],
    ];
    const [h, t, d] = cases[i % cases.length];
    return { id: `o${i}`, t: 0, lat: 0, lon: 0, headingDeg: 0, speedKn: 12, observedDeg, kind: 'max', instrument: 'electronic', note: '', parametric: false, waves: freezeWaves(wx(h, t, d) as never), rollPeriodS: 16.9, gm: 1.6, draftM: 12.8, estimateDeg: null, ...extra };
}

test('fine-tuning recovers a known damping and roll-period correction from noisy observations', async () => {
    const trueD = 1.8;
    const trueP = 1.06;
    const noise = [1.15, 0.88, 1.05, 0.9, 1.12, 0.95, 1.08, 0.86];
    const list = noise.map((k, i) => obs(i, 0)).map((o, i) => ({ ...o, observedDeg: (estimateFor(o, ship, trueD, trueP) as number) * noise[i] }));
    assert.ok(list.every(o => o.observedDeg >= 2), 'synthetic rolls big enough to use: ' + list.map(o => o.observedDeg.toFixed(1)).join(', '));
    const r = await fitCalibration(list, ship);
    assert.equal(r.ok, true);
    assert.ok(r.dampingFactor > trueD / 1.5 && r.dampingFactor < trueD * 1.5, `damping ×${r.dampingFactor.toFixed(2)} near ×${trueD}`);
    assert.ok(Math.abs(r.periodFactor - trueP) <= 0.06, `roll period ×${r.periodFactor.toFixed(3)} near ×${trueP}`);
    assert.ok(r.errAfterPct < r.errBeforePct, `better than the plugin alone: ${r.errBeforePct.toFixed(0)} % → ${r.errAfterPct.toFixed(0)} %`);
});

test('fine-tuning needs enough usable observations; parametric and tiny rolls are left out', async () => {
    const few = [obs(0, 6), obs(1, 7), obs(2, 1.2), obs(3, 8, { parametric: true }), obs(4, 5, { excluded: true }), obs(5, 6)];
    assert.equal(obsUnusable(few[2]), 'under 2°');
    assert.match(obsUnusable(few[3]), /parametric/);
    assert.equal(obsUnusable(few[4]), 'left out by you');
    const r = await fitCalibration(few, ship);
    assert.equal(r.ok, false);
    assert.match(r.reason ?? '', new RegExp(`at least ${MIN_OBS}`));
});

test('damping factor lowers the roll; the plugin estimate is unchanged unless fine-tuning is switched on', () => {
    const w = wx(4, 14, 90) as never;
    const a = predictMotions(w, 0, 12, ship);
    const b = predictMotions(w, 0, 12, { ...ship, dampingFactor: 2 });
    assert.ok(a.ok && b.ok && b.rollSigDeg < a.rollSigDeg, 'more damping, less roll');
    const v = { ...emptyVessel(), rollPeriod: 16.9 };
    assert.equal(calibState(v).applied, false, 'nothing worked out: plugin alone');
    const cal = { on: false, dampingFactor: 2, periodFactor: 1, n: 6, errBeforePct: 40, errAfterPct: 20, at: 0, rollPeriodS: 16.9 };
    assert.equal(calibState({ ...v, rollCalib: cal }).applied, false, 'worked out but switched off: plugin alone');
    assert.equal(calibState({ ...v, rollCalib: { ...cal, on: true } }).applied, true, 'switched on: used');
    assert.equal(calibState({ ...v, rollPeriod: 15, rollCalib: { ...cal, on: true } }).applied, false, 'new roll period: not used until worked out again');
});

test('timed roll periods alone pin the roll-period correction; a timing without an angle is usable', async () => {
    const { evalObs, periodUsable } = await import('../src/lib/rollCalib');
    const trueP = 1.08;
    const list = [0, 1, 2, 3, 4, 5].map(i => {
        const o = obs(i, 0);
        const tz = evalObs(o, ship, 1, trueP)?.periodS as number;
        return { ...o, periodS: tz * [1.03, 0.98, 1.02, 0.97, 1.01, 0.99][i], periodRolls: 6 };
    });
    assert.ok(list.every(periodUsable) && list.every(o => !obsUnusable(o)), 'timing-only entries are usable');
    assert.equal(obsUnusable({ ...list[0], periodRolls: 2 }), 'no roll angle or timing', 'fewer than 3 rolls counted: not used');
    const r = await fitCalibration(list, ship);
    assert.equal(r.ok, true);
    assert.equal(r.nPeriod, 6);
    assert.equal(r.nAmp, 0);
    // the rolling period seen in waves follows the ship's own period only about half (checked 2026-11-02:
    // +8 % roll period → +3–5 % rolling period), so ±3 % timing noise moves the correction by up to ~7 %
    assert.ok(Math.abs(r.periodFactor - trueP) <= 0.08, `roll period ×${r.periodFactor.toFixed(3)} near ×${trueP}`);
});
