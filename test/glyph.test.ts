import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barbParts, glyphFor, glyphSvg, MAP_RINGS } from '../src/lib/shipGlyph';
import { encounterOf, fmtTe, WAVE_IDS, WAVE_LABEL, wavesOf } from '../src/lib/weather';
import { defaultThresholds, type WxPoint } from '../src/lib/weather';
import { emptyVessel } from '../src/lib/model';

test('wind barbs: half = 5 kn, full = 10 kn, pennant = 50 kn, rounded to 5 kn', () => {
    assert.deepEqual(barbParts(5), { pennants: 0, full: 0, half: 1, calm: false });
    assert.deepEqual(barbParts(10), { pennants: 0, full: 1, half: 0, calm: false });
    assert.deepEqual(barbParts(15), { pennants: 0, full: 1, half: 1, calm: false });
    assert.deepEqual(barbParts(20), { pennants: 0, full: 2, half: 0, calm: false });
    assert.deepEqual(barbParts(50), { pennants: 1, full: 0, half: 0, calm: false });
    assert.deepEqual(barbParts(65), { pennants: 1, full: 1, half: 1, calm: false });
    assert.deepEqual(barbParts(23), { pennants: 0, full: 2, half: 1, calm: false }, '23 kn rounds to 25');
    assert.equal(barbParts(2).calm, true);
});

const wx = (o: Partial<WxPoint>): WxPoint => ({
    windKn: 20, gustKn: 25, windDir: 0, pressureHpa: 1013, precipMm: 0, fog: false, thunder: false,
    hs: 2, hsDir: 0, hsPeriod: 8, sw1: 1.5, sw1Dir: 300, sw1Period: 10, sw2: 0.5, sw2Dir: 200, sw2Period: 6, seaHs: 1.2, ...o,
});

test('arrows turn amber/red against the limits', () => {
    const th = defaultThresholds();
    th.alert.head.wind = 25;
    th.limit.head.wind = 35;
    const v = emptyVessel();
    assert.equal(glyphFor(wx({ windKn: 20 }), 0, 12, v, th).wind?.level, 0);
    assert.equal(glyphFor(wx({ windKn: 28 }), 0, 12, v, th).wind?.level, 1, 'alert');
    assert.equal(glyphFor(wx({ windKn: 40 }), 0, 12, v, th).wind?.level, 2, 'limit');
    assert.equal(glyphFor(wx({ hs: 4.5, seaHs: 4.2 }), 0, 12, v, th).sea?.level, 2, 'Hs over 4 m turns the sea flag red');
    // Swell from the beam: 4.2 m over the 4 m swell limit
    assert.equal(glyphFor(wx({ sw1: 4.2, sw1Dir: 90 }), 0, 12, v, th).swell?.level, 2);
});

test('an IMO warning on a wave system turns its arrow red', () => {
    const th = defaultThresholds();
    const v = { ...emptyVessel(), lbp: 230, rollPeriod: 20 };
    // Beam swell, ship stopped: TE = TW = 10 s = half the roll period -> parametric roll (swell 4.5 m >= 4 m)
    const g = glyphFor(wx({ sw1: 4.5, sw1Dir: 90, sw1Period: 10 }), 0, 0, v, th);
    assert.equal(g.swell?.level, 2);
});

