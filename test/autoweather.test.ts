import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePlan, newRoute, newWaypoint } from '../src/lib/model';
import { areaGrid, inArea, routePointsByLeg, sampleSeries, type WxSeries } from '../src/lib/weather';
import { extraFromJson } from '../src/lib/marineExtra';

const T0 = Date.UTC(2026, 10, 20);

test('forecast points leg by leg: an edit of the last waypoint leaves the other legs\' points exactly as they were', () => {
    const r = newRoute('t');
    r.waypoints = [newWaypoint(10, -40, 'RL'), newWaypoint(12, -35, 'RL'), newWaypoint(15, -30, 'GC'), newWaypoint(18, -25, 'RL')];
    const a = routePointsByLeg(computePlan(r));
    r.waypoints[3] = newWaypoint(18.4, -24.2, 'RL');
    const b = routePointsByLeg(computePlan(r));
    const key = (p: { lat: number; lon: number }) => `${p.lat},${p.lon}`;
    const same = b.filter(p => a.some(q => key(q) === key(p))).length;
    assert.ok(a.length > 10 && a.length <= 120, `${a.length} points`);
    assert.ok(same >= a.length * 0.6, `${same} of ${b.length} points need no new download`);
});

test('area grid: finest of 0.5 / 1 / 2 / 3° within 300 points; across the date line; inside test', () => {
    const g = areaGrid({ n: 15, s: 10, w: -40, e: -35 })!;
    assert.equal(g.step, 0.5);
    assert.equal(g.points.length, 11 * 11);
    assert.equal(areaGrid({ n: 20, s: 10, w: -40, e: -30 })!.step, 1);
    const big = areaGrid({ n: 40, s: 0, w: -60, e: -20 })!;
    assert.equal(big.step, 3);
    assert.ok(big.points.length <= 300);
    assert.equal(areaGrid({ n: 10, s: 20, w: 0, e: 10 }), null, 'north must be north of south');
    const dl = areaGrid({ n: 10, s: 0, w: 170, e: -170 })!;
    assert.ok(dl.points.some(p => p.lon === 180 || p.lon === -180) && dl.points.some(p => p.lon === -170) && dl.points.some(p => p.lon === 170));
    assert.equal(inArea({ n: 10, s: 0, w: 170, e: -170 }, 5, 179), true);
    assert.equal(inArea({ n: 10, s: 0, w: 170, e: -170 }, 5, 160), false);
});

test('downloaded sea, current and visibility used in the weather (no map reading needed); Windy\'s own values still win', () => {
    const ts = Array.from({ length: 48 }, (_, i) => T0 + i * 3600e3);
    const extra = extraFromJson(
        { hourly_units: { ocean_current_velocity: 'km/h' }, hourly: { time: ts.map(t => t / 1000), wind_wave_height: ts.map(() => 2.2), wind_wave_direction: ts.map(() => 300), wind_wave_period: ts.map(() => 6), ocean_current_velocity: ts.map(() => 3.704), ocean_current_direction: ts.map(() => 90) } },
        { hourly: { time: ts.map(t => t / 1000), visibility: ts.map(() => 1852) } },
    )!;
    const s: WxSeries = { lat: 0, lon: 0, ts, model: 'ECMWF', wind: ts.map(() => 10), windDir: ts.map(() => 270), waves: ts.map(() => 3), wavesDir: ts.map(() => 280), wavesPeriod: ts.map(() => 9), swell1: ts.map(() => 1.5), extra };
    const w = sampleSeries(s, T0 + 5.5 * 3600e3)!;
    assert.equal(w.seaHs, 2.2);
    assert.equal(w.seaWindy, true);
    assert.equal(w.seaSrc, 'openmeteo');
    assert.equal(w.seaPeriod, 6);
    assert.equal(Math.round(w.currentKn! * 10) / 10, 2);
    assert.equal(w.currentSet, 90);
    assert.equal(w.visNm, 1);
});
