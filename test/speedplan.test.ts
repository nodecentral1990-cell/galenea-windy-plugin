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

// Course alteration (owner, 2026-11-13): a beam swell between 100 and 200 nm that lasts the whole voyage.
// Speed cannot avoid it; altering course 40° or more puts it on the bow / quarter.
function beamSetup(over: Partial<SpeedPlanInput> = {}): SpeedPlanInput {
    return setup({
        allowStop: false,
        wxAt: (lat, lon) => ({ sw1: lon * 60 >= 100 && lon * 60 <= 200 ? 6 : 1, sw1Dir: 0, lat }) as never,
        hazards: (wx, heading) => {
            const w = wx as { sw1: number; sw1Dir: number };
            const rel = Math.abs(((w.sw1Dir - heading + 540) % 360) - 180); // 0 = on the bow, 90 = beam
            return w.sw1 > 4 && rel > 60 && rel < 120 ? [{ what: 'Swell 1', level: 2, detail: `swell ${w.sw1} m on the beam` }] : [];
        },
        stepH: 3,
        ...over,
    });
}

test('course alteration: speed alone cannot avoid a beam swell; altering course does, and the ship is back on the track to arrive', () => {
    const speedOnly = speedPlan(beamSetup());
    assert.equal(speedOnly.mode, 'soft', 'speed only cannot avoid it');
    const t0 = Date.now();
    const r = speedPlan(beamSetup({ alterations: [20, 40, 60], maxOffNm: 80 }));
    const ms = Date.now() - t0;
    assert.equal(r.ok, true);
    assert.equal(r.mode, 'hard', 'altering course keeps out of it: ' + r.notes.join(' '));
    assert.equal(r.safe!.badH, 0);
    const alt = r.segments.filter(g => g.alter !== 0);
    assert.ok(alt.length >= 1, 'alters course');
    assert.ok(alt.every(g => Math.abs(g.alter) >= 40), 'only alterations that take the swell off the beam inside the area');
    assert.ok(Math.abs(r.segments[r.segments.length - 1].offTo) < 2.5, 'back on the track at the end');
    assert.ok(r.segments.every(g => Math.abs(g.offFrom) <= 80 + 1e-6 && Math.abs(g.offTo) <= 80 + 1e-6), 'within the limit off the track');
    assert.ok(alt.some(g => /Alter course \d+° to (starboard|port)/.test(g.why) && /swell 6 m on the beam/.test(g.why)), 'reason: ' + r.segments.map(g => g.why).join(' | '));
    assert.ok(r.notes.some(n => /nearest forecast point/.test(n)), 'honest note about off-track weather');
    assert.ok(ms < 8000, `fast enough (${ms} ms)`);
});

test('course alteration: not used when nothing is met (stays on the track)', () => {
    const r = speedPlan(beamSetup({ alterations: [20, 40, 60], wxAt: () => ({ sw1: 1, sw1Dir: 0 }) as never }));
    assert.ok(r.segments.every(g => g.alter === 0 && Math.abs(g.offTo) < 0.01));
});

test('course alteration: never where the ship may not be (land on the starboard side)', () => {
    const r = speedPlan(beamSetup({ alterations: [20, 40, 60], canBeAt: lat => lat > -0.05 })); // starboard of an eastbound track = south: land there
    assert.ok(r.segments.every(g => g.offFrom <= 0.01 && g.offTo <= 0.01), 'only to port');
});

test('taking a plan with a course alteration: off-track waypoints, rejoin, planned waypoints inside the detour left out', () => {
    const r = newRoute('t');
    r.etd = T0;
    r.waypoints = [newWaypoint(0, 0, 'RL', 'A'), newWaypoint(0, 2.5, 'RL', 'M'), newWaypoint(0, 5, 'RL', 'B')]; // 300 nm, M at 150
    const p = computePlan(r);
    const plan = speedPlan({ ...beamSetup({ alterations: [20, 40, 60], maxOffNm: 80 }), track: trackOf(p) });
    assert.equal(plan.mode, 'hard');
    const wps = applySpeedPlan(r, p, plan.segments, 0);
    assert.ok(wps.length > 3, 'waypoints added');
    assert.ok(!wps.some(w => w.name === 'M') || Math.abs(plan.segments.find(g => g.fromNm <= 150 && g.toNm >= 150)!.offFrom) < 1, 'M left out when passed off the track');
    assert.ok(wps.some(w => Math.abs(w.lat) > 0.1), 'an off-track waypoint');
    assert.equal(wps[wps.length - 1].name, 'B', 'ends at the destination');
    assert.ok(wps.some(w => /^(Stbd|Port) \d+°/.test(w.name ?? '')), 'named after the alteration');
    // every leg forward along the track (no zig-zag back)
    for (let i = 1; i < wps.length; i++) assert.ok(wps[i].lon >= wps[i - 1].lon - 1e-6, `leg ${i} goes forward`);
});
