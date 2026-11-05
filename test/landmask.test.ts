import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLand, makeIsWater } from '../src/lib/landMask';

test('land mask: well-known land and sea positions (Natural Earth 1:10m, 0.1°)', () => {
    const land: [string, number, number][] = [
        ['Paris', 48.86, 2.35],
        ['Sahara', 23, 10],
        ['Kansas', 38.5, -98],
        ['Central Australia', -25, 134],
        ['Antarctica', -80, 0],
        ['Greenland ice', 72, -40],
        ['Madagascar', -19, 46.8],
        ['Iceland', 64.9, -18.5],
    ];
    const sea: [string, number, number][] = [
        ['Mid-Atlantic', 30, -40],
        ['North Pacific', 30, -160],
        ['Bay of Biscay', 45.5, -5],
        ['Indian Ocean', -20, 80],
        ['English Channel mid', 50.2, -1.5],
        ['Strait of Gibraltar', 35.95, -5.6],
        ['Pacific at the date line', 0, 180],
        ['Pacific just west of the date line', 0, -179.95],
    ];
    for (const [n, lat, lon] of land) assert.equal(isLand(lat, lon), true, n);
    for (const [n, lat, lon] of sea) assert.equal(isLand(lat, lon), false, n);
});

test('water check keeps the stretch end points usable even close to the coast', () => {
    const marseilleQuay = { lat: 43.3, lon: 5.37 };
    assert.equal(isLand(marseilleQuay.lat, marseilleQuay.lon), true, 'quay square counts as land on the coarse map');
    assert.equal(makeIsWater([marseilleQuay])(43.3, 5.37), true);
    assert.equal(makeIsWater([marseilleQuay])(48.86, 2.35), false, 'Paris still land');
});
