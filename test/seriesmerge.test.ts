import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dropIndices, fakeIndices, gaps, omToSeries, omUrls, spliceSeries, stepOf, withHistory } from '../src/lib/seriesMerge';
import { buildRows, forecastInfo, sampleSeries, type WxSeries } from '../src/lib/weather';

const H = 3600e3;
const T0 = Date.UTC(2026, 10, 2, 0);

function series(from: number, n: number, stepH: number, wind: number, waves: number, run: string): WxSeries {
    const ts = Array.from({ length: n }, (_, i) => from + i * stepH * H);
    return { lat: 10, lon: 60, ts, model: 'ECMWF', refTime: run, wind: ts.map(() => wind), windDir: ts.map(() => 90), pressure: ts.map(() => 101300), wavesTs: ts, waves: ts.map(() => waves), swell1: ts.map(() => waves / 2), wavesModel: 'ECMWF-WAM', wavesRefTime: run };
}

test('Windy fake promotional days are found and dropped', () => {
    const summary = { a: { index: 0, segments: 8 }, b: { index: 8, segments: 8, isFake: true }, c: { index: 16, segments: 8, isFake: true } };
    const drop = fakeIndices(summary, 20);
    assert.equal(drop.size, 12);
    const d = dropIndices({ ts: Array.from({ length: 20 }, (_, i) => i), wind: Array.from({ length: 20 }, (_, i) => i * 2), x: 'keep' }, drop);
    assert.deepEqual(d.ts, [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(d.wind, [0, 2, 4, 6, 8, 10, 12, 14]);
    assert.equal(d.x, 'keep');
    assert.equal(fakeIndices(null, 10).size, 0);
    assert.equal(fakeIndices([{ index: 2, segments: 2, isFake: true }], 10).size, 2);
});

test('forecast step is detected (free 3 h, Premium 1 h)', () => {
    assert.equal(stepOf(series(T0, 10, 3, 5, 1, 'r').ts), 3 * H);
    assert.equal(stepOf(series(T0, 10, 1, 5, 1, 'r').ts), H);
});

test('an earlier run fills the times before the new run (past weather kept)', () => {
    const old = series(T0, 48, 1, 5, 1, '2026-11-02T00:00:00Z');
    const fresh = series(T0 + 24 * H, 48, 1, 10, 2, '2026-11-03T00:00:00Z');
    const m = withHistory(fresh, old, () => ({ air: 'old run', waves: 'old run' }));
    assert.equal(m.ts[0], T0);
    // before the new run: the old values; from it on: the new ones
    assert.equal(sampleSeries(m, T0 + 6 * H)?.windKn?.toFixed(2), (5 * 1.943844).toFixed(2));
    assert.equal(sampleSeries(m, T0 + 30 * H)?.windKn?.toFixed(2), (10 * 1.943844).toFixed(2));
    assert.equal(sampleSeries(m, T0 + 6 * H)?.hs, 1);
    assert.equal(sampleSeries(m, T0 + 30 * H)?.hs, 2);
    const kept = m.parts?.filter(p => p.kind === 'kept');
    assert.ok(kept && kept.length === 2);
    assert.equal(kept[0].to, T0 + 23 * H);
    // a third run keeps both earlier stretches
    const third = series(T0 + 48 * H, 24, 1, 15, 3, '2026-11-04T00:00:00Z');
    const m3 = withHistory(third, m, k => ({ air: `run ${k.refTime}`, waves: `run ${k.refTime}` }));
    assert.equal(sampleSeries(m3, T0 + 6 * H)?.hs, 1);
    assert.equal(sampleSeries(m3, T0 + 30 * H)?.hs, 2);
    assert.equal(sampleSeries(m3, T0 + 50 * H)?.hs, 3);
    assert.ok((m3.parts ?? []).some(p => p.label === 'old run'), 'oldest label kept');
});

test('Open-Meteo fills after the end of a short (free) Windy forecast; Windy wins where it has data', () => {
    const windy = series(T0, 5 * 8, 3, 10, 2, 'r'); // 5 days, 3-hourly
    const omTs = Array.from({ length: 16 * 24 }, (_, i) => (T0 + i * H) / 1000);
    const om = omToSeries(
        10,
        60,
        { hourly: { time: omTs, wind_speed_10m: omTs.map(() => 4), wind_direction_10m: omTs.map(() => 180), pressure_msl: omTs.map(() => 1010), temperature_2m: omTs.map(() => 25), weather_code: omTs.map(() => 45), visibility: omTs.map(() => 5556) } },
        { hourly: { time: omTs, wave_height: omTs.map(() => 3), wave_direction: omTs.map(() => 200), wave_period: omTs.map(() => 9), wind_wave_height: omTs.map(() => 1.5), wind_wave_direction: omTs.map(() => 190), wind_wave_period: omTs.map(() => 5), swell_wave_height: omTs.map(() => 2.5), swell_wave_direction: omTs.map(() => 210), swell_wave_period: omTs.map(() => 11), secondary_swell_wave_height: omTs.map(() => null) } },
    );
    assert.ok(om);
    assert.equal(om!.pressure?.[0], 101000);
    assert.equal(om!.ts[1] - om!.ts[0], H);
    assert.deepEqual(gaps(windy, T0, T0 + 10 * 24 * H), { before: false, after: true });
    const m = spliceSeries(windy, om!, 'openmeteo', { air: 'OM air', waves: 'OM waves' });
    const day2 = sampleSeries(m, T0 + 48 * H)!;
    assert.equal(day2.hs, 2); // Windy
    const day8 = sampleSeries(m, T0 + 8 * 24 * H)!;
    assert.equal(day8.hs, 3); // Open-Meteo
    assert.equal(day8.seaHs, 1.5); // wind sea straight from Open-Meteo
    assert.equal(day8.seaDir, 190);
    assert.equal(day8.seaPeriod, 5);
    assert.equal(day8.pressureHpa, 1010);
    assert.equal(day8.fog, true);
    assert.equal(day8.visNm?.toFixed(1), '3.0');
    assert.ok(m.parts?.some(p => p.kind === 'openmeteo' && p.group === 'air' && p.from > windy.ts[windy.ts.length - 1]));
    const info = forecastInfo([m]);
    assert.ok(info?.other.some(o => o.startsWith('OM air')));
});

test('Open-Meteo request asks for the past days and pins the models', () => {
    const u = omUrls(10, 60.5, 3.2, { air: 15, waves: 16 });
    assert.match(u.air, /past_days=4/);
    assert.match(u.air, /models=ecmwf_ifs025/);
    assert.match(u.air, /wind_speed_unit=ms/);
    assert.match(u.waves, /models=ncep_gfswave025/);
    assert.match(u.waves, /secondary_swell_wave_height/);
    assert.match(omUrls(0, 0, 500, { air: 15, waves: 16 }).air, /past_days=92/);
});

test('weather rows say where past / filled weather comes from', () => {
    const old = series(T0, 48, 1, 5, 1, '2026-11-02T00:00:00Z');
    const fresh = series(T0 + 24 * H, 48, 1, 10, 2, '2026-11-03T00:00:00Z');
    const m = withHistory(fresh, old, () => ({ air: 'kept run', waves: 'kept run' }));
    const part = m.parts?.find(p => p.kind === 'kept');
    assert.equal(part?.label, 'kept run');
    // buildRows marks the source (smoke test via a minimal plan is in weather tests); here check the lookup
    assert.equal(typeof buildRows, 'function');
});
