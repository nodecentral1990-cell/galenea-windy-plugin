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

test('RPM advice: never barred (e.g. aux blower), never above max / below min, with the reason (owner 2026-11-23)', async () => {
    const { adviseRpm, rpmAdviceText, rpmAllowed } = await import('../src/lib/speed');
    const v = {
        ...emptyVessel(),
        speedTable: [
            { rpm: 40, sicw: 9, fuel: 20 },
            { rpm: 60, sicw: 12, fuel: 35 },
            { rpm: 80, sicw: 15, fuel: 60 },
        ],
        barredRpm: [{ from: 50, to: 55, why: 'Auxiliary blower cut-in / cut-out (scavenge air pressure)' }],
        minRpm: 42,
        maxRpm: 75,
    } as Vessel;
    assert.deepEqual(adviseRpm(v, 60), { rpm: 60 }, 'allowed: as wanted');
    const b = adviseRpm(v, 54)!;
    assert.equal(b.issue, 'barred');
    assert.equal(b.rpm, 56, 'nearest allowed outside 50–55 (54 is nearer the top)');
    assert.equal(b.alt, 49, 'the other side offered too');
    const b2 = adviseRpm(v, 51)!;
    assert.equal(b2.rpm, 49);
    assert.match(rpmAdviceText(v, 54, 'planned'), /54 RPM planned is inside the barred range 50–55 \(Auxiliary blower.*\): run at 56 RPM.*a little faster, or 49 RPM.*a little slower/);
    const hi = adviseRpm(v, 78)!;
    assert.equal(hi.issue, 'aboveMax');
    assert.equal(hi.rpm, 75);
    assert.match(rpmAdviceText(v, 78), /above your max RPM 75: run at 75 RPM.*ETA later/);
    assert.equal(adviseRpm(v, 38)!.issue, 'belowMin');
    assert.equal(adviseRpm(v, 38)!.rpm, 42);
    assert.equal(rpmAllowed(v, 52), false);
    assert.equal(rpmAllowed(v, 76), false);
    assert.equal(rpmAllowed(v, 70), true);
    // max inside a barred range: the next allowed below it
    const v2 = { ...v, barredRpm: [{ from: 73, to: 76, why: 'critical' }] } as Vessel;
    assert.equal(adviseRpm(v2, 79)!.rpm, 72);
});

test('safe plan speed choices keep within the min / max RPM and outside barred ranges', async () => {
    const { speedOptions } = await import('../src/lib/speedPlan');
    const v = {
        ...emptyVessel(),
        speedTable: [
            { rpm: 40, sicw: 9, fuel: 20 },
            { rpm: 80, sicw: 15, fuel: 60 },
        ],
        barredRpm: [{ from: 50, to: 55, why: 'blower' }],
        minRpm: 45,
        maxRpm: 70,
    } as Vessel;
    const { options } = speedOptions(v);
    assert.ok(options.length > 3);
    assert.ok(options.every(o => o.rpm == null || (o.rpm >= 45 && o.rpm <= 70 && !(o.rpm >= 50 && o.rpm <= 55))), options.map(o => o.rpm).join(','));
    assert.ok(options.some(o => o.rpm === 70) && options.some(o => o.rpm === 45), 'max and min RPM are choices');
});

// ---- owner's report 2026-11-24: "why sog sicw are same ... and slip is 0" ----

test('weather loss: forecast estimate by default, typed allowances kept, explicit choice wins', async () => {
    const { lossMethodOf, currentsOn } = await import('../src/lib/model');
    const r = route3();
    assert.equal(lossMethodOf(r), 'kwon', 'never chosen, no allowances: estimate from the forecast');
    r.waypoints[1].allowance = 0.5;
    assert.equal(lossMethodOf(r), 'manual', 'allowances typed in: kept');
    r.lossMethod = 'kwon';
    assert.equal(lossMethodOf(r), 'kwon');
    assert.equal(currentsOn(route3()), true, 'currents on unless switched off');
    assert.equal(currentsOn({ ...route3(), useCurrents: false }), false);
});

