import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encounterPeriod, surfRidingSpeed, waveLength, checkWaveSystem, estimateRollPeriod, encounterAngle } from '../src/lib/circ1228';
import { sampleSeries, checkLimits, defaultThresholds, sectorOf, relFrom, beaufort, buildRows, rowTimes, fetchPlan, weatherAt, type WxSeries } from '../src/lib/weather';
import { newRoute, newWaypoint, computePlan, emptyVessel } from '../src/lib/model';

const near = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} vs ${b}`);
const settings = { parametric: 4, synchronous: 4, highWaves: 5, broaching: 5, tolerancePct: 15 };

test('circular formulas (worked examples)', () => {
    near(waveLength(10), 156, 1e-9);
    near(encounterPeriod(10, 18, 0), 6.25, 1e-9, 'head');
    near(encounterPeriod(10, 18, 180), 25, 1e-9, 'following');
    assert.equal(encounterPeriod(5, 15, 180), Infinity, 'riding with the waves: they never pass');
    assert.equal(encounterPeriod(5, 30, 180), 5, 'outrunning following waves: met from astern, |TE|');
    near(surfRidingSpeed(200, 180) as number, 25.456, 0.001);
    assert.equal(surfRidingSpeed(200, 120), null);
    near(encounterAngle(100, 10), 90, 1e-9, 'from starboard');
});

test('parametric roll flags both 1:1 and 1:0.5, any heading; synchronous at 1:1', () => {
    const ship = { headingDeg: 0, speedKn: 0, lbp: 240, rollPeriod: 20 };
    // Beam sea, ship stopped: TE = TW
    const half = checkWaveSystem({ label: 'Swell 1', height: 5, fromDir: 90, period: 10 }, ship, settings);
    assert.deepEqual(half.map(h => h.phenomenon), ['parametric']);
    const one = checkWaveSystem({ label: 'Swell 1', height: 5, fromDir: 90, period: 20 }, ship, settings);
    assert.deepEqual(one.map(h => h.phenomenon).sort(), ['parametric', 'synchronous']);
    const low = checkWaveSystem({ label: 'Swell 1', height: 3, fromDir: 90, period: 10 }, ship, settings);
    assert.equal(low.length, 0, 'below wave height threshold');
});

test('successive high waves and surf-riding in following seas', () => {
    // 100 m ship, following sea from astern, 12 s waves (225 m long > 80 m)
    const ship = { headingDeg: 0, speedKn: 19, lbp: 100, rollPeriod: null };
    const hits = checkWaveSystem({ label: 'SWH', height: 6, fromDir: 180, period: 12 }, ship, settings);
    const kinds = hits.map(h => h.phenomenon);
    assert.ok(kinds.includes('surf'), 'surf: 19 kn > 18 kn');
    const te = encounterPeriod(12, 19, 180);
    assert.equal(kinds.includes('highWaves'), te / 12 >= 1.8 && te / 12 <= 3.0);
});

test('roll period estimate (IS Code 2.3) is plausible', () => {
    const t = estimateRollPeriod(32.2, 12, 230, 1.5) as number;
    near(t, (2 * (0.373 + 0.023 * (32.2 / 12) - 0.043 * 2.3) * 32.2) / Math.sqrt(1.5), 1e-9);
    assert.equal(estimateRollPeriod(0, 12, 230, 1.5), null);
});

test('sectors: halfway between the five arms, same both sides', () => {
    const e = defaultThresholds().sectorEdges;
    assert.equal(sectorOf(relFrom(10, 0), e), 'head');
    assert.equal(sectorOf(relFrom(-45, 0), e), 'bow');
    assert.equal(sectorOf(relFrom(270, 0), e), 'beam');
    assert.equal(sectorOf(relFrom(135, 0), e), 'quarter');
    assert.equal(sectorOf(relFrom(200, 0), e), 'stern');
    assert.equal(beaufort(25), 6);
    assert.equal(beaufort(0.5), 0);
});

const T0 = Date.UTC(2026, 9, 12, 0, 0);
const H = 3600e3;
const series = (lat: number, lon: number, hs = 3): WxSeries => ({
    lat, lon, model: 'ecmwf', ts: [T0, T0 + 3 * H, T0 + 6 * H],
    wind: [10, 14, 18], windGust: [13, 18, 24], windDir: [350, 10, 30], pressure: [101300, 101000, 100700],
    precipAmount: [0, 1.2, 3], icon: [3, 17, 14], waves: [hs, hs, hs], wavesDir: [0, 0, 0], wavesPeriod: [9, 9, 9],
    swell1: [2, 2, 2], swell1Dir: [180, 180, 180], swell1Period: [12, 12, 12], swell2: [1, 1, 1], swell2Dir: [270, 270, 270], swell2Period: [8, 8, 8],
});

test('sampling interpolates values and directions across north', () => {
    const p = sampleSeries(series(0, 0), T0 + 1.5 * H)!;
    near(p.windKn as number, 12 * 1.943844, 1e-6);
    near(p.windDir as number, 0, 1e-9);
    near(p.pressureHpa as number, 1011.5, 1e-9);
    near(p.seaHs as number, Math.sqrt(9 - 4 - 1), 1e-9);
    assert.equal(p.fog, true, 'nearest icon at 1.5 h is the 3 h one (fog)');
    assert.equal(sampleSeries(series(0, 0), T0 + 7 * H), null, 'beyond forecast');
});

test('limit checks use the sector of each component', () => {
    const p = sampleSeries(series(0, 0, 5), T0 + 6 * H)!; // wind 35 kn from 030, Hs 5, wind sea 4.47 m
    const hits = checkLimits(p, 0, defaultThresholds());
    const what = hits.map(h => h.what);
    assert.ok(what.includes('SWH') && what.includes('Wind') && what.includes('Sea'));
    assert.ok(!what.includes('Swell 1'), 'swell 2 m under 4 m');
    assert.ok(hits.every(h => h.level === 2), 'alert = limit in defaults, so red');
});

test('table rows: steps plus waypoint ETAs, beyond forecast flagged', () => {
    const r = newRoute('t');
    r.waypoints = [newWaypoint(0, 0), newWaypoint(1, 0), newWaypoint(2, 0)];
    r.defaultSpeed = 10;
    r.etd = T0;
    const plan = computePlan(r);
    const times = rowTimes(plan, 3);
    assert.equal(times.filter(t => t.wp != null).length, 3);
    const pts = fetchPlan(r, plan, 3, T0 + 6 * H);
    assert.ok(pts.length >= 2);
    const v = emptyVessel();
    v.lbp = 200;
    const rows = buildRows(r, plan, v, defaultThresholds(), 3, pts.map(p => series(p.lat, p.lon)));
    assert.ok(rows[0].wx && !rows[0].beyond);
    assert.ok(rows[rows.length - 1].beyond, 'arrival ~12 h is past the 6 h forecast');
});

test('hourly time steps with empty slots (3/6-hourly data further out) are interpolated, not dropped', () => {
    const ts: number[] = [];
    const wind: (number | null)[] = [];
    const waves: (number | null)[] = [];
    for (let h = 0; h <= 240; h++) {
        ts.push(T0 + h * H);
        const has = h <= 90 || (h <= 144 ? h % 3 === 0 : h % 6 === 0);
        wind.push(has ? 10 + h / 10 : null);
        waves.push(has ? 2 + h / 100 : null);
    }
    const s: WxSeries = { lat: 0, lon: 0, model: 'ecmwf', ts, wind, windDir: ts.map(() => 90), waves, wavesDir: ts.map(() => 0), wavesPeriod: ts.map(() => 9) };
    // 08:09 on day 5 (h = 104.15) falls between the 3-hourly values at 102 and 105
    const p = sampleSeries(s, T0 + 104.15 * H)!;
    near(p.windKn as number, (10 + 10.415) * 1.943844, 1e-6, 'wind interpolated across the gap');
    near(p.hs as number, 2 + 1.0415, 1e-9, 'waves interpolated across the gap');
    // 20:09 on day 8 (h = 200.15): 6-hourly values at 198 and 204
    near(sampleSeries(s, T0 + 200.15 * H)!.windKn as number, (10 + 20.015) * 1.943844, 1e-6);
    // Past the last value: beyond forecast
    const s2: WxSeries = { ...s, wind: wind.map((v, i) => (i > 200 ? null : v)), waves: waves.map((v, i) => (i > 200 ? null : v)) };
    assert.equal(sampleSeries(s2, T0 + 230 * H), null);
});

test('a forecast point far from the ship is not used', () => {
    assert.ok(weatherAt([series(0, 0)], { lat: 1, lon: 0 }, T0 + 3 * H), '60 nm away: used');
    assert.equal(weatherAt([series(0, 0)], { lat: 4, lon: 0 }, T0 + 3 * H), null, '240 nm away: not used');
});

test('wave power: from Windy if sent, else 0.49 × SWH² × period', async () => {
    const { wavePower } = await import('../src/lib/weather');
    assert.deepEqual(wavePower(55, 4, 10), { powerKw: 55, powerCalc: false });
    const p = wavePower(null, 4, 10);
    assert.ok(Math.abs((p.powerKw as number) - 78.4) < 1e-9 && p.powerCalc);
    assert.deepEqual(wavePower(null, null, 10), { powerKw: null, powerCalc: false });
});
