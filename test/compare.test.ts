import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDH, summarize } from '../src/lib/compare';
import { emptyVessel, newRoute, newWaypoint } from '../src/lib/model';
import { defaultThresholds, type WxPoint } from '../src/lib/weather';

const T0 = Date.UTC(2026, 10, 1);
const near = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} vs ${b}`);
const route = () => {
    const r = newRoute('A');
    r.waypoints = [newWaypoint(0, 0), newWaypoint(0, 2)]; // ~120 nm east
    r.defaultSpeed = 12;
    r.etd = T0;
    return r;
};
const calm = { wx: () => null, current: () => null };
const wx = (o: Partial<WxPoint>): WxPoint => ({
    windKn: 10, gustKn: 12, windDir: 90, pressureHpa: 1013, precipMm: 0, fog: false, thunder: false,
    hs: 1, hsDir: 90, hsPeriod: 6, sw1: 0.5, sw1Dir: 90, sw1Period: 8, sw2: null, sw2Dir: null, sw2Period: null, seaHs: 0.8, ...o,
});

test('distance, times, speeds, fuel and RPM from the table', () => {
    const v = { ...emptyVessel(), pitch: 7, speedTable: [{ rpm: 60, sicw: 12, fuel: 48 }] };
    const s = summarize(route(), v, defaultThresholds(), calm);
    near(s.distNm, 120.4, 0.5);
    near(s.totalH, s.distNm / 12, 1e-6);
    near(s.avgSog as number, 12, 1e-6);
    near(s.avgSicw as number, 12, 1e-6);
    near(s.avgRpm as number, 60, 1e-9);
    near(s.fuelT as number, (48 * s.steamingH) / 24, 1e-6);
    // slip: engine speed 7 m × 60 rpm × 60 / 1852 = 13.6 kn vs 12 kn through water
    near(s.avgSlipPct as number, ((13.607 - 12) / 13.607) * 100, 0.1);
    assert.equal(s.wxCover, 0);
});

test('same ETD option overrides each route ETD', () => {
    const s = summarize(route(), emptyVessel(), defaultThresholds(), calm, { etd: T0 + 24 * 3600e3 });
    assert.equal(s.etd, T0 + 24 * 3600e3);
});

test('wind over 34 kn, over your wind and wave limits, current factor', () => {
    const th = defaultThresholds(); // wind limit 25 kn, Hs 4 m
    const env = { wx: () => wx({ windKn: 40, hs: 5 }), current: () => ({ kn: 1, set: 270 }) }; // current against an eastbound ship
    const s = summarize(route(), emptyVessel(), th, env);
    near(s.galeH, s.totalH, 0.01, 'whole voyage in a gale');
    near(s.windLimitH, s.totalH, 0.01);
    near(s.waveLimitH, s.totalH, 0.01);
    near(s.avgCurrentKn as number, -1, 1e-6, 'current against = negative');
    near(s.wxCover, 1, 0.01);
    const calmS = summarize(route(), emptyVessel(), th, { wx: () => wx({}), current: () => null });
    assert.equal(calmS.galeH, 0);
    assert.equal(calmS.windLimitH, 0);
});

test('days and hours format', () => {
    assert.equal(fmtDH(0), '0D 00H');
    assert.equal(fmtDH(29.6), '1D 06H');
});
