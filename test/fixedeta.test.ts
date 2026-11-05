import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePlan, emptyVessel, newRoute, newWaypoint } from '../src/lib/model';
import { simulate } from '../src/lib/speed';
import { routePoints, type WxPoint } from '../src/lib/weather';

const near = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} vs ${b}`);
const T0 = Date.UTC(2026, 9, 25, 0, 0);
const H = 3600e3;
const route4 = () => {
    const r = newRoute('t');
    r.waypoints = [newWaypoint(0, 0), newWaypoint(0, 2), newWaypoint(0, 4), newWaypoint(0, 6)];
    r.defaultSpeed = 12;
    r.etd = T0;
    return r;
};

test('a fixed ETA at a middle waypoint re-times the legs before it; later legs keep their speed', () => {
    const r = route4();
    const free = computePlan(r);
    r.waypoints[2].fixedEta = T0 + 24 * H; // slower than 12 kn
    const p = computePlan(r);
    assert.equal(p.legs[1].arriveMs, T0 + 24 * H, 'arrives at the fixed time');
    near(p.legs[0].sog, (p.legs[0].distNm + p.legs[1].distNm) / 24, 1e-9);
    assert.equal(p.legs[0].targetSog, p.legs[1].targetSog);
    assert.equal(p.legs[2].targetSog, null);
    near(p.legs[2].sog, 12, 1e-9, 'last leg at planned speed');
    near(p.eta as number, T0 + 24 * H + (p.legs[2].distNm / 12) * H, 1000, 'later ETA moves on');
    assert.ok((p.eta as number) > (free.eta as number));
    assert.equal(p.problems.length, 0);
});

test('planned stops inside the stretch are allowed for', () => {
    const r = route4();
    r.waypoints[1].delayH = 4;
    r.waypoints[2].fixedEta = T0 + 24 * H;
    const p = computePlan(r);
    assert.equal(p.legs[1].arriveMs, T0 + 24 * H);
    near(p.legs[0].sog, (p.legs[0].distNm + p.legs[1].distNm) / 20, 1e-9);
});

test('fixed ETA plus ETD + ETA mode: two stretches, each with its own speed', () => {
    const r = route4();
    r.mode = 'eta';
    r.waypoints[1].fixedEta = T0 + 8 * H;
    r.eta = T0 + 40 * H;
    const p = computePlan(r);
    assert.equal(p.legs[0].arriveMs, T0 + 8 * H);
    near(p.eta as number, T0 + 40 * H, 1000);
    assert.notEqual(p.legs[0].targetSog, p.legs[1].targetSog);
    assert.equal(p.legs[1].targetSog, p.legs[2].targetSog);
    assert.equal(p.requiredSog, null, 'no single required speed');
});

test('a fixed ETA too early is reported and ignored', () => {
    const r = route4();
    r.waypoints[1].fixedEta = T0 - H;
    const p = computePlan(r);
    assert.equal(p.legs[0].targetSog, null);
    assert.ok(p.problems.some(x => /WP2/.test(x)));
});

test('with weather, the fixed time is still kept (speed in calm water goes up instead)', () => {
    const r = route4();
    r.lossMethod = 'kwon';
    r.waypoints[2].fixedEta = T0 + 20 * H;
    const v = { ...emptyVessel(), lbp: 236, breadth: 42.8, draftFwd: 12, draftAft: 12, cb: 0.65 };
    const base = computePlan(r, v);
    const wx = { windKn: 30, windDir: 90, hs: 4, hsDir: 90 } as WxPoint;
    const sim = simulate(r, base, v, { wx: () => wx, current: () => null });
    near(sim.plan.legs[1].arriveMs as number, T0 + 20 * H, 60e3, 'fixed time kept');
    assert.ok(sim.legs[0].sicw > (base.legs[0].targetSog as number) + 0.5, 'needs more speed in calm water');
    assert.ok((sim.plan.eta as number) > (base.eta as number), 'last leg (planned speed) is slowed by the weather');
});

test('forecast points cover the whole route by distance', () => {
    const r = route4();
    const pts = routePoints(computePlan(r), 80, 30);
    assert.deepEqual([pts[0].lat, pts[0].lon], [0, 0]);
    near(pts[pts.length - 1].lon, 6, 1e-6);
    assert.ok(pts.length >= 12 && pts.length <= 13, `~30 nm apart over 360 nm: ${pts.length}`);
});

test('planned speeds keep their proportions when scaled to a fixed time', () => {
    const r = route4();
    r.waypoints[1].speed = 6; // slow first leg (e.g. harbour)
    r.waypoints[2].speed = 12;
    r.waypoints[2].fixedEta = T0 + 40 * H;
    const p = computePlan(r);
    assert.equal(p.legs[1].arriveMs, T0 + 40 * H);
    near((p.legs[1].targetSog as number) / (p.legs[0].targetSog as number), 2, 1e-9);
});

test('voyage: present position re-plans from there (speeds kept, or required speed to the ETA)', () => {
    const r = route4();
    const total = computePlan(r).totalNm;
    r.voyage = { startedAt: T0, fix: { lat: 0.05, lon: 1, t: T0 + 6 * H } }; // 60 nm run in 6 h, 3 nm north of track
    const p = computePlan(r);
    assert.ok(p.fix, 'fix placed on the track');
    near(p.fix!.alongNm, 60.1, 1);
    near(p.fix!.offNm, 3, 0.1);
    near(p.eta as number, T0 + 6 * H + ((total - p.fix!.alongNm) / 12) * H, 60e3, 'planned speeds from the fix');
    // with an ETA: the speed needed from the present position
    r.mode = 'eta';
    r.eta = T0 + 30 * H;
    const q = computePlan(r);
    near(q.eta as number, T0 + 30 * H, 60e3);
    near(q.legs[2].targetSog as number, (total - q.fix!.alongNm) / 24, 0.01, 'required SOG from the fix');
    const sim = simulate(r, q, emptyVessel(), { wx: () => null, current: () => null });
    near(sim.plan.eta as number, T0 + 30 * H, 2 * 60e3, 'stepped plan keeps the ETA too');
    const pos = sim.plan.track!.find(tp => Math.abs(tp.t - (T0 + 6 * H)) < 60e3);
    assert.ok(pos && Math.abs(pos.lon - 1) < 0.02, 'track passes the fix at its time');
});

test('voyage: a fix before the ETD is reported', () => {
    const r = route4();
    r.voyage = { startedAt: T0, fix: { lat: 0, lon: 1, t: T0 - H } };
    assert.ok(computePlan(r).problems.some(x => /Present position/.test(x)));
});
