import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circlePoints, ringStep } from '../src/lib/rangeRings';
import { sphereNm } from '../src/lib/seaNet';

test('ring spacing follows the map scale (owner examples 10/20/30 … 100/200/300)', () => {
    assert.equal(ringStep(225), 30);
    assert.equal(ringStep(150), 20);
    assert.equal(ringStep(75), 10);
    assert.equal(ringStep(750), 100);
    assert.equal(ringStep(1500), 200);
    assert.ok(ringStep(5) <= 1);
    assert.equal(ringStep(NaN), 10);
});

test('ring points are the right distance from the ship, also near the date line and at high latitude', () => {
    for (const c of [{ lat: 10, lon: 60 }, { lat: 60, lon: 179.5 }, { lat: -45, lon: -179.9 }]) {
        const pts = circlePoints(c, 120);
        for (const [lat, lon] of pts) assert.ok(Math.abs(sphereNm(c, { lat, lon }) - 120) < 0.5);
        for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i][1] - pts[i - 1][1]) < 90, 'no jump across the map');
    }
});