test('default route: head weather slows the ship (SiCW > STW), no particulars says so', () => {
    const r = route3();
    const v = { ...emptyVessel(), speedTable: table, lbp: 236, breadth: 42.8, draftFwd: 12, draftAft: 12, cb: 0.65 };
    const wx = { windKn: 30, windDir: 90, hs: 4, hsDir: 90 } as WxPoint;
    const sim = simulate(r, computePlan(r, v), v, { wx: () => wx, current: () => null });
    assert.ok(sim.legs[0].avgLossKn > 0.3, `loss ${sim.legs[0].avgLossKn}`);
    assert.ok(sim.legs[0].avgSog < sim.legs[0].sicw - 0.3, 'SOG below SiCW in head weather');
    const bare = { ...emptyVessel(), speedTable: table };
    const s2 = simulate(r, computePlan(r, bare), bare, { wx: () => wx, current: () => null });
    assert.ok(s2.notes.some(n => /needs LBP, breadth and drafts/.test(n)), 'tells what is missing');
    const r3 = { ...route3(), lossMethod: 'manual' as const };
    const s3 = simulate(r3, computePlan(r3, v), v, { wx: () => wx, current: () => null });
    assert.ok(s3.notes.some(n => /Weather loss is 0/.test(n)), 'manual with 0 allowance is said plainly');
});

test('current downloaded with the forecast is used when Windy\'s map was not read', async () => {
    const { currentAt } = await import('../src/lib/weather');
    const ts = [T0, T0 + 3 * H, T0 + 6 * H];
    const series = [{ lat: 0, lon: 1, ts, model: 'ecmwf', wind: [5, 5, 5], windDir: [0, 0, 0], extra: { ts, seaH: [null, null, null], seaDir: [null, null, null], seaPer: [null, null, null], curKn: [1.5, 1.5, 1.5], curDir: [90, 90, 90], visM: [null, null, null], fetchedAt: T0 } }] as any;
    const c = currentAt(series, new Map(), { lat: 0, lon: 1 }, T0 + 2 * H)!;
    near(c.kn, 1.5, 1e-9);
    near(c.set, 90, 1e-6);
    const sweep = new Map([[T0 + 2 * H, { currentKn: 0.5, currentSet: 270 }]]);
    near(currentAt(series, sweep, { lat: 0, lon: 1 }, T0 + 2 * H)!.kn, 0.5, 1e-9, "Windy's map reading takes over");
    assert.equal(currentAt(series, undefined, { lat: 0, lon: 1 }, T0 + 30 * H), null, 'beyond the forecast: none');
});

test('present position: the part of the leg already sailed is not counted as a stop', async () => {
    const { summarize } = await import('../src/lib/compare');
    const r = route3();
    const v = { ...emptyVessel(), speedTable: table };
    // at 0°, 1° E (60 nm along leg 1) after 6 h: 10 kn so far
    r.voyage = { startedAt: T0, fix: { lat: 0, lon: 1, t: T0 + 6 * H } };
    const s = summarize(r, v, {} as any, noEnv);
    near(s.stoppedH, 0, 0.05, 'no phantom stops');
    near(s.steamingH, s.totalH, 0.05);
    near(s.avgSog as number, s.distNm / s.totalH, 0.01, 'SOG = distance / time under way');
});

test('a fixed ETA is kept with ONE steady calm-water speed (RPM) per leg; SOG varies with the weather (owner 2026-11-24)', () => {
    const r = route3();
    r.mode = 'eta';
    r.eta = T0 + 22 * H;
    r.lossMethod = 'kwon';
    const v = { ...emptyVessel(), speedTable: table, lbp: 236, breadth: 42.8, draftFwd: 12, draftAft: 12, cb: 0.65 };
    const base = computePlan(r, v);
    // head weather for the first 8 hours only, then calm
    const env: Env = { wx: (_p, t) => (t < T0 + 8 * H ? ({ windKn: 30, windDir: 90, hs: 4, hsDir: 90 } as WxPoint) : ({ windKn: 0, windDir: 90, hs: 0, hsDir: 90 } as WxPoint)), current: () => null };
    const sim = simulate(r, base, v, env);
    near(sim.plan.eta as number, r.eta as number, 5e3, 'ETA kept to the second');
    const steaming = sim.plan.track!.filter(tp => !tp.stopped && tp.sicw > 0);
    for (const leg of [0, 1]) {
        const s = steaming.filter(tp => tp.legIdx === leg).map(tp => tp.sicw);
        near(Math.max(...s) - Math.min(...s), 0, 1e-9, `leg ${leg}: SiCW steady`);
    }
    const sogs = steaming.map(tp => tp.sog);
    assert.ok(Math.max(...sogs) - Math.min(...sogs) > 0.5, 'SOG changes between the bad weather and the calm');
});
