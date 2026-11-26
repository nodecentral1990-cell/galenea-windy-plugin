// Drift mode (2026-11-26): heading, wind drift direction either side to the weather, current, tracks, land, fixes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accomFor, calibrate, defaultDriftSettings, driftParams, driftVel, nearestLandNm, pointAt, sideOf, stepDrift, type DriftParams } from '../src/lib/drift';
import { rhumbInverse } from '../src/lib/geo';
import { emptyVessel } from '../src/lib/model';

const P: DriftParams = { leewayPct: 4, leewayHow: '', theta: 75, thetaHow: '', delta: 7.5, deltaHow: '', factor: 1, turn: 0 };
const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('either side to the weather: headings, wind drift a little off downwind, mirrored', () => {
    const wx = { windKn: 30, windDir: 270, cur: null };
    const s = driftVel(wx, 'stbd', P)!;
    const p = driftVel(wx, 'port', P)!;
    near(s.heading, 195);
    near(p.heading, 345);
    near(s.kn, 1.2);
    near(s.toward, 97.5);
    near(p.toward, 82.5);
    assert.equal(sideOf(270, 195), 'stbd');
    assert.equal(sideOf(270, 345), 'port');
    // wind abaft the beam (accommodation forward): the turn is the other way
    const f = driftVel(wx, 'stbd', { ...P, theta: 105, delta: 7.5 })!;
    near(f.toward, 82.5);
});

test('current is added; no wind and no current = no answer', () => {
    const v = driftVel({ windKn: 0, windDir: 0, cur: { kn: 1, set: 180 } }, 'stbd', P)!;
    near(v.kn, 1);
    near(v.toward, 180);
    assert.equal(driftVel({ windKn: null, windDir: null, cur: null }, 'stbd', P), null);
    const both = driftVel({ windKn: 25, windDir: 0, cur: { kn: 1, set: 180 } }, 'stbd', { ...P, delta: 0 })!;
    near(both.kn, 2);
    near(both.toward, 180);
});

test('track: 4 h in a steady wind, point between steps, stops at land', () => {
    const t0 = Date.UTC(2026, 10, 26, 0);
    const wxAt = () => ({ windKn: 30, windDir: 270, cur: null });
    const r = stepDrift({ lat: 40, lon: -40, t: t0 }, t0 + 4 * 3600e3, wxAt, 'stbd', P);
    assert.equal(r.stopped, null);
    const end = r.pts[r.pts.length - 1];
    const d = rhumbInverse({ lat: 40, lon: -40 }, end);
    near(d.distNm, 4.8, 0.05);
    near(d.course, 97.5, 0.2);
    const mid = pointAt(r.pts, t0 + 2 * 3600e3 + 5 * 60e3)!;
    near(rhumbInverse({ lat: 40, lon: -40 }, mid).distNm, 2.5, 0.05);
    // drifting east onto Portugal from close off Lisbon
    const coast = stepDrift({ lat: 38.7, lon: -9.6, t: t0 }, t0 + 48 * 3600e3, () => ({ windKn: 40, windDir: 270, cur: null }), 'stbd', { ...P, delta: 0 });
    assert.equal(coast.stopped, 'land');
});

test('nearest land: open ocean none, off a coast a few miles', () => {
    assert.equal(nearestLandNm(40, -40), null);
    const d = nearestLandNm(38.7, -9.6);
    assert.ok(d != null && d < 15, String(d));
});

test('fixes: faster and to the right of the model', () => {
    const lw = { e: 4, n: 0 };
    const cur = { e: 0, n: -1 };
    const k = 1.5;
    const a = (10 * Math.PI) / 180;
    const seen = { e: cur.e + k * (lw.e * Math.cos(a) + lw.n * Math.sin(a)), n: cur.n + k * (lw.n * Math.cos(a) - lw.e * Math.sin(a)) };
    const c = calibrate(seen, lw, cur, 4)!;
    near(c.factor, 1.5);
    near(c.turn, 10, 0.1);
    assert.equal(calibrate(seen, { e: 0.1, n: 0 }, cur, 4), null);
});

test('settings: accommodation by ship type, θ and δ defaults', () => {
    assert.equal(accomFor('container'), 'third');
    assert.equal(accomFor('tanker'), 'aft');
    assert.equal(accomFor('offshore'), 'forward');
    const v = { ...emptyVessel(), shipType: 'tanker' as const, lbp: 320, loa: 333, draftFwd: 20, draftAft: 20 };
    const p = driftParams(v, defaultDriftSettings());
    assert.equal(p.theta, 75);
    assert.equal(p.delta, 8);
    assert.ok(p.leewayPct > 1 && p.leewayPct < 5, String(p.leewayPct));
    assert.equal(driftParams(v, { ...defaultDriftSettings(), theta: 90 }).delta, 0);
});

test('a strong current against the wind: the ship sets with the current (resultant)', () => {
    // wind 20 kn from the west → wind drift 0.8 kn toward 090°; current 2.5 kn setting 270° (against it)
    const v = driftVel({ windKn: 20, windDir: 270, cur: { kn: 2.5, set: 270 } }, 'stbd', { ...P, delta: 0 })!;
    near(v.leewayKn, 0.8);
    near(v.leewayToward, 90);
    near(v.kn, 1.7);
    near(v.toward, 270);
    // across the wind: the resultant lies between the two
    const x = driftVel({ windKn: 25, windDir: 270, cur: { kn: 1, set: 180 } }, 'stbd', { ...P, delta: 0 })!;
    near(x.kn, Math.hypot(1, 1), 0.01);
    near(x.toward, 135, 0.1);
});

test('position updates: learns how the ship really drifted (all intervals, newer counting more)', async () => {
    const { learnFromFixes, stepDrift: step } = await import('../src/lib/drift');
    const t0 = Date.UTC(2026, 10, 26, 0);
    const wxAt = () => ({ windKn: 30, windDir: 270, cur: { kn: 0.5, set: 0 } });
    // the "real" ship: wind drift 30 % faster and 8° to the right of the estimate
    const real = { ...P, factor: 1.3, turn: 8 };
    const truth = step({ lat: 40, lon: -40, t: t0 }, t0 + 9 * 3600e3, wxAt, 'stbd', real);
    const fixes = [0, 3, 6, 9].map(h => {
        const q = truth.pts.find(p => p.t === t0 + h * 3600e3)!;
        return { lat: q.lat, lon: q.lon, t: q.t };
    });
    const r = learnFromFixes(fixes, wxAt, 'stbd', P);
    assert.equal(r.intervals.length, 3);
    near(r.cal!.factor, 1.3, 0.02);
    near(r.cal!.turn, 8, 0.3);
    near(r.intervals[0].seenKn, Math.hypot(1.2 * 1.3 * Math.sin((105.5 * Math.PI) / 180), 1.2 * 1.3 * Math.cos((105.5 * Math.PI) / 180) + 0.5), 0.05);
    // with only one position there is nothing to learn
    assert.equal(learnFromFixes(fixes.slice(0, 1), wxAt, 'stbd', P).cal, null);
});
