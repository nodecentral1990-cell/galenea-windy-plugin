// The extra route formats (2026-11-26): KML, JRC route sheet, Furuno RTZ 1.0, RTZ 1.1, RTZ container, NMEA 0183.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importRoute, exportRoute, type ExportFormat } from '../src/lib/formats';
import { computePlan } from '../src/lib/model';

const fixture = readFileSync(new URL('./fixtures/made-up-furuno-style.rtz', import.meta.url));
const base = importRoute('made-up.rtz', fixture);
base.waypoints[1].legType = 'GC';
base.waypoints[1].speed = 14.5;
const plan = computePlan(base);
const bytes = (d: string | Uint8Array) => (typeof d === 'string' ? new TextEncoder().encode(d) : d);

for (const f of ['kml', 'jrc', 'furuno', 'rtz11', 'rtzp', 'nmea'] as ExportFormat[]) {
    test(`${f}: saved and opened again gives the same waypoints`, () => {
        const out = exportRoute(f, base, plan);
        const back = importRoute(out.name, bytes(out.data));
        assert.equal(back.waypoints.length, base.waypoints.length);
        base.waypoints.forEach((w, i) => {
            // positions to 0.001' (JRC / NMEA write minutes with 3 decimals)
            assert.ok(Math.abs(back.waypoints[i].lat - w.lat) < 2e-5 && Math.abs(back.waypoints[i].lon - w.lon) < 2e-5, `${f} wp ${i + 1}`);
        });
    });
}

test('JRC route sheet: layout, leg values and rate of turn', () => {
    const t = String(exportRoute('jrc', base, plan).data);
    const lines = t.split('\r\n');
    assert.match(lines[0], /^\/\/ ROUTE SHEET exported by JRC ECDIS\./);
    assert.match(lines[4], /^000,\d\d,\d\d\.\d{3},[NS],\d{3},\d\d\.\d{3},[EW],\*\*\*/);
    const c = lines[5].split(',');
    assert.equal(c[11], 'GC');
    assert.equal(c[10], '014.5');
    const r = Number(c[13]);
    assert.ok(Math.abs(Number(c[12]) - (14.5 / r) * (180 / Math.PI) / 60) < 0.01, 'rate of turn from speed and radius');
    const back = importRoute('x.csv', bytes(t));
    assert.equal(back.waypoints[1].legType, 'GC');
    assert.equal(back.waypoints[1].speed, 14.5);
});

test('NMEA 0183: checksums, sentence length, order from RTE', () => {
    const t = String(exportRoute('nmea', base, plan).data);
    for (const l of t.trim().split('\r\n')) {
        const m = l.match(/^\$(.*)\*([0-9A-F]{2})$/);
        assert.ok(m, l);
        let c = 0;
        for (const ch of m![1]) c ^= ch.charCodeAt(0);
        assert.equal(c.toString(16).toUpperCase().padStart(2, '0'), m![2], 'checksum ' + l);
        assert.ok(l.length <= 82, 'NMEA sentences are at most 82 characters: ' + l.length);
    }
    // waypoints listed out of order, the route sentence gives the order
    const mixed = '$GPWPL,1000.000,N,02000.000,W,B*00\r\n$GPWPL,1100.000,N,02100.000,W,A*00\r\n$GPRTE,1,1,c,TEST,A,B*00\r\n';
    const r = importRoute('t.nmea', bytes(mixed));
    assert.deepEqual(r.waypoints.map(w => w.name), ['A', 'B']);
    assert.ok(Math.abs(r.waypoints[0].lon + 21) < 1e-9);
});

test('KML from Google Earth: points only, or a line with named points', () => {
    const pts = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Test</name>
<Placemark><name>Start</name><Point><coordinates>-61.5,16.2,0</coordinates></Point></Placemark>
<Placemark><name>End</name><Point><coordinates>2.3,51.05,0</coordinates></Point></Placemark></Document></kml>`;
    const r = importRoute('t.kml', bytes(pts));
    assert.deepEqual(r.waypoints.map(w => w.name), ['Start', 'End']);
    assert.equal(r.name, 'Test');
});

test('RTZ 1.1 and Furuno: right version and namespace', () => {
    assert.match(String(exportRoute('rtz11', base, plan).data), /<route version="1\.1" xmlns="http:\/\/www\.cirm\.org\/RTZ\/1\/1"/);
    const fu = String(exportRoute('furuno', base, plan).data);
    assert.match(fu, /<route version="1\.0" xmlns="http:\/\/www\.cirm\.org\/RTZ\/1\/0"/);
    assert.match(fu, /manufacturer="Furuno"/);
    assert.match(fu, /geometryType="Orthodrome" speedMax="14\.500000"/);
});
