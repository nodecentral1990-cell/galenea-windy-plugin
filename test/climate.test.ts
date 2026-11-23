import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { climatePoint, climateWords, decodeClimMonth, setClimateSource, type ClimMonthFile } from '../src/lib/climate';
import { buildRows, defaultThresholds, weatherAt, type WxSeries } from '../src/lib/weather';
import { computePlan, emptyVessel, newRoute, newWaypoint } from '../src/lib/model';

const f = new URL('../data/climate/m01.json', import.meta.url);

test('climate table (ERA5, January): usual weather in the North Atlantic, trades and on land', { skip: !existsSync(f) }, () => {
    const m = decodeClimMonth(JSON.parse(readFileSync(f, 'utf8')) as ClimMonthFile);
    const na = climatePoint(m, 49.2, -30.8)!;
    assert.ok(na.windKn! > 15 && na.windKn! < 30, `NA wind ${na.windKn}`);
    assert.ok(na.windDir! > 200 && na.windDir! < 300, `NA wind from the west (${na.windDir})`);
    assert.ok(na.hs! > 3 && na.hs! < 6.5, `NA SWH ${na.hs}`);
    assert.ok(na.sw1! > 1 && na.sw1Period! > 9, 'swell 1 with a long period');
    assert.ok(na.clim && na.clim.hsGt4Pct! > 20, 'chance of SWH over 4 m');
    const tr = climatePoint(m, 15, -40)!;
    assert.ok(tr.windDir! > 30 && tr.windDir! < 110 && tr.windKn! > 10, `NE trades (${tr.windDir} ${tr.windKn})`);
    // inland: wind only (no waves), near a coast the waves come from the next square
    const land = climatePoint(m, 47, 101)!;
    assert.equal(land.hs, null, 'Mongolia: no waves');
    assert.match(climateWords(na.clim!), /^Climate, Jan \(2006–2025\): bad day/);
});

test('beyond the forecast the rows come from the climate (C), without firm warnings; the ETA uses them', () => {
    const r = newRoute();
    r.waypoints = [newWaypoint(49, -40), newWaypoint(49, -20)];
    r.etd = Date.UTC(2027, 0, 10, 0);
    const v = emptyVessel();
    const plan = computePlan(r, v);
    // forecast only for the first 12 hours
    const ts = [0, 6, 12].map(h => r.etd! + h * 3600e3);
    const series: WxSeries[] = [{ lat: 49, lon: -39.5, ts, model: 'ECMWF', wind: [10, 10, 10], windDir: [270, 270, 270], pressure: [101000, 101000, 101000], wavesTs: ts, waves: [3, 3, 3], wavesDir: [270, 270, 270], wavesPeriod: [9, 9, 9] }];
    const fake = { windKn: 40, gustKn: null, windDir: 260, pressureHpa: null, precipMm: null, fog: false, thunder: false, hs: 9, hsDir: 270, hsPeriod: 12, sw1: 6, sw1Dir: 270, sw1Period: 13, sw2: null, sw2Dir: null, sw2Period: null, seaHs: 5, seaDir: 260, seaPeriod: 9, seaWindy: true, airTempC: null, seaTempC: null, clim: { month: 1, years: '2006-2025', windP90: 50, galePct: 30, hsP90: 11, hsGt4Pct: 90, hsGt6Pct: 70 } };
    setClimateSource(() => fake as never);
    try {
        const rows = buildRows(r, plan, v, defaultThresholds(), 6, series);
        const c = rows.filter(x => x.src?.kind === 'climate');
        const fc = rows.filter(x => x.wx && x.src?.kind !== 'climate');
        assert.ok(fc.length >= 2 && c.length >= 3, `${fc.length} forecast rows, ${c.length} climate rows of ${rows.length}: ` + rows.map(x => (x.wx ? (x.src?.kind ?? 'f') : '-')).join(''));
        assert.ok(c.every(x => x.limits.length === 0 && x.resonance.length === 0 && x.level === 0), 'no firm warnings from climate');
        assert.match(c[0].src!.label, /not a forecast/);
        assert.equal(weatherAt(series, { lat: 49, lon: -39 }, r.etd! + 48 * 3600e3), null, 'not used unless asked');
        assert.equal(weatherAt(series, { lat: 49, lon: -25 }, r.etd! + 48 * 3600e3, { climate: true })!.hs, 9, 'used when asked (ETA)');
    } finally {
        setClimateSource(null);
    }
});
