import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, forecastPoints, optimise, evaluateTrack, toLegType, styledDistance, maxAbsLat, quickNm, defaultSpeeds, type OptimiseEnv } from '../src/lib/optimise';
import { legGeometry } from '../src/lib/geo';
import { emptyVessel, type Vessel } from '../src/lib/model';
import { defaultThresholds, type WxPoint } from '../src/lib/weather';

const near = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} vs ${b}`);
const T0 = Date.UTC(2026, 9, 25, 0, 0);
const H = 3600e3;

// A made-up ship and table (not any real vessel's data)
const ship = (): Vessel => ({
    ...emptyVessel(),
    lbp: 220,
    breadth: 32,
    draftFwd: 11,
    draftAft: 11,
    cb: 0.65,
    speedTable: [
        { rpm: 55, sicw: 11, fuel: 28 },
        { rpm: 65, sicw: 13, fuel: 40 },
        { rpm: 75, sicw: 15, fuel: 58 },
        { rpm: 85, sicw: 17, fuel: 84 },
    ],
});

const wxOf = (p: Partial<WxPoint>): WxPoint => ({
    windKn: 10, gustKn: 14, windDir: 270, pressureHpa: 1015, precipMm: 0, fog: false, thunder: false,
    hs: 1.5, hsDir: 270, hsPeriod: 8, sw1: 1, sw1Dir: 270, sw1Period: 10, sw2: null, sw2Dir: null, sw2Period: null, seaHs: 1.1,
    ...p,
});

const calm: OptimiseEnv = { wxAt: () => wxOf({}) };

// Westbound in the North Atlantic, roughly Channel approaches to Newfoundland (made-up positions)
const A = { lat: 49, lon: -8 };
const B = { lat: 47, lon: -52 };
const th = defaultThresholds(); // SWH limit 4 m, wind 25 kn

/** Cross-track distance of each track point from the great circle A→B, nm */
const offGc = (pts: { lat: number; lon: number }[]) => {
    const g = legGeometry(A, B, 'GC');
    return pts.map(p => {
        let best = Infinity;
        for (let d = 0; d <= g.distNm; d += 5) best = Math.min(best, quickNm(p, g.pointAt(d)));
        return best;
    });
};

test('grid: lens shape around the GC, forecast points snapped to 1° and far fewer than nodes', () => {
    const g = buildGrid(A, B, { stages: 12, halfWidth: 4, maxOffsetNm: 240 });
    assert.equal(g.stages.length, 13);
    assert.equal(g.stages[0].length, 1);
    assert.equal(g.stages[12].length, 1);
    assert.equal(g.stages[6].length, 9);
    const mid = g.stages[6];
    const outer = mid.find(n => n.k === 4)!;
    const centre = mid.find(n => n.k === 0)!;
    near(quickNm(outer, centre), 240, 15, 'outer node at the full offset mid-voyage');
    const edge = g.stages[1];
    near(quickNm(edge.find(n => n.k === 4)!, edge.find(n => n.k === 0)!), 240 * Math.sin(Math.PI / 12), 10, 'narrow near the ends');
    const nodes = g.stages.reduce((s, r) => s + r.length, 0);
    const fp = forecastPoints(g);
    assert.ok(fp.length <= nodes && fp.length >= 30, `${fp.length} forecast points for ${nodes} nodes`);
    assert.ok(fp.every(p => Number.isInteger(p.lat) && Number.isInteger(p.lon)));
});

test('speeds to try come from the table range', () => {
    assert.deepEqual(defaultSpeeds(ship().speedTable), [11, 12, 13, 14, 15, 16, 17]);
    assert.deepEqual(defaultSpeeds([], 12), [10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14], 'no table: planned speed ± 2 kn');
});

test('(1) calm weather everywhere: the optimised track is the great circle', () => {
    const v = ship();
    const direct = evaluateTrack([A, B], [14], T0, v, th, calm);
    const r = optimise(A, B, T0, v, th, calm, { eta: direct.eta, stages: 12, halfWidth: 4, maxOffsetNm: 240 });
    assert.ok(r.ok && r.route, r.notes.join(' | '));
    const off = offGc(r.route!.points);
    assert.ok(Math.max(...off) < 10, `stays on the GC: max off ${Math.max(...off).toFixed(1)} nm`);
    near(r.route!.distNm, direct.distNm, 5, 'same distance as the GC');
    assert.ok(r.route!.eta <= direct.eta + 1 * H, 'arrives by the ETA');
    assert.ok(r.route!.fuel <= direct.fuel * 1.01, `fuel ${r.route!.fuel.toFixed(1)} vs direct ${direct.fuel.toFixed(1)}`);
    assert.equal(r.route!.breachH, 0);
    assert.equal(r.fuelUnit, 't');
    assert.ok(r.stats.ms < 15000, `took ${r.stats.ms} ms`);
});

/** A storm blob (SWH 6 m, wind 45 kn) centred on the GC midpoint, radius `rNm`, present the whole time */
const stormEnv = (rNm: number): OptimiseEnv => {
    const g = legGeometry(A, B, 'GC');
    const c = g.pointAt(g.distNm / 2);
    return {
        wxAt: (lat, lon) => (quickNm({ lat, lon }, c) < rNm ? wxOf({ hs: 6, hsDir: 300, windKn: 45, windDir: 300, seaHs: 5.5 }) : wxOf({})),
    };
};

test('(2) a storm on the GC above the SWH limit: the route goes around it, no time inside the limit', () => {
    const v = ship();
    const env = stormEnv(150);
    const direct = evaluateTrack([A, B], [14], T0, v, th, env);
    assert.ok(direct.breachH > 0, 'the direct route is inside the limit for a while');
    const r = optimise(A, B, T0, v, th, env, { eta: direct.eta + 6 * H, stages: 12, halfWidth: 5, maxOffsetNm: 300 });
    assert.ok(r.ok && r.route, r.notes.join(' | '));
    assert.equal(r.limitsMode, 'hard', 'a route inside the limits exists');
    assert.equal(r.route!.breachH, 0, 'no time inside a red limit');
    const off = offGc(r.route!.points);
    assert.ok(Math.max(...off) > 100, `goes round: max off ${Math.max(...off).toFixed(0)} nm`);
    assert.ok(r.route!.distNm > direct.distNm, 'longer than the GC');
    assert.ok(r.route!.eta <= direct.eta + 7 * H);
    assert.ok(r.direct && r.direct.breachH > 0, 'the comparison route shows the breach that was avoided');
});

test('(2b) when no route can avoid the limit in time, the least exposed route is returned with a note', () => {
    const v = ship();
    const env = stormEnv(2000); // the whole ocean
    const direct = evaluateTrack([A, B], [14], T0, v, th, env);
    const r = optimise(A, B, T0, v, th, env, { eta: direct.eta + 6 * H, stages: 8, halfWidth: 3, maxOffsetNm: 200 });
    assert.ok(r.ok && r.route);
    assert.equal(r.limitsMode, 'soft');
    assert.ok(r.notes.some(n => /No route keeps inside/.test(n)));
    assert.ok(r.route!.breachH > 0);
});

test('(3) head-wind band near the GC (under the limits): optimised fuel ≤ direct fuel at the same ETA', () => {
    const v = ship();
    const g = legGeometry(A, B, 'GC');
    // Beaufort 6 head wind (24 kn, under the 25 kn limit) and 3.5 m head seas (under the 4 m limit)
    // within 120 nm of the GC on the middle third; calm elsewhere
    const env: OptimiseEnv = {
        wxAt: (lat, lon) => {
            let best = Infinity;
            for (let d = g.distNm / 3; d <= (2 * g.distNm) / 3; d += 10) best = Math.min(best, quickNm({ lat, lon }, g.pointAt(d)));
            return best < 120 ? wxOf({ windKn: 24, windDir: 260, hs: 3.5, hsDir: 260, seaHs: 3.2 }) : wxOf({});
        },
    };
    const planned = evaluateTrack([A, B], [14], T0, v, th, env);
    assert.equal(planned.breachH, 0, 'no limit broken, just slow going');
    const r = optimise(A, B, T0, v, th, env, { eta: planned.eta, stages: 12, halfWidth: 5, maxOffsetNm: 300 });
    assert.ok(r.ok && r.route && r.direct, r.notes.join(' | '));
    assert.ok(r.route!.eta <= planned.eta + 1 * H, 'arrives by the same ETA');
    assert.ok(r.direct!.eta <= planned.eta + 1 * H, 'the comparison route also meets the ETA');
    assert.ok(r.route!.fuel <= r.direct!.fuel + 1e-6, `optimised ${r.route!.fuel.toFixed(1)} t ≤ direct ${r.direct!.fuel.toFixed(1)} t`);
    assert.ok(r.route!.fuel <= planned.fuel * 1.005, `optimised ${r.route!.fuel.toFixed(1)} t ≤ planned ${planned.fuel.toFixed(1)} t`);
    assert.ok(r.route!.legs.every(l => l.rpm != null && l.sicw >= 11 && l.sicw <= 17), 'every leg has a speed and RPM from the table');
});

test('fixed ETA that even full speed cannot make: no route, plain note', () => {
    const v = ship();
    const r = optimise(A, B, T0, v, th, calm, { eta: T0 + 24 * H, stages: 8, halfWidth: 2 });
    assert.equal(r.ok, false);
    assert.ok(r.notes.some(n => /No route reaches the destination by the ETA/.test(n)));
});

test('land, extra-cost hook and relative fuel units', () => {
    const v = ship();
    const g = legGeometry(A, B, 'GC');
    const c = g.pointAt(g.distNm / 2);
    // An island on the GC midpoint, 80 nm across
    const env: OptimiseEnv = { wxAt: () => wxOf({}), isWater: (lat, lon) => quickNm({ lat, lon }, c) > 40 };
    const direct = evaluateTrack([A, B], [14], T0, v, th, calm);
    const r = optimise(A, B, T0, v, th, env, { eta: direct.eta + 4 * H, stages: 12, halfWidth: 5, maxOffsetNm: 300 });
    assert.ok(r.ok && r.route);
    assert.ok(r.route!.points.every(p => quickNm(p, c) > 40), 'no waypoint on the island');
    // Roll hook: forbid anything within 200 nm of the midpoint (stand-in for "predicted roll above the limit")
    const roll: OptimiseEnv = { wxAt: () => wxOf({}), extraCost: ctx => (quickNm(ctx, c) < 200 ? { forbidden: true, what: 'Roll' } : null) };
    const r2 = optimise(A, B, T0, v, th, roll, { eta: direct.eta + 8 * H, stages: 12, halfWidth: 5, maxOffsetNm: 400 });
    assert.ok(r2.ok && r2.route, r2.notes.join(' | '));
    assert.ok(Math.max(...offGc(r2.route!.points)) > 150, 'kept clear of the roll zone');
    // No fuel table: relative units and a note
    const bare = { ...ship(), speedTable: [] };
    const r3 = optimise(A, B, T0, bare, th, calm, { eta: direct.eta, stages: 6, halfWidth: 2, plannedSpeed: 14 });
    assert.equal(r3.fuelUnit, 'relative');
    assert.ok(r3.notes.some(n => /relative units/.test(n)));
});

test('(4) GC, RL and composite versions of a track give sensible distances', () => {
    // New York approaches to the Channel approaches (made-up), high-latitude GC
    const a = { lat: 40.5, lon: -73.5 };
    const b = { lat: 47.5, lon: -8 };
    const g = legGeometry(a, b, 'GC');
    const track = Array.from({ length: 13 }, (_, i) => {
        const p = g.pointAt((g.distNm * i) / 12);
        return { lat: p.lat, lon: p.lon };
    });
    const gc = toLegType(track, 'GC');
    const rl = toLegType(track, 'RL');
    const comp = toLegType(track, 'composite', { limitLat: 48 });
    const dGc = styledDistance(gc);
    const dRl = styledDistance(rl);
    const dComp = styledDistance(comp);
    near(dGc, g.distNm, 2, 'GC version = the great circle');
    assert.equal(gc.length, 2, 'a GC track straightens to one leg');
    assert.ok(gc.every(w => w.legType === 'GC'));
    assert.ok(rl.length >= 3 && rl.length <= 13, `RL version needs several legs to follow the GC: ${rl.length} points`);
    assert.ok(rl.every(w => w.legType === 'RL'));
    assert.ok(dRl >= dGc && dRl <= legGeometry(a, b, 'RL').distNm + 1, 'RL version between the GC and the single rhumb line');
    const vertex = maxAbsLat(gc);
    assert.ok(vertex > 49, `the GC goes north of 49°: ${vertex.toFixed(1)}`);
    assert.ok(maxAbsLat(comp) <= 48.05, `composite stays at or below 48°N: ${maxAbsLat(comp).toFixed(2)}`);
    assert.ok(comp.some(w => w.legType === 'RL') && comp.some(w => w.legType === 'GC'), 'composite = GC, RL along the parallel, GC');
    assert.ok(dComp > dGc && dComp < legGeometry(a, b, 'RL').distNm, `composite ${dComp.toFixed(0)} between GC ${dGc.toFixed(0)} and RL ${legGeometry(a, b, 'RL').distNm.toFixed(0)}`);
    // Limiting latitude above the vertex: composite = GC
    assert.equal(toLegType(track, 'composite', { limitLat: 60 }).length, 2);
    // asPlanned copies the user's leg types
    const planned = [{ ...a, legType: 'RL' as const }, { lat: 45, lon: -40, legType: 'GC' as const }, { ...b, legType: 'RL' as const }];
    const ap = toLegType(track, 'asPlanned', { planned });
    assert.ok(ap.slice(1).every(w => w.legType === 'RL' || w.legType === 'GC'));
});
