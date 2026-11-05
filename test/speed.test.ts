import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromTable, hsToBeaufort, kwonLossPct, sogWithCurrent, stwForSog, driftOf, simulate, type Env } from '../src/lib/speed';
import { computePlan, emptyVessel, newRoute, newWaypoint, positionAt } from '../src/lib/model';
import type { WxPoint } from '../src/lib/weather';

const near = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} vs ${b}`);
const table = [
    { rpm: 60, sicw: 12, fuel: 40 },
    { rpm: 70, sicw: 14, fuel: 55 },
    { rpm: 80, sicw: 16, fuel: 75 },
];

test('RPM and fuel from the owner table, extrapolation flagged', () => {
    const v = fromTable(table, 15)!;
    near(v.rpm as number, 75, 1e-9);
    near(v.fuel as number, 65, 1e-9);
    assert.equal(v.outside, false);
    const x = fromTable(table, 17)!;
    near(x.rpm as number, 85, 1e-9);
    assert.equal(x.outside, true);
    assert.equal(fromTable([], 15), null);
});

test('Beaufort equivalent of wave height (WMO probable heights)', () => {
    assert.equal(hsToBeaufort(0), 0);
    assert.equal(hsToBeaufort(2), 5);
    assert.equal(hsToBeaufort(4.1), 7);
    assert.equal(hsToBeaufort(9), 10);
});

const ship = { lbp: 236, breadth: 42.8, draft: 12, cb: 0.65, condition: 'laden' as const, shipType: 'container' as const };

test('Kwon loss: zero in calm, more in head seas than following, grows with Beaufort', () => {
    assert.equal(kwonLossPct(0, 0, 18, ship), 0);
    assert.ok(kwonLossPct(7, 0, 18, ship) > kwonLossPct(7, 180, 18, ship));
    assert.ok(kwonLossPct(8, 0, 18, ship) > kwonLossPct(6, 0, 18, ship));
    assert.ok(kwonLossPct(12, 0, 18, ship) <= 60);
});

test('current: along adds, cross costs a little; inverse matches', () => {
    near(sogWithCurrent(12, 0, { kn: 2, set: 0 }).sog, 14, 1e-9);
    near(sogWithCurrent(12, 0, { kn: 2, set: 180 }).sog, 10, 1e-9);
    near(sogWithCurrent(12, 0, { kn: 2, set: 90 }).sog, Math.sqrt(140), 1e-9);
    const stw = stwForSog(13, 45, { kn: 1.5, set: 300 });
    near(sogWithCurrent(stw, 45, { kn: 1.5, set: 300 }).sog, 13, 1e-9);
});

test('drift when stopped: current plus leeway downwind', () => {
    const wx = { windKn: 20, windDir: 0 } as WxPoint;
    const d = driftOf(wx, null, 3)!;
    near(d.kn, 0.6, 1e-9);
    near(d.toward, 180, 1e-9);
    const d2 = driftOf(wx, { kn: 0.6, set: 90 }, 3)!;
    near(d2.kn, Math.hypot(0.6, 0.6), 1e-9);
    near(d2.toward, 135, 1e-9);
});

const T0 = Date.UTC(2026, 9, 25, 0, 0);
const H = 3600e3;
const route3 = () => {
    const r = newRoute('t');
    r.waypoints = [newWaypoint(0, 0), newWaypoint(0, 2), newWaypoint(0, 4)];
    r.defaultSpeed = 12;
    r.etd = T0;
    return r;
};
const noEnv: Env = { wx: () => null, current: () => null };

test('planned stops add to the ETA and the ship is stopped at the waypoint', () => {
    const r = route3();
    const base0 = computePlan(r);
    r.waypoints[1].delayH = 6;
    const base = computePlan(r);
    near((base.eta as number) - (base0.eta as number), 6 * H, 1);
    const mid = (base.legs[0].arriveMs as number) + 3 * H;
    const p = positionAt(r, base, mid)!;
    assert.equal(p.stopped, true);
    near(p.lon, 2, 1e-9);
});

test('simulation without weather matches the simple plan; with fair current it is faster', () => {
    const r = route3();
    r.waypoints[1].delayH = 6;
    const base = computePlan(r);
    const v = { ...emptyVessel(), speedTable: table };
    const sim = simulate(r, base, v, noEnv);
    near(sim.plan.eta as number, base.eta as number, 60e3, 'same ETA');
    assert.ok(sim.plan.track!.some(tp => tp.stopped));
    near(sim.legs[0].rpm as number, 60, 1e-9, '12 kn -> 60 rpm');
    near(sim.totalFuelT as number, (40 * sim.plan.totalHours) / 24, 1e-6);
    r.useCurrents = true;
    const fast = simulate(r, base, v, { wx: () => null, current: () => ({ kn: 2, set: 90 }) });
    assert.ok((fast.plan.eta as number) < (base.eta as number));
    near(fast.legs[0].avgSog, 14, 1e-6);
    near(fast.legs[0].sicwToHold, 10, 1e-6, 'to make 12 kn good over ground needs only 10 kn in calm water');
});

test('ETA mode holds the ETA against weather and current, needing more speed', () => {
    const r = route3();
    r.mode = 'eta';
    r.eta = T0 + 22 * H;
    r.lossMethod = 'kwon';
    const v = { ...emptyVessel(), speedTable: table, lbp: 236, breadth: 42.8, draftFwd: 12, draftAft: 12, cb: 0.65 };
    const base = computePlan(r, v);
    const wx = { windKn: 30, windDir: 90, hs: 4, hsDir: 90 } as WxPoint; // head weather on an eastbound route
    const sim = simulate(r, base, v, { wx: () => wx, current: () => ({ kn: 1, set: 270 }) });
    near(sim.plan.eta as number, r.eta as number, 5 * 60e3, 'ETA kept');
    assert.ok(sim.legs[0].sicw > (base.requiredSog as number) + 1, 'needs more speed in calm water');
});
