import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isolines, levelsFor, refine, type Grid2D } from '../src/lib/contours';
import { bandColor, defaultWaveColors, layerOfOverlay, PALETTES, waveGradient } from '../src/lib/waveColors';

// A round "storm" of waves: height = 6 − distance from (10°N, 20°W) in degrees
const storm = (): Grid2D => {
    const values: number[][] = [];
    for (let r = 0; r <= 10; r++) {
        const row: number[] = [];
        for (let c = 0; c <= 10; c++) row.push(6 - Math.hypot(r - 5, c - 5));
        values.push(row);
    }
    return { lat0: 5, lon0: -25, dLat: 1, dLon: 1, values };
};

test('lines of equal height: a closed ring round the storm, at the right distance', () => {
    const lines = isolines(storm(), 4);
    assert.equal(lines.length, 1, 'one line');
    const l = lines[0];
    const closed = Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]) < 1e-6;
    assert.ok(closed, 'the ring closes');
    for (const [lat, lon] of l) assert.ok(Math.abs(Math.hypot(lat - 10, lon + 20) - 2) < 0.1, `on the 4 m ring: ${lat}, ${lon}`);
});

test('refining keeps the values at the grid nodes; no line through missing values', () => {
    const g = storm();
    const f = refine(g, 3);
    assert.equal(f.values.length, 31);
    assert.equal(f.values[15][15], g.values[5][5]);
    g.values[5][5] = NaN;
    assert.equal(isolines(g, 5.5).length, 0, 'the peak cell has no value: no line there');
});

test('levels every step from the minimum to the highest value', () => {
    assert.deepEqual(levelsFor(storm(), 2, 1), [2, 3, 4, 5, 6]);
    assert.deepEqual(levelsFor(storm(), 4.2, 0.5), [4.5, 5, 5.5, 6]);
});

test('colour scale: white below the minimum, flat bands, light to dark', () => {
    const s = { ...defaultWaveColors(), min: { hs: 2, sea: 1, swell: 1.5 }, step: 0.5 as const };
    const g = waveGradient('hs', s);
    assert.deepEqual(g[0], [0, [255, 255, 255, 255]]);
    assert.deepEqual(g[1][1], [255, 255, 255, 255]);
    assert.ok(g[1][0] < 2 && g[2][0] === 2, 'first colour starts at the minimum');
    assert.deepEqual(g[2][1], g[3][1], 'flat inside a band');
    assert.ok(Math.abs(g[3][0] - 2.5) < 0.01);
    const lum = (c: number[]) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    for (const p of PALETTES) assert.ok(lum(bandColor(p, 0, 10)) > lum(bandColor(p, 9, 10)), `${p.label}: lightest first`);
    assert.equal(layerOfOverlay('wwaves'), 'sea');
    assert.equal(layerOfOverlay('swell1'), 'swell');
    assert.equal(layerOfOverlay('wind'), null);
});

test('smooth lines: curved refinement keeps grid values; corner cutting rounds a square', async () => {
    const { refineSmooth, smoothLine } = await import('../src/lib/contours');
    const g = storm();
    const f = refineSmooth(g, 4);
    assert.equal(f.values.length, 41);
    assert.ok(Math.abs(f.values[20][20] - g.values[5][5]) < 1e-9, 'grid node value kept');
    // on a coarse grid the 4 m ring stays close to a circle of radius 2
    const ring = isolines(f, 4)[0].map(([lat, lon]) => Math.hypot(lat - 10, lon + 20));
    assert.ok(Math.max(...ring) - Math.min(...ring) < 0.12, `round: radius ${Math.min(...ring).toFixed(2)}–${Math.max(...ring).toFixed(2)}`);
    const sq: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
    const s = smoothLine(sq, 3);
    assert.ok(s.length > 20 && Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]) < 1e-9, 'stays closed');
    assert.ok(!s.some(([a, b]) => (a === 0 || a === 1) && (b === 0 || b === 1)), 'no sharp corners left');
});

test('reading Windy map values: the right number is found by comparing with forecast heights', async () => {
    const { calibrateDecode, decodeWave, migrateWaveColors } = await import('../src/lib/waveColors');
    // e.g. a direction vector scaled by height, then the period
    const vec = (h: number, dir: number, p: number) => [h * Math.sin(dir), h * Math.cos(dir), p];
    const samples = [
        { raw: vec(2.3, 1, 12), height: 2.3 },
        { raw: vec(4.1, 2.5, 9), height: 4.0 },
    ];
    assert.equal(calibrateDecode(samples), 'hypot');
    assert.equal(calibrateDecode([{ raw: [7, 2.3, 0], height: 2.2 }, { raw: [9, 3.1, 0], height: 3.0 }]), 1);
    assert.equal(calibrateDecode([{ raw: [50, 60, 70], height: 2 }]), null, 'nothing fits: no guess');
    assert.ok(Number.isNaN(decodeWave(null, 'hypot')));
    // settings from 0.12.0 (one on / off for lines)
    assert.deepEqual(migrateWaveColors({ lines: true } as never).lines, { hs: true, sea: false, swell1: false, swell2: false });
});

test("reading Windy's sea: height, direction (from) and period worked out from the SWH layer", async () => {
    const { calibrateWaveReading, readWave } = await import('../src/lib/waveRead');
    // e.g. a vector pointing where the waves GO, scaled by the height, then the period
    const enc = (h: number, from: number, p: number) => {
        const to = ((from + 180) * Math.PI) / 180;
        return [h * Math.sin(to), h * Math.cos(to), p];
    };
    const samples = [
        { raw: enc(3.1, 319, 10), height: 3.0, dir: 320, period: 10 },
        { raw: enc(2.2, 250, 8), height: 2.3, dir: 252, period: 8.4 },
        { raw: enc(4.0, 10, 12), height: 4.1, dir: 8, period: 12 },
    ];
    const r = calibrateWaveReading(samples)!;
    assert.deepEqual(r, { height: 'hypot', dir: 'vec+180', period: 2 });
    const sea = readWave(enc(2.6, 25, 6.5), r);
    assert.ok(Math.abs(sea.h - 2.6) < 1e-9 && Math.abs((sea.dir as number) - 25) < 1e-6 && sea.period === 6.5);
    assert.equal(calibrateWaveReading([{ raw: [9, 9, 9], height: 2, dir: 0, period: 5 }]), null, 'no fit: nothing guessed');
});

test('wave systems: Windy sea used when read; SWH only as the fallback', async () => {
    const { waveSystems } = await import('../src/lib/weather');
    const base = { hs: 3.6, hsDir: 352, hsPeriod: 9, sw1: 2.4, sw1Dir: 318, sw1Period: 10, sw2: 0.8, sw2Dir: 200, sw2Period: 7, seaHs: 2.6, windDir: 25 } as never;
    assert.deepEqual(waveSystems(base).map(w => w.label), ['SWH', 'Swell 1', 'Swell 2'], 'sea not read yet: SWH');
    const read = { ...(base as object), seaHs: 2.5, seaDir: 30, seaPeriod: 6, seaWindy: true } as never;
    const sys = waveSystems(read);
    assert.deepEqual(sys.map(w => w.label), ['Sea', 'Swell 1', 'Swell 2']);
    assert.deepEqual([sys[0].height, sys[0].fromDir, sys[0].period], [2.5, 30, 6]);
});