test('svg: sea and swell flags with plain numbers, wind barbs only', () => {
    const svg = glyphSvg({ swell: { dir: 300, h: 1.5, period: 10, level: 0 }, sea: { dir: 0, h: 2.5, period: 7, level: 2 }, wind: { dir: 45, kn: 65, level: 0 }, imo: false });
    assert.match(svg, />1\.5</);
    assert.match(svg, />2\.5</);
    assert.doesNotMatch(svg, /kt</, 'no wind speed text, barbs only');
    assert.doesNotMatch(svg, /m</, 'no "m" after heights');
    assert.match(svg, /#ff3030/, 'sea flag red');
    assert.equal((svg.match(/<polygon/g) ?? []).length, 3, '2 flags + 1 pennant');
});

test('rings: swell 1 inside, then swell 2, sea, SWH, wind outside, even when all come from the same side', () => {
    const size = 252;
    const c = size / 2;
    const svg = glyphSvg(
        {
            swell: { dir: 0, h: 2, period: 10, level: 0 },
            swell2: { dir: 0, h: 0.8, period: 7, level: 0 },
            sea: { dir: 0, h: 1.5, period: 6, level: 0 },
            swh: { dir: 0, h: 2.6, period: 9, level: 0 },
            wind: { dir: 0, kn: 25, level: 0 },
            imo: false,
        },
        size,
        false,
        { swh: '#b388ff' },
    );
    const polys = [...svg.matchAll(/<polygon points="([^"]+)"/g)].map(m => m[1].split(' ').map(p => p.split(',').map(Number)));
    const radii = (pts: number[][]) => pts.map(([x, y]) => Math.hypot(x - c, y - c));
    const [swell, swell2, sea, swh] = polys.map(radii);
    const inRing = (r: number[], [a, b]: readonly number[]) => Math.min(...r) >= a - 0.2 && Math.max(...r) <= b + 0.7;
    assert.ok(inRing(swell, MAP_RINGS.swell), 'swell 1 flag in the inner ring');
    assert.ok(inRing(swell2, MAP_RINGS.swell2), 'swell 2 flag in the second ring');
    assert.ok(inRing(sea, MAP_RINGS.sea), 'sea flag in the third ring');
    assert.ok(inRing(swh, MAP_RINGS.swh), 'SWH flag in the fourth ring');
    assert.match(svg, /#b388ff/, 'SWH in its own colour');
    const lines = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)].map(m => m.slice(1).map(Number));
    const lineR = lines.flatMap(([x1, y1, x2, y2]) => [Math.hypot(x1 - c, y1 - c), Math.hypot(x2 - c, y2 - c)]);
    assert.ok(lines.length > 0 && Math.min(...lineR) >= MAP_RINGS.wind[0] - 0.2, 'wind barb only in the outer ring');
    assert.ok(MAP_RINGS.wind[1] < size / 2, 'all rings fit the drawing');
    // all north of the ship: they come from the north
    assert.ok(polys.flat().every(([, y]) => y < c));
});

test('the four waves are named the same everywhere; encounter period', () => {
    const w = { hs: 3, hsDir: 0, hsPeriod: 9, seaHs: 2, seaDir: 10, seaPeriod: 6, seaWindy: true, sw1: 2, sw1Dir: 300, sw1Period: 11, sw2: 0.5, sw2Dir: 200, sw2Period: 8 } as never;
    assert.deepEqual(wavesOf(w).map(x => x.label), ['SWH', 'Sea', 'Swell 1', 'Swell 2']);
    assert.deepEqual(WAVE_IDS.map(id => WAVE_LABEL[id]), ['SWH', 'Sea', 'Swell 1', 'Swell 2']);
    // head sea, 15 kn, 9 s: Te = 3T² / (3T + V) = 243 / 42
    assert.ok(Math.abs((encounterOf(9, 0, 0, 15) as number) - 243 / 42) < 1e-9);
    assert.equal(encounterOf(9, 0, 0, 0), 9, 'stopped: the wave period');
    assert.equal(encounterOf(null, 0, 0, 10), null);
    assert.equal(fmtTe(encounterOf(9, 180, 0, 27)), '∞', 'running at the wave speed: never pass');
    const g = glyphFor(w, 0, 10, { ...emptyVessel(), lbp: 200, gm: 2, breadth: 32, draftFwd: 10, draftAft: 10 }, defaultThresholds());
    assert.ok(g.swh && g.sea && g.swell && g.swell2, 'map symbol has all four');
});

test('polar: only real warnings drawn by default; pale zones only when asked', async () => {
    const { dangerZones } = await import('../src/lib/dangerZones');
    const low = wx({ hs: 1, hsDir: 0, hsPeriod: 10, sw1: 0.5, sw1Dir: 90, sw1Period: 12, sw2: null, sw2Dir: null, sw2Period: null });
    const s = defaultThresholds().resonance;
    assert.equal(dangerZones(low, 200, 20, s).runs.length, 0, '1 m sea: nothing drawn (below the warning heights)');
    const pale = dangerZones(low, 200, 20, s, { pale: true });
    assert.ok(pale.runs.length > 0 && pale.runs.every(r => !r.strong), 'pale zones when switched on');
    const high = dangerZones({ ...low, hs: 6 }, 200, 20, s);
    assert.ok(high.runs.length > 0 && high.runs.every(r => r.strong), 'real warnings with 6 m');
    assert.ok(high.causes.parametric?.some(c => c.label === 'SWH' && c.strong), 'cause listed: SWH');
});

