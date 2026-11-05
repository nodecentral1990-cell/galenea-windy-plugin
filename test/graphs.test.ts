import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axisPlan, GRAPH_SERIES, niceTicks, seriesById } from '../src/lib/graphSeries';
import { emptyVessel } from '../src/lib/model';

const row = (o: Record<string, unknown>) => ({ time: 0, pos: { lat: 0, lon: 0, course: 90 }, speedKn: 12, stopped: false, sicw: 13, lossKn: 1, sog: 12.5, curAlong: null, wx: null, ...o }) as never;

test('graph values: current along the track is + when helping, − against; slip and power from the table', () => {
    const v = { ...emptyVessel(), pitch: 6, speedTable: [{ rpm: 60, sicw: 12, fuel: 40, powerKw: 9000 }, { rpm: 70, sicw: 14, fuel: 55, powerKw: 13000 }] };
    const c = { vessel: v, motion: () => null };
    const ahead = row({ wx: { currentKn: 1, currentSet: 90 } });
    const against = row({ wx: { currentKn: 1, currentSet: 270 } });
    assert.ok(Math.abs((seriesById('curAlong')!.get(ahead, c) as number) - 1) < 1e-9);
    assert.ok(Math.abs((seriesById('curAlong')!.get(against, c) as number) + 1) < 1e-9);
    assert.equal(seriesById('power')!.get(row({}), c), 11000, 'power interpolated at 13 kn');
    const rpm = 65;
    const eng = (6 * rpm * 60) / 1852;
    assert.ok(Math.abs((seriesById('slip')!.get(row({}), c) as number) - ((eng - 12) / eng) * 100) < 1e-9, 'slip from RPM, pitch and speed through water');
    assert.equal(seriesById('slip')!.get(row({}), { vessel: { ...v, pitch: null }, motion: () => null }), null, 'no pitch: no slip');
    assert.ok(GRAPH_SERIES.filter(s => s.unit === '°').every(s => s.dots), 'directions drawn as dots');
});

test('graph axes: first unit left, second right; directions 0–360; round ticks', () => {
    const a = axisPlan(['sog', 'windKn', 'seaHs', 'windDir'], { sog: [12, 13], windKn: [20, 35], seaHs: [1, 3], windDir: [10, 350] });
    assert.equal(a.left, 'kn');
    assert.equal(a.right, 'm');
    assert.deepEqual(a.ranges['°'], [0, 360]);
    assert.equal(a.ranges.kn[0], 0, 'speeds start at 0');
    assert.deepEqual(niceTicks(0, 37.8), [0, 10, 20, 30]);
});
