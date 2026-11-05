import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { bvsShipInfo, parseBvs, writeBvs } from '../src/lib/formats/bvs';
import { exportRoute, importRoute } from '../src/lib/formats';
import { computePlan, newRoute, newWaypoint } from '../src/lib/model';

const H = 3600e3;
const fixture = readFileSync(new URL('./fixtures/made-up-bvs.bvs', import.meta.url), 'utf8');

test('BVS: positions, names, leg types, times, speeds, stop', () => {
    const r = importRoute('x.bvs', new TextEncoder().encode(fixture));
    assert.equal(r.source?.format, 'BVS');
    assert.equal(r.name, 'TEST ALPHA TO TEST BRAVO');
    assert.equal(r.waypoints.length, 6);
    assert.equal(r.waypoints[0].name, 'TEST BERTH');
    assert.equal(r.etd, Date.UTC(2026, 10, 1, 0, 0));
    // Navigation is for the leg leaving a position
    assert.deepEqual(r.waypoints.map(w => w.legType), ['RL', 'RL', 'RL', 'GC', 'GC', 'RL']);
    assert.equal(r.defaultSpeed, 6);
    assert.equal(r.waypoints[1].speed, 6);
    assert.equal(r.waypoints[2].speed, 14);
    assert.equal(r.waypoints[4].speed, 15);
    assert.equal(r.waypoints[3].fixedEta, Date.UTC(2026, 10, 3, 0, 0), 'TimeFix in the middle = fixed ETA');
    assert.equal(r.waypoints[4].delayH, 6, 'same place 6 h later = stop');
    const p = computePlan(r);
    assert.equal(p.legs[2].arriveMs, Date.UTC(2026, 10, 3, 0, 0));
    assert.equal(p.problems.length, 0);
});

test('BVS: ship particulars and IMO warning heights offered', () => {
    const info = bvsShipInfo(parseBvs(fixture))!;
    assert.equal(info.vessel.name, 'TEST SHIP');
    assert.equal(info.vessel.gm, 3);
    assert.equal(info.vessel.rollPeriod, 14);
    assert.equal(info.vessel.draftFwd, 10.8);
    assert.equal(info.vessel.draftAft, 11.2);
    assert.equal(info.resonance.synchronous, 4.5);
});

test('BVS: round trip keeps positions, leg types, fixed times and the ETA', () => {
    const r = parseBvs(fixture);
    const p = computePlan(r);
    const out = exportRoute('bvs', r, p).data as string;
    assert.match(out, /<Voyage dir="AROS">/);
    assert.match(out, /callSign="TEST"/, 'unknown TrackInfo values kept');
    assert.match(out, /Type="BR"[^>]*TimeFix="1"/);
    assert.match(out, /Type="ER"/);
    const r2 = parseBvs(out);
    const p2 = computePlan(r2);
    assert.equal(r2.waypoints.length, r.waypoints.length);
    assert.deepEqual(r2.waypoints.map(w => w.legType), r.waypoints.map(w => w.legType));
    assert.equal(r2.waypoints[3].fixedEta, r.waypoints[3].fixedEta);
    assert.equal(r2.waypoints[4].delayH, 6);
    assert.ok(Math.abs((p2.eta as number) - (p.eta as number)) < 60e3);
});

test('BVS export from another format: a stop becomes a second position; needs an ETD', () => {
    const r = newRoute('Made up');
    r.waypoints = [newWaypoint(0, 0), newWaypoint(0, 1), newWaypoint(0, 2)];
    assert.throws(() => writeBvs(r, computePlan(r)), /ETD/);
    r.etd = Date.UTC(2026, 10, 1);
    r.waypoints[1].delayH = 3;
    const out = writeBvs(r, computePlan(r));
    assert.equal((out.match(/<Position /g) ?? []).length, 4);
    const back = parseBvs(out);
    assert.equal(back.waypoints[1].delayH, 3);
    assert.ok(Math.abs((computePlan(back).eta as number) - (computePlan(r).eta as number)) < 60e3);
});

// Optional check against a real BVS file kept OUTSIDE the repo: REAL_BVS=/path/file.bvs npm test
test('real BVS file (only when REAL_BVS is set)', { skip: !process.env.REAL_BVS || !existsSync(process.env.REAL_BVS) }, () => {
    const txt = readFileSync(process.env.REAL_BVS as string, 'utf8');
    const r = parseBvs(txt);
    const p = computePlan(r);
    assert.equal(p.problems.length, 0);
    const r2 = parseBvs(writeBvs(r, p));
    assert.equal(r2.waypoints.length, r.waypoints.length);
    void H;
});
