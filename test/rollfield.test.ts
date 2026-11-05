import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maxOf, rollColor, rollField, rollLevels, ROLL_LEVELS } from '../src/lib/rollField';
import { isolines, refineSmooth } from '../src/lib/contours';
import { predictMotions, type MotionShip } from '../src/lib/motions';

const ship: MotionShip = { lbp: 230, breadth: 32.2, draft: 12.8, gm: 1.6, rollPeriod: 16.9, cb: 0.65, bilgeKeels: [{ lengthM: 40, breadthM: 0.4 }] };
const wx = (h: number) => ({ hs: h, hsDir: 90, hsPeriod: 14, sw1: h, sw1Dir: 90, sw1Period: 14, sw2: null, sw2Dir: null, sw2Period: null, seaHs: 0, seaDir: null, seaPeriod: null, seaWindy: false, windKn: 10, windDir: 90, gustKn: null, pressureHpa: null, precipMm: null, fog: false, thunder: false });

test('roll field: beam swell growing eastward gives a 2° and a 4° line between the calm west and rough east', async () => {
    const rows = 4;
    const cols = 7;
    const points = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) points.push({ r, c, lat: r, lon: c, wx: wx(1 + c * 1.5) as never });
    const g = await rollField({ rows, cols, lat0: 0, lon0: 0, step: 1, points, rollAt: w => { const m = predictMotions(w, 0, 12, ship); return m.ok ? m.rollSigDeg : null; } });
    assert.ok(g);
    const row = g!.values[1];
    for (let c = 1; c < cols; c++) assert.ok(row[c] > row[c - 1], 'roll grows with the swell');
    const fine = refineSmooth(g!, 4);
    const max = maxOf(g!) as number;
    assert.ok(max > 4, `largest roll ${max.toFixed(1)}°`);
    assert.ok(isolines(fine, 2).length >= 1 && isolines(fine, 4).length >= 1, '2° and 4° lines found');
});

test('roll field stops when cancelled; levels and colours', async () => {
    const points = Array.from({ length: 50 }, (_, i) => ({ r: 0, c: i, lat: 0, lon: i, wx: wx(3) as never }));
    const signal = { cancelled: false };
    let calls = 0;
    const p = rollField({ rows: 1, cols: 50, lat0: 0, lon0: 0, step: 1, points, rollAt: () => (++calls, 3) }, signal, undefined, 5);
    signal.cancelled = true;
    assert.equal(await p, null, 'cancelled: no result');
    assert.ok(calls < 50, 'stopped early');
    assert.deepEqual(ROLL_LEVELS.slice(0, 3), [2, 4, 6], "owner's 2°, 4°, 6°");
    const lv = rollLevels(5);
    assert.ok(lv.some(l => l.level === 5 && l.limit), 'roll limit added as its own thick line');
    assert.ok(rollLevels(6).filter(l => l.limit).length === 1 && rollLevels(6).length === ROLL_LEVELS.length, 'limit on a standard level: that line drawn thick');
    const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
    for (let i = 1; i < ROLL_LEVELS.length; i++) assert.ok(lum(rollColor(ROLL_LEVELS[i])) < lum(rollColor(ROLL_LEVELS[i - 1])), 'light red → dark red');
});

test('worst heading: finds the heading with the most roll in 12 tries; bands painted in Mercator rows', async () => {
    const { worstHeading, paintBands, bandOf } = await import('../src/lib/rollField');
    let calls = 0;
    // roll largest with the waves on the beam from 90°: heading 0° or 180°
    const w = worstHeading(h => (++calls, 5 * Math.abs(Math.sin(((h - 90) * Math.PI) / 180)) + 0.1 * Math.cos((h * Math.PI) / 180)));
    assert.ok(w && Math.min(Math.abs(w.heading - 0), Math.abs(w.heading - 360)) <= 12, `worst heading ${w?.heading}°`);
    assert.ok(calls <= 12, `${calls} estimates`);
    const real = worstHeading(h => { const m = predictMotions(wx(4) as never, h, 12, ship); return m.ok ? m.rollSigDeg : null; });
    const route = predictMotions(wx(4) as never, 90, 12, ship); // heading into the swell
    assert.ok(real && route.ok && real.roll >= route.rollSigDeg, 'worst ≥ any one heading');
    assert.equal(bandOf(1.5, ROLL_LEVELS), null);
    assert.equal(bandOf(5, ROLL_LEVELS), 4);
    assert.equal(bandOf(20, ROLL_LEVELS), 15);
    // a 2 × 2 grid: west half 1° (no band), east half 5° (the 4–6° band)
    const g = { lat0: 0, lon0: 0, dLat: 10, dLon: 10, values: [[1, 5], [1, 5]] };
    const img = paintBands(g, 0, 10, 0, 10, 10, 10, ROLL_LEVELS);
    const px = (x: number, y: number) => Array.from(img.slice((y * 10 + x) * 4, (y * 10 + x) * 4 + 4));
    assert.equal(px(1, 5)[3], 0, 'below 2°: transparent');
    const four = parseInt(rollColor(4).slice(1), 16);
    assert.deepEqual(px(8, 5), [four >> 16, (four >> 8) & 255, four & 255, 255], 'east: the 4° band colour');
});

test('pitch chart: its own levels in blues, the pitch mark drawn thick', async () => {
    const { chartLevels, chartColor, PITCH_LEVELS } = await import('../src/lib/rollField');
    assert.deepEqual(PITCH_LEVELS.slice(0, 3), [1, 2, 3]);
    const lv = chartLevels('pitch', 2.5);
    assert.ok(lv.some(l => l.level === 2.5 && l.limit), 'pitch mark added');
    const blue = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (n & 255) > (n >> 16); };
    assert.ok(PITCH_LEVELS.every(l => blue(chartColor('pitch', l))), 'pitch lines are blue');
    assert.equal(chartColor('roll', 4), rollColor(4), 'roll colours unchanged');
});
