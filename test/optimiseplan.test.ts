import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyVersion, densify, stretchTimes, type RouteVersion } from '../src/lib/optimisePlan';
import { computePlan, newRoute, newWaypoint } from '../src/lib/model';
import { legGeometry } from '../src/lib/geo';

const T0 = Date.UTC(2026, 9, 28, 0, 0);

test('stretch times: departure from WP a and arrival at WP b as planned', () => {
    const r = newRoute('t');
    r.waypoints = [newWaypoint(0, 0), newWaypoint(0, 1), newWaypoint(0, 2), newWaypoint(0, 3)];
    r.defaultSpeed = 10;
    r.etd = T0;
    const p = computePlan(r);
    const s = stretchTimes(p, 1, 3);
    assert.equal(s.etd, p.legs[1].departMs);
    assert.equal(s.eta, p.eta);
    assert.ok(Math.abs((s.etd as number) - T0 - 6 * 3600e3) < 120e3, 'WP2 left about 6 h after ETD (60 nm at 10 kn)');
});

test('densify follows RL legs closely and keeps the end points', () => {
    const wps = [
        { lat: 40, lon: -60, legType: 'GC' as const },
        { lat: 45, lon: -20, legType: 'RL' as const },
    ];
    const pts = densify(wps, 30);
    assert.deepEqual(pts[0], { lat: 40, lon: -60 });
    assert.ok(Math.abs(pts[pts.length - 1].lat - 45) < 1e-6 && Math.abs(pts[pts.length - 1].lon + 20) < 1e-6);
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += legGeometry(pts[i - 1], pts[i], 'GC').distNm;
    const rl = legGeometry(wps[0], wps[1], 'RL').distNm;
    assert.ok(Math.abs(d - rl) < 1, `GC steps ${d.toFixed(1)} ≈ RL ${rl.toFixed(1)}`);
});

test('taking a version replaces only the waypoints between WP a and WP b', () => {
    const r = newRoute('t');
    r.waypoints = [newWaypoint(0, 0, 'RL', 'A'), newWaypoint(0, 1, 'RL', 'B'), newWaypoint(1, 5, 'RL', 'X'), newWaypoint(0, 10, 'RL', 'C'), newWaypoint(0, 11, 'RL', 'D')];
    const v = {
        id: 'GC',
        wps: [
            { lat: 0, lon: 1, legType: 'GC' },
            { lat: 2, lon: 4, legType: 'GC' },
            { lat: 2, lon: 7, legType: 'RL' },
            { lat: 0, lon: 10, legType: 'GC' },
        ],
        speeds: [12.34, 12.34, 12.34],
    } as unknown as RouteVersion;
    const out = applyVersion(r, 1, 3, v);
    assert.deepEqual(out.map(w => w.name), ['A', 'B', 'OPT1', 'OPT2', 'C', 'D']);
    assert.equal(out[3].legType, 'RL');
    assert.equal(out[4].legType, 'GC', 'leg into WP b takes the version leg type');
    assert.equal(out[2].speed, 12.3);
    assert.equal(r.waypoints.length, 5, 'original route untouched');
});
