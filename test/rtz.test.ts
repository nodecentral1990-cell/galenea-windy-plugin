import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseRtz, writeRtz } from '../src/lib/formats/rtz';
import { computePlan, positionAt, shipPositions } from '../src/lib/model';

const fixture = readFileSync(new URL('./fixtures/made-up-furuno-style.rtz', import.meta.url), 'utf8');

test('reads the made-up Furuno-style RTZ', () => {
    const r = parseRtz(fixture);
    assert.equal(r.name, 'TEST ALPHA to TEST BRAVO');
    assert.equal(r.waypoints.length, 4);
    assert.deepEqual(r.waypoints.map(w => w.legType), ['RL', 'RL', 'GC', 'RL']);
    assert.deepEqual(r.waypoints.map(w => w.speed), [null, 12, 11, 10]);
    assert.deepEqual(r.waypoints.map(w => w.zoneMin), [-180, -180, -60, 0]);
    assert.equal(r.waypoints[1].xtdPort, 0.5);
});

test('plan: distances and ETA match the earlier check', () => {
    const r = parseRtz(fixture);
    r.etd = Date.UTC(2026, 9, 12, 6, 0);
    const p = computePlan(r);
    assert.ok(Math.abs(p.totalNm - 1657.4) < 0.1, String(p.totalNm));
    assert.ok(Math.abs(p.totalHours - 152.1) < 0.1, String(p.totalHours));
    const pos = positionAt(r, p, r.etd + 9.7265 * 3600e3);
    assert.ok(pos && Math.abs(pos.lat - 20.5) < 0.01 && Math.abs(pos.lon + 38) < 0.01);
    const ships = shipPositions(r, p, 24);
    assert.equal(ships.length, Math.ceil(p.totalHours / 24) + 1);
});

test('eta mode gives the required speed', () => {
    const r = parseRtz(fixture);
    r.etd = Date.UTC(2026, 9, 12, 6, 0);
    r.eta = r.etd + 150 * 3600e3;
    r.mode = 'eta';
    const p = computePlan(r);
    assert.ok(p.requiredSog && Math.abs(p.requiredSog - p.totalNm / 150) < 1e-9);
    assert.ok(p.eta && Math.abs(p.eta - r.eta) < 1000);
});

test('slip from RPM and pitch', () => {
    const r = parseRtz(fixture);
    r.waypoints[1].rpm = 80;
    r.waypoints[1].allowance = 0.5;
    const p = computePlan(r, { pitch: 6, name: '', lbp: null, loa: null, breadth: null, draftFwd: null, draftAft: null, gm: null, rollPeriod: null });
    const eng = (6 * 80 * 60) / 1852;
    assert.ok(Math.abs((p.legs[0].engineSpeed ?? 0) - eng) < 1e-9);
    assert.ok(Math.abs((p.legs[0].slipPct ?? 0) - ((eng - 11.5) / eng) * 100) < 1e-9);
});

test('round trip keeps Furuno extensions, leg data and spelling', () => {
    const r = parseRtz(fixture);
    r.etd = Date.UTC(2026, 9, 12, 6, 0);
    const p = computePlan(r);
    const out = writeRtz(r, { sog: [null, ...p.legs.map(l => l.sog)], etd: p.etd, eta: p.eta });
    assert.match(out, /manufacturer="Furuno"/);
    assert.match(out, /localtime="-60"/);
    assert.match(out, /<sheduleElement waypointId="2" speed="12.000000"\/>/);
    assert.match(out, /etd="2026-10-12T06:00:00Z"/);
    assert.match(out, /draughtAft="9.500000"/);
    const again = parseRtz(out);
    assert.deepEqual(again.waypoints.map(w => [w.lat, w.lon, w.legType, w.speed, w.zoneMin]), r.waypoints.map(w => [w.lat, w.lon, w.legType, w.speed, w.zoneMin]));
    assert.equal(again.etd, r.etd);
});

const real = process.env.REAL_RTZ;
test('real Furuno file (only when REAL_RTZ is set; not in the repo)', { skip: !real || !existsSync(real) }, () => {
    const r = parseRtz(readFileSync(real as string, 'utf8'));
    const p = computePlan(r);
    assert.equal(r.waypoints.length, 37);
    assert.ok(Math.abs(p.totalNm - 3704.8) < 0.1, String(p.totalNm));
    const again = parseRtz(writeRtz(r, { sog: [null, ...p.legs.map(l => l.sog)] }));
    assert.equal(again.waypoints.length, 37);
    assert.ok(Math.abs(computePlan(again).totalNm - p.totalNm) < 1e-6);
});
