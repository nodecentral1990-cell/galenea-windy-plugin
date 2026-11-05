import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLogFile, clearLog, logEvent, logFileName } from '../src/lib/activityLog';
import { addCells, cellKey, emptyUsage, savings } from '../src/lib/usage';

test('activity log file: UTC times, entries in order, positions and names can be hidden', () => {
    clearLog();
    logEvent('route', 'Route changed', { name: 'Secret run', waypoints: [{ lat: 43.2961, lon: 5.3812 }] });
    logEvent('weather', 'Forecast: 3 of 3 points');
    const full = JSON.parse(buildLogFile({ route: { name: 'Secret run' } }));
    assert.equal(full.entries.length, 2);
    assert.equal(full.entries[0].kind, 'route');
    assert.match(full.entries[0].time, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.equal(full.entries[0].data.waypoints[0].lat, 43.2961);
    const hidden = JSON.parse(buildLogFile({ route: { name: 'Secret run' } }, { hidePositions: true }));
    assert.equal(hidden.entries[0].data.waypoints[0].lat, 43);
    assert.equal(hidden.entries[0].data.waypoints[0].lon, 5);
    assert.equal(hidden.route.name, '(hidden)');
    assert.equal(hidden.entries[0].data.name, '(hidden)');
    assert.equal(logFileName(Date.UTC(2026, 9, 27, 14, 5)), 'passage-plan-log-20261027-1405Z.json');
});

test('usage heat map: 1° squares, each counted once per route, across the date line', () => {
    assert.equal(cellKey(-0.5, -0.5), '-1,-1');
    assert.equal(cellKey(10.2, 181.5), '10,-179');
    const cells: Record<string, number> = {};
    addCells(cells, [{ lat: 10.1, lon: 20.1 }, { lat: 10.9, lon: 20.9 }, { lat: 11.2, lon: 20.5 }]);
    assert.deepEqual(cells, { '10,20': 1, '11,20': 1 });
    addCells(cells, [{ lat: 10.5, lon: 20.5 }], 2);
    assert.equal(cells['10,20'], 3);
});

test('savings count only the optimised routes the user took', () => {
    const u = emptyUsage();
    u.optimisations.push(
        { t: 0, fuelBeforeT: 300, fuelAfterT: 280, hoursBefore: 240, hoursAfter: 236, nmBefore: 3000, nmAfter: 3050, accepted: true },
        { t: 0, fuelBeforeT: 200, fuelAfterT: 150, hoursBefore: 100, hoursAfter: 100, nmBefore: 1000, nmAfter: 1000, accepted: false },
    );
    const s = savings(u);
    assert.equal(s.count, 2);
    assert.equal(s.taken, 1);
    assert.equal(s.fuelT, 20);
    assert.equal(s.hours, 4);
    assert.equal(s.nm, -50);
});
