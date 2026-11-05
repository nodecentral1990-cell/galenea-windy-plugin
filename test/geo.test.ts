import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as gl from 'geographiclib-geodesic';
const { Geodesic } = ((gl as unknown as { default?: typeof gl }).default ?? gl);
import { rhumbInverse, rhumbDirect, legGeometry, legPolyline, meridianArc } from '../src/lib/geo';

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);

test('meridian arc series matches numeric integration', () => {
    const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f);
    for (const deg of [10, 45, 60, 80]) {
        const p = (deg * Math.PI) / 180, n = 2000, h = p / n;
        let s = 0;
        for (let i = 0; i <= n; i++) {
            const x = i * h, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
            s += w * Math.pow(1 - e2 * Math.sin(x) ** 2, -1.5);
        }
        near(meridianArc(p), (a * (1 - e2) * s * h) / 3, 0.01, `lat ${deg}`);
    }
});

test('rhumb line equals geodesic along a meridian and the equator', () => {
    const g = Geodesic.WGS84;
    const m = rhumbInverse({ lat: 10, lon: 20 }, { lat: 50, lon: 20 });
    near(m.distNm, (g.Inverse(10, 20, 50, 20).s12 as number) / 1852, 1e-6, 'meridian');
    near(m.course, 0, 1e-9);
    const e = rhumbInverse({ lat: 0, lon: 0 }, { lat: 0, lon: 30 });
    near(e.distNm, (g.Inverse(0, 0, 0, 30).s12 as number) / 1852, 1e-6, 'equator');
    near(e.course, 90, 1e-9);
});

test('rhumb direct inverts rhumb inverse, including across the date line', () => {
    const cases = [
        [{ lat: 16.23, lon: -61.54 }, { lat: 47.25, lon: -12.46 }],
        [{ lat: 35, lon: 170 }, { lat: 40, lon: -160 }],
        [{ lat: -33.9, lon: 18.4 }, { lat: -34.5, lon: 115.0 }],
    ];
    for (const [a, b] of cases) {
        const inv = rhumbInverse(a, b);
        const p = rhumbDirect(a, inv.course, inv.distNm);
        near(p.lat, b.lat, 1e-7);
        near(((p.lon - b.lon + 540) % 360) - 180, 0, 1e-7);
    }
    near(rhumbInverse({ lat: 35, lon: 170 }, { lat: 40, lon: -160 }).course, 79, 2, 'east across 180');
});

test('GC is never longer than RL and points lie on the leg', () => {
    const a = { lat: 16.281167, lon: -60.72985 }, b = { lat: 47.2509, lon: -12.463939 };
    const gc = legGeometry(a, b, 'GC'), rl = legGeometry(a, b, 'RL');
    near(gc.distNm, 3017.02, 0.05, 'GC dist');
    near(rl.distNm, 3044.54, 0.05, 'RL dist');
    const end = gc.pointAt(gc.distNm);
    near(end.lat, b.lat, 1e-6);
    near(end.lon, b.lon, 1e-6);
});

test('polyline keeps longitudes continuous across 180', () => {
    const pts = legPolyline({ lat: 35, lon: 170 }, { lat: 40, lon: -160 }, 'GC', 50);
    for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i][1] - pts[i - 1][1]) < 5);
    near(pts[pts.length - 1][1], 200, 1e-6);
});
