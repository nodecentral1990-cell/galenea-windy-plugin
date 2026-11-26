import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { clickAction, toolFor, toolNote } from '../src/lib/mapTool';
import { SETTINGS_GROUPS, groupInfo, searchGroups } from '../src/ui/settings/registry';
import { forecastAge, worstAhead } from '../src/lib/voyageStrip';

test('map tool: picking a place wins over adding waypoints and over a click on a course line', () => {
    assert.equal(toolFor(false, false), 'off');
    assert.equal(toolFor(true, false), 'waypoint');
    assert.equal(toolFor(true, true), 'place');
    assert.equal(toolFor(false, true), 'place');
    // a pick never changes the route, even on a course line with "click inserts" on
    assert.equal(clickAction('place', true, true), 'pick');
    assert.equal(clickAction('place', false, false), 'pick');
    // as before: a course line inserts when the setting is on, whatever the tool
    assert.equal(clickAction('off', true, true), 'insert');
    assert.equal(clickAction('waypoint', true, true), 'insert');
    assert.equal(clickAction('waypoint', true, false), 'append');
    assert.equal(clickAction('waypoint', false, true), 'append');
    assert.equal(clickAction('off', false, true), 'none');
    assert.equal(clickAction('off', true, false), 'none');
    assert.equal(toolNote('off'), '');
    assert.match(toolNote('place'), /does not add a waypoint/);
});

test('settings registry: 15 groups, each with a title, an icon and one component in SettingsGroup', () => {
    assert.equal(SETTINGS_GROUPS.length, 15);
    assert.equal(new Set(SETTINGS_GROUPS.map(g => g.id)).size, 15);
    const src = readFileSync(new URL('../src/ui/settings/SettingsGroup.svelte', import.meta.url), 'utf8');
    for (const g of SETTINGS_GROUPS) {
        assert.ok(g.title && g.icon && g.short && g.hint, g.id);
        assert.equal(src.split(`id === '${g.id}'`).length - 1, 1, `${g.id}: drawn exactly once in SettingsGroup`);
        assert.equal(groupInfo(g.id), g);
    }
    // the Settings tab draws groups only through SettingsGroup (no second copy of a form)
    const tab = readFileSync(new URL('../src/ui/SettingsTab.svelte', import.meta.url), 'utf8');
    assert.ok(tab.includes('<SettingsGroup id={sec.id} />'));
    assert.ok(!/bind:(checked|value)=\{\$(?!open)/.test(tab), 'no setting field written directly in the Settings tab');
});

test('settings search: finds groups by a word in their title, parts or search words', () => {
    assert.deepEqual(
        searchGroups('barred').map(g => g.id),
        ['speed'],
    );
    assert.equal(searchGroups('').length, 15);
    assert.ok(searchGroups('roll period').some(g => g.id === 'motion'));
    assert.ok(searchGroups('colour').some(g => g.id === 'wavechart') && searchGroups('colour').some(g => g.id === 'map'));
    assert.equal(searchGroups('zzzz').length, 0);
});

test('voyage strip: worst ahead is the largest SWH in the rows from now on, with the warnings counted', () => {
    const row = (time: number, hs: number | null, level = 0, imo = 0) => ({ time, wx: hs == null ? null : { hs }, limits: level ? [{ level }] : [], resonance: Array(imo).fill({}) });
    const rows = [row(1000, 9.9), row(2000, 3.1, 1), row(3000, 6.2, 2, 2), row(4000, null), row(5000, 4.0, 0, 1)];
    const w = worstAhead(rows, 1500);
    assert.ok(w);
    assert.equal(w.hs, 6.2);
    assert.equal(w.time, 3000);
    assert.equal(w.imoRows, 2);
    assert.equal(w.limitRows, 1);
    assert.equal(w.alertRows, 1);
    assert.equal(w.level, 2);
    assert.equal(worstAhead([row(1000, 2)], 5000), null);
    // every row counts when the voyage has not started
    assert.equal(worstAhead(rows, 0)?.hs, 9.9);
});

test('voyage strip: the forecast is called old 12 hours after it was fetched', () => {
    const H = 3600e3;
    assert.equal(forecastAge(100 * H, 100 * H + 11.9 * H).old, false);
    const a = forecastAge(100 * H, 100 * H + 12 * H);
    assert.equal(a.old, true);
    assert.match(a.text, /12 h ago/);
    assert.match(forecastAge(100 * H, 100 * H + 20 * 60e3).text, /20 min ago/);
    assert.equal(forecastAge(null, 5).text, '');
});
