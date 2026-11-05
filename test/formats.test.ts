import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importRoute, exportRoute, type ExportFormat } from '../src/lib/formats';
import { computePlan } from '../src/lib/model';
import { parseCoord, findPosition, fmtLat, fmtLon } from '../src/lib/format';

const enc = (s: string) => new TextEncoder().encode(s);
const fixture = readFileSync(new URL('./fixtures/made-up-furuno-style.rtz', import.meta.url));

test('coordinate parsing covers common mariner styles', () => {
    const lat = 16 + 13.842 / 60;
    for (const s of ["16°13.842'N", '16 13.842 N', '16-13.842N', 'N16 13.842', '1613.842N', '16.2307']) {
        const v = parseCoord(s, 'lat');
        assert.ok(v != null && Math.abs(v - (s === '16.2307' ? 16.2307 : lat)) < 1e-9, s + ' -> ' + v);
    }
    assert.ok(Math.abs((parseCoord("061°32.553'W", 'lon') as number) + (61 + 32.553 / 60)) < 1e-9);
    assert.ok(Math.abs((parseCoord('06132.553W', 'lon') as number) + (61 + 32.553 / 60)) < 1e-9);
    assert.ok(Math.abs((parseCoord('16°13\'50.5"S', 'lat') as number) + (16 + 13 / 60 + 50.5 / 3600)) < 1e-9);
    assert.equal(parseCoord('95 00 N', 'lat'), null);
    assert.equal(fmtLat(lat), "16°13.842'N");
    assert.equal(fmtLon(-(61 + 32.553 / 60)), "061°32.553'W");
    const p = findPosition("3  PILOT STN  16°08.508'N  061°29.953'W");
    assert.ok(p && Math.abs(p.lat - 16.1418) < 1e-4 && Math.abs(p.lon + 61.49922) < 1e-4);
});

test('every export format reads back to the same positions', () => {
    const r = importRoute('made-up.rtz', fixture);
    r.etd = Date.UTC(2026, 9, 12, 6, 0);
    const plan = computePlan(r);
    for (const f of ['rtz', 'rt3', 'gpx', 'csv', 'xlsx', 'txt'] as ExportFormat[]) {
        const out = exportRoute(f, r, plan);
        const data = typeof out.data === 'string' ? enc(out.data) : out.data;
        const back = importRoute(out.name, data);
        assert.equal(back.waypoints.length, r.waypoints.length, f);
        back.waypoints.forEach((w, i) => {
            const tol = f === 'txt' || f === 'csv' || f === 'xlsx' ? 0.00002 : 1e-6; // 0.001' in text
            assert.ok(Math.abs(w.lat - r.waypoints[i].lat) < tol && Math.abs(w.lon - r.waypoints[i].lon) < tol, `${f} wp${i + 1}`);
        });
        if (f !== 'gpx' && f !== 'txt') {
            assert.deepEqual(back.waypoints.slice(1).map(w => w.legType), r.waypoints.slice(1).map(w => w.legType), f + ' leg types');
        }
        if (f === 'txt' || f === 'csv') {
            assert.equal(back.waypoints[0].name, 'TEST ALPHA', f + ' name');
        }
    }
});

test('CSV with split degree/minute columns and semicolons', () => {
    const csv = 'No;Name;Lat deg;Lat min;N/S;Lon deg;Lon min;E/W;Sailing\n1;A;16;13.842;N;061;32.553;W;\n2;B;16;08.508;N;061;29.953;W;GC\n';
    const r = importRoute('x.csv', enc(csv));
    assert.equal(r.waypoints.length, 2);
    assert.ok(Math.abs(r.waypoints[1].lon + (61 + 29.953 / 60)) < 1e-9);
    assert.equal(r.waypoints[1].legType, 'GC');
});

test('free text, one waypoint per line', () => {
    const txt = "WP1 Start 20 00.0N 040 00.0W\nWP2  20 30.0 N  038 00.0 W\n\nsome note\n";
    const r = importRoute('x.txt', enc(txt));
    assert.equal(r.waypoints.length, 2);
    assert.equal(r.waypoints[1].lon, -38);
});

test('plain-language errors', () => {
    assert.throws(() => importRoute('x.csv', enc('a,b\n1,2\n')), /No positions found/);
    assert.throws(() => importRoute('x.rtz', enc('<route><waypoints/></route>')), /no waypoints/);
});
