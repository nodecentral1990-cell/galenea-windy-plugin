import { test } from 'node:test';
import assert from 'node:assert/strict';
import { farFromLand, speedOptions, speedPlan, type SpeedPlanInput } from '../src/lib/speedPlan';
import { emptyVessel } from '../src/lib/model';

const H = 3600_000;
const T0 = Date.UTC(2026, 10, 1, 0, 0);

// 300 nm due east along the equator; a 6 m swell sits between 150 and 210 nm from 10 h to 22 h
function setup(over: Partial<SpeedPlanInput> = {}): SpeedPlanInput {
    const opts = [6, 8, 10, 12, 14].map(v => ({ sicw: v, rpm: v * 5, fuelPerDay: Math.pow(v / 10, 3) * 30 }));
    return {
        track: { totalNm: 300, at: s => ({ lat: 0, lon: s / 60, course: 90 }) },
        startNm: 0,
        startMs: T0,
        arriveBy: null,
        plannedSicwAt: () => 12,
        options: opts,
        allowStop: true,
        stopFuelPerDay: null,
        wxAt: (lat, lon, t) => {
            const h = (t - T0) / H;
            const storm = lon * 60 >= 150 && lon * 60 <= 210 && h >= 10 && h < 22;
            return { sw1: storm ? 6 : 1, sw1Dir: 0 } as never;
        },
        lossKn: () => 0,
        hazards: wx => ((wx as { sw1: number }).sw1 > 4 ? [{ what: 'Swell 1', level: 2, detail: `swell ${(wx as { sw1: number }).sw1} m on the beam` }] : []),
        avoidLevel: 2,
        stepH: 1,
        ...over,
    };
}

test('speed plan: waits or slows so the swell passes, never meets it; the planned speed would', () => {
    const r = speedPlan(setup());
    assert.equal(r.ok, true);
    assert.equal(r.mode, 'hard');
    assert.ok(r.planned.badH > 0, 'planned 12 kn meets the swell');
    assert.equal(r.planned.events.length, 1);
    assert.equal(r.safe!.badH, 0, 'safe plan never inside the limit');
    assert.ok(r.segments.some(s => s.action === 'stop' || s.sicw < 12), 'stops or slows');
    // the swell area must be entered after it has gone (22 h)
    const inArea = r.segments.filter(s => s.action === 'go' && s.toNm > 156 && s.fromNm < 204); // 5 nm weather cells
    for (const s of inArea) assert.ok(s.toMs >= T0 + 22 * H - 1, 'in the swell area only after 22 h');
    assert.ok(r.segments.every(s => s.action === 'stop' || [6, 8, 10, 12, 14].includes(s.sicw)), 'only speeds from the table');
    assert.ok(r.segments.some(s => /would meet swell 6 m/.test(s.why)), 'reason names the swell avoided: ' + r.segments.map(s => s.why).join(' | '));
});

test('speed plan: without stops allowed it slows down; arrive-by too early → earliest safe arrival + note', () => {
    const r = speedPlan(setup({ allowStop: false, arriveBy: T0 + 25 * H }));
    assert.equal(r.safe!.badH, 0);
    assert.ok(r.segments.every(s => s.action === 'go'));
    assert.ok(r.safe!.eta > T0 + 26 * H);
    assert.ok(r.notes.some(n => /Cannot arrive by/.test(n)));
});

test('speed plan: calm weather → planned-like speed, arrives by the wanted time with least fuel', () => {
    const r = speedPlan(setup({ wxAt: () => ({ sw1: 1, sw1Dir: 0 }) as never, arriveBy: T0 + 30 * H }));
    assert.equal(r.planned.badH, 0);
    assert.ok(r.safe!.eta <= T0 + 31 * H);
    assert.ok(r.safe!.fuel < r.planned.fuel, 'slower within the time allowed uses less fuel');
});

test('speed plan: unavoidable → soft plan with the fewest hours inside, and a note', () => {
    const r = speedPlan(setup({ wxAt: (lat, lon) => ({ sw1: lon * 60 > 100 && lon * 60 < 140 ? 6 : 1, sw1Dir: 0 }) as never }));
    assert.equal(r.mode, 'soft');
    assert.ok(r.notes.some(n => /fewest hours/.test(n)));
    assert.ok(r.safe!.badH <= r.planned.badH + 1e-9, 'not worse than planned');
});

test('speed options leave out barred RPM; stop only far from land', () => {
    const v = { ...emptyVessel(), speedTable: [{ rpm: 40, sicw: 8, fuel: 15 }, { rpm: 60, sicw: 12, fuel: 30 }, { rpm: 80, sicw: 16, fuel: 60 }], barredRpm: [{ from: 52, to: 58, why: 'critical' }] };
    const { options, barredLeftOut } = speedOptions(v, 12);
    assert.ok(barredLeftOut > 0);
    assert.ok(options.every(o => o.rpm == null || o.rpm < 52 || o.rpm > 58), 'no barred RPM offered');
    assert.equal(options[options.length - 1].sicw, 16, 'top speed from the table');
    const land = (lat: number, lon: number) => lon > 10;
    assert.equal(farFromLand(0, 9, 30, land), true);
    assert.equal(farFromLand(0, 9.8, 30, land), false);
});

import { applySpeedPlan, trackOf } from '../src/lib/speedPlan';
import { computePlan, newRoute, newWaypoint } from '../src/lib/model';

test('taking the plan: waypoints where the speed changes, leg speeds and a stop', () => {
    const r = newRoute('t');
    r.etd = T0;
    r.waypoints = [newWaypoint(0, 0, 'RL', 'A'), newWaypoint(0, 5, 'RL', 'B')]; // 300 nm
    r.waypoints[1].delayH = 4; // planned stop at the end is cleared
    const p = computePlan(r);
    const tr = trackOf(p);
    assert.ok(Math.abs(tr.at(150).lon - 2.5) < 0.01);
    const seg = (action: 'go' | 'stop', sicw: number, a: number, b: number, h0: number, h1: number) =>
        ({ action, sicw, rpm: sicw ? sicw * 5 : null, fromNm: a, toNm: b, fromMs: T0 + h0 * H, toMs: T0 + h1 * H, from: tr.at(a), to: tr.at(b), fuel: 0, badH: 0, plannedSicw: 12, why: '' }) as const;
    const wps = applySpeedPlan(r, p, [seg('go', 10, 0, 100, 0, 10), seg('stop', 0, 100, 100, 10, 16), seg('go', 14, 100, 300, 16, 30.3)], 0);
    assert.equal(wps.length, 3, 'one waypoint added at 100 nm');
    assert.ok(Math.abs(wps[1].lon - 100 / 60) < 0.01);
    assert.equal(wps[1].speed, 10);
    assert.equal(wps[1].delayH, 6, 'stop of 6 h at the new waypoint');
    assert.equal(wps[2].speed, 14);
    assert.equal(wps[2].delayH, null, 'old planned stop cleared');
    assert.equal(wps[1].name, 'Wait 6 h');
});
