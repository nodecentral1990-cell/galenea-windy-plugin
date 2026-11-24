import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, nextCandidates, notesBetween, RELEASE_NOTES } from '../src/lib/releaseNotes';
import config from '../src/pluginConfig';

test('version numbers compare as numbers (0.10 is newer than 0.9)', () => {
    assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
    assert.equal(compareVersions('0.12.1', '0.12.1'), 0);
    assert.equal(compareVersions('1.0.0', '0.99.0'), 1);
    const c = nextCandidates('0.13.0');
    for (const v of ['0.13.1', '0.13.2', '0.14.0', '0.15.0', '0.19.0', '0.25.0', '0.25.1', '1.0.0']) assert.ok(c.includes(v), v);
    // owner's report 2026-11-02: from 0.17.0 the published 0.23.0 must be found
    assert.ok(nextCandidates('0.17.0').includes('0.23.0'));
});

test('release notes: the current version has notes, newest first; notes after an update', () => {
    assert.equal(RELEASE_NOTES[0].version, config.version, 'add release notes for every version');
    for (let i = 1; i < RELEASE_NOTES.length; i++) assert.equal(compareVersions(RELEASE_NOTES[i - 1].version, RELEASE_NOTES[i].version), 1);
    assert.deepEqual(notesBetween('0.24.0', '0.25.0').map(n => n.version), ['0.25.0', '0.24.2', '0.24.1']);
});

test('speed graphs: a line every knot, labels every knot where there is room (owner 2026-11-24)', async () => {
    const { knotTicks } = await import('../src/lib/graphSeries');
    const t = knotTicks(0, 21.3, 20)!;
    assert.deepEqual(t.lines.slice(0, 4), [0, 1, 2, 3]);
    assert.equal(t.lines.length, 22);
    assert.deepEqual(t.labels, t.lines, 'room for every label');
    const small = knotTicks(0, 21.3, 5)!;
    assert.equal(small.lines.length, 22, 'still a line every knot');
    assert.deepEqual(small.labels, [0, 5, 10, 15, 20], 'labels every 5 kn when squeezed');
    assert.equal(knotTicks(0, 100, 5), null, 'very wide ranges keep the normal steps');
});
