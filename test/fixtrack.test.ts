import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePlan, newRoute, newWaypoint, positionAt } from '../src/lib/model';
import { legGeometry } from '../src/lib/geo';

const T0 = Date.UTC(2026, 9, 28, 0, 0);
const H = 3600e3;

test('after a position update off the track, the track goes on from the present position', () => {
    const r = newRoute('t');
    r.waypoints = [newWaypoint(0, 0), newWaypoint(0, 10), newWaypoint(0, 20)];
    r.defaultSpeed = 12;
    r.etd = T0;
    const pp = { lat: 0.5, lon: 5, t: T0 + 26 * H }; // 30 nm north of the track
    r.voyage = { startedAt: T0, fix: pp };
    const p = computePlan(r);
    assert.ok(p.fix, 'fix placed');
    const fx = p.fix!;
    assert.equal(fx.legIdx, 0);
    assert.ok(Math.abs(fx.offNm - 30) < 1, `off track ${fx.offNm.toFixed(1)} nm`);
    const sailed = legGeometry(r.waypoints[0], pp, 'RL').distNm;
    const toGo = legGeometry(pp, r.waypoints[1], 'RL').distNm;
    assert.ok(Math.abs(fx.sNm - sailed) < 1e-6 && Math.abs(fx.alongNm - sailed) < 1e-6, 'sailed = WP1 → present position');
    assert.ok(Math.abs(p.legs[0].distNm - (sailed + toGo)) < 1e-6);
    const leg2 = legGeometry(r.waypoints[1], r.waypoints[2], 'RL').distNm;
    assert.ok(Math.abs(p.totalNm - fx.alongNm - (toGo + leg2)) < 1e-6, `distance to go ${(p.totalNm - fx.alongNm).toFixed(1)} nm from the present position`);
    // at the fix time the ship is at the present position, 2 h later on the line from there to WP2
    const at = positionAt(r, p, pp.t)!;
    assert.ok(Math.abs(at.lat - pp.lat) < 0.01 && Math.abs(at.lon - pp.lon) < 0.01, `at the PP: ${at.lat.toFixed(3)}, ${at.lon.toFixed(3)}`);
    const later = positionAt(r, p, pp.t + 2 * H)!;
    assert.ok(later.lat < pp.lat && later.lat > 0.3 && later.lon > pp.lon, `heading for WP2 from the PP: ${later.lat.toFixed(3)}, ${later.lon.toFixed(3)}`);
    // the arrival at WP2 is the PP time plus the distance to go at the planned speed
    assert.ok(Math.abs((p.legs[0].arriveMs as number) - (pp.t + (toGo / 12) * H)) < 60e3);
});
