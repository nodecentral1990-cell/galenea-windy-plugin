import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlace, feelsLikeC, marineFromJson, weatherWords } from '../src/lib/placeWx';
import { tideTurns } from '../src/lib/tides';

const H = 3600_000;
const D0 = Date.UTC(2026, 10, 14);

test('tides: high and low waters from hourly heights, time and height refined', () => {
    // semi-diurnal tide, 12.42 h period, 2 m amplitude, high water at 03:00 + n·12.42 h
    const ts: number[] = [];
    const h: number[] = [];
    for (let t = D0; t < D0 + 3 * 86400e3; t += H) {
        ts.push(t);
        h.push(2 * Math.cos((2 * Math.PI * (t - D0 - 3 * H)) / (12.42 * H)));
    }
    const turns = tideTurns(ts, h);
    const highs = turns.filter(x => x.kind === 'high');
    const lows = turns.filter(x => x.kind === 'low');
    assert.ok(highs.length >= 5 && lows.length >= 5, `${highs.length} highs, ${lows.length} lows`);
    assert.ok(Math.abs(highs[0].t - (D0 + 3 * H)) < 6 * 60e3, 'first high water near 03:00');
    assert.ok(Math.abs(highs[1].t - (D0 + 3 * H + 12.42 * H)) < 6 * 60e3, 'next one 12 h 25 min later');
    assert.ok(highs.every(x => Math.abs(x.h - 2) < 0.05) && lows.every(x => Math.abs(x.h + 2) < 0.05), 'heights about ±2 m');
    for (let i = 1; i < turns.length; i++) assert.notEqual(turns[i].kind, turns[i - 1].kind, 'high and low alternate');
});

test('feels like: wind chill when cold and windy, heat index when hot and humid, else the air', () => {
    const wc = feelsLikeC(0, 20, 80);
    assert.equal(wc.how, 'wind chill');
    assert.ok(wc.c! < -4 && wc.c! > -9, `0 °C in 20 kn feels ${wc.c!.toFixed(1)}`);
    const hi = feelsLikeC(32, 5, 70);
    assert.equal(hi.how, 'heat index');
    assert.ok(hi.c! > 38 && hi.c! < 45, `32 °C at 70 % feels ${hi.c!.toFixed(1)}`);
    assert.deepEqual(feelsLikeC(18, 10, 60), { c: 18, how: 'air' });
});

test('weather words: from Windy\'s symbol, with windy / gale / storm', () => {
    assert.equal(weatherWords(4, 10, 0).words, 'Cloudy');
    assert.equal(weatherWords(19, 30, 2).words, 'Showers, windy');
    assert.equal(weatherWords(14, 40, 5).words, 'Thunderstorm, gale');
    assert.equal(weatherWords(14, 40, 5).kind, 'thunder');
});

test('Open-Meteo marine answer read, km/h currents turned into knots; tide and current in the hourly rows', () => {
    const ts = Array.from({ length: 48 }, (_, i) => (D0 + i * H) / 1000);
    const m = marineFromJson({
        hourly_units: { ocean_current_velocity: 'km/h', sea_level_height_msl: 'm' },
        hourly: {
            time: ts,
            sea_level_height_msl: ts.map((_, i) => Math.cos((2 * Math.PI * (i - 3)) / 12.42)),
            ocean_current_velocity: ts.map(() => 1.852),
            ocean_current_direction: ts.map(() => 90),
            sea_surface_temperature: ts.map(() => 14.5),
            wind_wave_height: ts.map(() => 1.2),
            wind_wave_period: ts.map(() => 5),
            wind_wave_direction: ts.map(() => 250),
        },
    })!;
    assert.equal(m.curKn[0], 1);
    const p = buildPlace(null, m, 49.5, 0.1, D0, 2);
    assert.equal(p.hours.length, 48);
    assert.equal(p.hours[5].curKn, 1);
    assert.equal(p.hours[5].curSet, 90);
    assert.equal(p.hours[5].sstC, 14.5);
    assert.equal(p.hours[5].sea.h, 1.2);
    assert.equal(p.hours[5].sea.src, 'openmeteo');
    assert.ok(p.hours.some(h => h.turn?.kind === 'high'), 'a high water marked in its hour');
    assert.equal(p.days.length, 2);
    assert.ok(p.days[0].sun.rise != null && p.days[0].sun.set != null, 'sunrise and sunset');
    assert.ok(p.days[0].turns.length >= 3, 'high and low waters of the day');
});

import { writeFileSync } from 'node:fs';
import { portWeatherPdf, tidePdf } from '../src/lib/placePdf';

test('PDF exports: port weather and tides, several pages, place, lat / lon, warnings', () => {
    const ts = Array.from({ length: 7 * 24 + 24 }, (_, i) => D0 - 86400e3 + i * H);
    const m = {
        ts,
        seaLevel: ts.map(t => 1.8 * Math.cos((2 * Math.PI * (t - D0 - 3 * H)) / (12.42 * H))),
        curKn: ts.map(() => 0.8),
        curDir: ts.map(() => 45),
        sstC: ts.map(() => 13.2),
        seaHs: ts.map(() => 0.9),
        seaPer: ts.map(() => 4),
        seaDir: ts.map(() => 270),
    };
    const p = buildPlace(null, m, 49.48, 0.11, D0, 7);
    const data = { point: { lat: 49.48, lon: 0.11, name: 'Le Havre (FR)', nearest: null }, startDay: D0, ...p, tide: { ts: m.ts, h: m.seaLevel }, sources: ['Weather: test data.'] };
    const a = Buffer.from(portWeatherPdf(data)).toString('latin1');
    const b = Buffer.from(tidePdf(data)).toString('latin1');
    for (const s of [a, b]) {
        assert.ok(s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'));
        assert.match(s, /Le Havre/);
        assert.match(s, /mean sea level|MEAN SEA LEVEL/);
    }
    assert.ok(Number(a.match(/\/Count (\d+)/)![1]) >= 4, 'port weather: summary page + hourly pages');
    assert.equal(Number(b.match(/\/Count (\d+)/)![1]), 2);
    if (process.env.PDF_DIR) {
        writeFileSync(`${process.env.PDF_DIR}/port.pdf`, Buffer.from(a, 'latin1'));
        writeFileSync(`${process.env.PDF_DIR}/tide.pdf`, Buffer.from(b, 'latin1'));
    }
});