test('polar: one colour per warning, two at once marked together, each cell drawn once', async () => {
    const { dangerZones, PHENOMENA } = await import('../src/lib/dangerZones');
    const base = wx({ hs: 6, hsDir: 0, hsPeriod: 10, sw1: 5, sw1Dir: 90, sw1Period: 12, sw2: null, sw2Dir: null, sw2Period: null });
    const z = dangerZones(base, 200, 20, defaultThresholds().resonance);
    // parametric 1:1 and synchronous always come together: drawn as one striped cell, not two overlapping
    assert.ok(z.runs.some(r => r.kinds.includes('parametric') && r.kinds.includes('synchronous')), 'two warnings in one cell');
    for (const r of z.runs) assert.deepEqual(r.kinds, PHENOMENA.filter(k => r.kinds.includes(k)), 'fixed order');
    // no two runs overlap at the same heading: each heading and speed drawn once
    const byH = new Map<number, [number, number][]>();
    for (const r of z.runs) byH.set(r.h, [...(byH.get(r.h) ?? []), [r.v0, r.v1]]);
    for (const [h, list] of byH) {
        list.sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < list.length; i++) assert.ok(list[i][0] >= list[i - 1][1] - 1e-9, `heading ${h}: no overlap`);
    }
});

test('polar switches: only the warnings switched on are drawn', async () => {
    const { dangerZones } = await import('../src/lib/dangerZones');
    const base = wx({ hs: 6, hsDir: 0, hsPeriod: 10, sw1: 0.5, sw1Dir: 90, sw1Period: 12, sw2: null, sw2Dir: null, sw2Period: null });
    const all = dangerZones(base, 200, 20, defaultThresholds().resonance);
    assert.ok(all.causes.parametric && Object.keys(all.causes).length > 1);
    const show = { parametric: false, synchronous: true, highWaves: false, surf: false };
    const some = dangerZones(base, 200, 20, defaultThresholds().resonance, { show });
    assert.deepEqual(Object.keys(some.causes), ['synchronous'], 'only synchronous rolling left');
    assert.ok(some.runs.every(r => r.kinds.join() === 'synchronous'));
    const none = dangerZones(base, 200, 20, defaultThresholds().resonance, { show: { parametric: false, synchronous: false, highWaves: false, surf: false } });
    assert.equal(none.runs.length, 0, 'all off: nothing drawn');
});

test('polar: sector edges found exactly (smooth), not in 0.5 kn steps', async () => {
    const { dangerZones } = await import('../src/lib/dangerZones');
    const { surfRidingSpeed } = await import('../src/lib/circ1228');
    // surf-riding from astern: edge at 1.8√L / cos(180 − α)
    const base = wx({ hs: 6, hsDir: 0, hsPeriod: 10, sw1: null, sw1Dir: null, sw1Period: null, sw2: null, sw2Dir: null, sw2Period: null });
    const z = dangerZones(base, 100, null, defaultThresholds().resonance, { show: { parametric: false, synchronous: false, highWaves: false } });
    const astern = z.runs.filter(r => r.h === 180 && r.kinds.includes('surf')); // waves from N, ship heading S
    const expected = surfRidingSpeed(100, 180) as number;
    assert.ok(astern.length > 0);
    assert.ok(Math.abs(Math.min(...astern.map(r => r.v0)) - expected) < 0.02, `edge ${Math.min(...astern.map(r => r.v0)).toFixed(3)} vs ${expected.toFixed(3)} kn`);
});

test('heading / speed arrow: one shape, tip exactly at the speed on the rings, pointing along the heading', async () => {
    const { arrowPoints } = await import('../src/lib/shipGlyph');
    const R = 100;
    const rad = (v: number) => (v / 25) * R; // as the diagram: 25 kn at the rim
    for (const [hdg, kn] of [[0, 10], [75, 10.9], [214, 17.9], [300, 3]] as const) {
        const pts = arrowPoints(150, 150, hdg, 0, rad(kn), 2, 11, 6);
        const tip = pts.reduce((a, b) => (Math.hypot(b[0] - 150, b[1] - 150) > Math.hypot(a[0] - 150, a[1] - 150) ? b : a));
        const dist = Math.hypot(tip[0] - 150, tip[1] - 150);
        assert.ok(Math.abs(dist - rad(kn)) < 1e-6, `tip at ${kn} kn: ${dist.toFixed(2)} px vs ${rad(kn).toFixed(2)}`);
        const brg = ((Math.atan2(tip[0] - 150, -(tip[1] - 150)) * 180) / Math.PI + 360) % 360;
        assert.ok(Math.abs(((brg - hdg + 540) % 360) - 180) < 1e-6, `points at ${hdg}°: ${brg.toFixed(2)}`);
        // nothing reaches beyond the tip (no line sticking out past the head)
        const others = pts.filter(p => p !== tip).map(p => Math.hypot(p[0] - 150, p[1] - 150));
        assert.ok(Math.max(...others) < dist, 'tip is the farthest point');
    }
});
