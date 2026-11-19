import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moonPhase, moonTimes, sunTimes } from '../src/lib/astro';

const hm = (ms: number | null) => (ms == null ? '—' : new Date(ms).toISOString().slice(11, 16));
const mins = (ms: number | null, h: number, m: number, day: number) => Math.abs(((ms ?? 0) - (day + (h * 60 + m) * 60e3)) / 60e3);

test('sun: Greenwich at midsummer 2026 rises about 03:43 and sets about 20:21 UTC', () => {
    const d = Date.UTC(2026, 5, 21);
    const s = sunTimes(d, 51.4779, 0);
    assert.ok(mins(s.rise, 3, 43, d) <= 3, 'rise ' + hm(s.rise));
    assert.ok(mins(s.set, 20, 21, d) <= 3, 'set ' + hm(s.set));
});

test('sun: equator at the March equinox, about 12 h of daylight around 12:07 UTC', () => {
    const d = Date.UTC(2026, 2, 20);
    const s = sunTimes(d, 0, 0);
    const noon = ((s.rise as number) + (s.set as number)) / 2;
    assert.ok(mins(noon, 12, 7, d) <= 3, 'noon ' + hm(noon));
    assert.ok(Math.abs(((s.set as number) - (s.rise as number)) / 3600e3 - 12.1) < 0.1);
});

test('sun: midnight sun and polar night', () => {
    assert.equal(sunTimes(Date.UTC(2026, 5, 21), 78, 15).alwaysUp, true);
    assert.equal(sunTimes(Date.UTC(2026, 11, 21), 78, 15).alwaysDown, true);
});

test('moon: full at the total lunar eclipse of 3 Mar 2026, new at the solar eclipse of 12 Aug 2026', () => {
    assert.ok(moonPhase(Date.UTC(2026, 2, 3, 11, 30)).fraction > 0.99);
    assert.ok(moonPhase(Date.UTC(2026, 7, 12, 17, 30)).fraction < 0.01);
    assert.equal(moonPhase(Date.UTC(2026, 2, 3, 11, 30)).name, 'Full moon');
});

test('moon: rises and sets, about 50 min later each day; full moon rises near sunset', () => {
    const lat = 51.5;
    const lon = 0;
    let prev: number | null = null;
    let n = 0;
    for (let k = 0; k < 6; k++) {
        const d = Date.UTC(2026, 9, 1 + k);
        const m = moonTimes(d, lat, lon);
        if (m.rise != null && prev != null) {
            const lag = ((m.rise - prev) / 60e3) - 24 * 60;
            assert.ok(lag > 10 && lag < 110, `daily delay ${lag.toFixed(0)} min`);
            n++;
        }
        prev = m.rise;
    }
    assert.ok(n >= 3);
    const d = Date.UTC(2026, 2, 3);
    const mr = moonTimes(d, lat, lon).rise as number;
    const ss = sunTimes(d, lat, lon).set as number;
    assert.ok(Math.abs(mr - ss) < 1.5 * 3600e3, `full moon rise ${hm(mr)} near sunset ${hm(ss)}`);
});
