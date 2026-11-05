import { test } from 'node:test';
import assert from 'node:assert/strict';

import { distanceRow, findPorts, nearestNode, ports, seaRoute, unwrapPath } from '../src/lib/seaNet';

const port = (code: string) => {
    const p = ports().find(x => x.code === code);
    assert.ok(p, code);
    return p!;
};
const route = (a: string, b: string) => {
    const r = seaRoute(port(a), port(b));
    assert.ok(r, `${a}-${b}`);
    return r!;
};

test('port list loads and can be searched', () => {
    assert.ok(ports().length > 1500);
    assert.equal(findPorts('NLRTM')[0].name, 'Rotterdam');
    assert.equal(findPorts('rotter')[0].code, 'NLRTM');
    assert.ok(findPorts('nhava').some(p => p.code === 'INNSA'));
});

test('sea distances are sensible and pass the right canals (sanity bounds, not exact figures)', () => {
    const t0 = Date.now();
    const sinRtm = route('SGSIN', 'NLRTM');
    // well over the great circle (~5,600 nm) and through Suez
    assert.ok(sinRtm.distNm > 7800 && sinRtm.distNm < 8800, `${sinRtm.distNm}`);
    assert.ok(sinRtm.via.includes('Suez Canal'), sinRtm.via.join());
    assert.ok(sinRtm.via.includes('Strait of Gibraltar'));
    const colNyc = route('PAONX', 'USNYC');
    assert.ok(colNyc.distNm > 1800 && colNyc.distNm < 2150, `${colNyc.distNm}`);
    const rtmNyc = route('NLRTM', 'USNYC');
    assert.ok(rtmNyc.distNm > 3200 && rtmNyc.distNm < 3700, `${rtmNyc.distNm}`);
    assert.ok(rtmNyc.via.includes('Dover Strait'), rtmNyc.via.join());
    // across the Pacific (date line): Los Angeles to Tokyo, roughly 4,800–5,200 nm
    const laxTyo = route('USLAX', 'JPTYO');
    assert.ok(laxTyo.distNm > 4500 && laxTyo.distNm < 5400, `${laxTyo.distNm}`);
    const nsaJea = route('INNSA', 'AEJEA');
    assert.ok(nsaJea.via.includes('Strait of Hormuz'), nsaJea.via.join());
    assert.ok(Date.now() - t0 < 3000, 'fast enough');
});

test('distance row gives GC ≤ RL and sea ≥ GC; drawing path has no date-line jump', () => {
    const a = port('USLAX');
    const b = port('JPTYO');
    const r = distanceRow('LA', a, 'Tokyo', b);
    assert.ok(r.gcNm <= r.rlNm + 1e-6);
    assert.ok(r.sea && r.sea.distNm >= r.gcNm - 1);
    const pts = unwrapPath(r.sea!.path);
    for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i][1] - pts[i - 1][1]) < 180);
    assert.ok(nearestNode({ lat: 0, lon: -30 })!.nm < 200);
});

test('places along a planned route: ports and straits in route order with distance to go', async () => {
    const { computePlan, newRoute, newWaypoint } = await import('../src/lib/model');
    const { placesAlongRoute } = await import('../src/lib/distances');
    const r = newRoute('Gib');
    // west of Gibraltar to east of it, through the strait
    r.waypoints = [newWaypoint(36.0, -7.0), newWaypoint(35.95, -5.6), newWaypoint(36.2, -3.0)];
    r.etd = Date.UTC(2026, 10, 2, 0);
    r.defaultSpeed = 12;
    const plan = computePlan(r);
    const pl = placesAlongRoute(plan);
    const gib = pl.find(p => p.name === 'Strait of Gibraltar');
    assert.ok(gib, pl.map(p => p.name).join());
    assert.ok(gib!.alongNm > 40 && gib!.alongNm < 90, `${gib!.alongNm}`);
    assert.ok(Math.abs(gib!.alongNm + gib!.toGoNm - plan.totalNm) < 1e-6);
    assert.ok(gib!.etaMs != null && gib!.etaMs > r.etd!);
    for (let i = 1; i < pl.length; i++) assert.ok(pl[i].alongNm >= pl[i - 1].alongNm);
    assert.ok(pl.some(p => p.kind === 'port'), 'some port near the strait');
});
