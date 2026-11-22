import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The IMO area data built by windy/tools/sea-areas/build_areas.py from the official texts (owner, 2026-11-22)
const d = JSON.parse(readFileSync(new URL('../data/seaareas/imo.json', import.meta.url), 'utf8')) as {
    areas: { id: string; name: string; g: string; lines: number[][]; label: number[][]; src: string; sox?: number; nox?: number; future?: number }[];
};
const near = (a: number, b: number, m: string) => assert.ok(Math.abs(a - b) < 2e-4, `${m}: ${a} vs ${b}`);
const dms = (d: number, m: number, s = 0) => d + m / 60 + s / 3600;

test('IMO sea areas: every area has lines, a label, a source; ids unique; positions sane', () => {
    assert.ok(d.areas.length >= 30);
    assert.equal(new Set(d.areas.map(a => a.id)).size, d.areas.length);
    for (const a of d.areas) {
        assert.ok(a.lines.length && a.lines.every(l => l.length >= 4 && l.length % 2 === 0), a.id);
        assert.ok(a.label.length, a.id);
        assert.match(a.src, /MARPOL|MEPC/, a.id);
        for (const l of a.lines) for (let i = 0; i < l.length; i += 2) assert.ok(Math.abs(l[i]) <= 90 && Math.abs(l[i + 1]) <= 180, a.id);
        assert.ok(['eca', 'a1', 'a2', 'a4', 'a5'].includes(a.g));
    }
});

test('IMO sea areas: spot checks against the official coordinates', () => {
    const by = (id: string) => d.areas.find(a => a.id === id)!;
    // MARPOL Annex VI appendix VII 2.1, point 1: 32°32′10″ N 117°06′11″ W (US / Mexico border, Pacific)
    const pac = by('eca-na').lines[0];
    near(pac[0], dms(32, 32, 10), 'NA Pacific point 1 lat');
    near(pac[1], -dms(117, 6, 11), 'NA Pacific point 1 lon');
    // Canadian Arctic (MEPC.392(82)) point 179: 60°00'.00 N 64°09'.60 W, last of segment .2
    const ca = by('eca-canarctic').lines[1];
    near(ca[ca.length - 2], 60, 'CA 179 lat');
    near(ca[ca.length - 1], -dms(64, 9.6), 'CA 179 lon');
    // North-East Atlantic (MEPC.407(84)) point 31: 35°57'.59 N 05°58'.27 W, adopted not in force
    const nea = by('eca-nea');
    assert.equal(nea.future, 1);
    near(nea.lines[1][0], dms(35, 57.59), 'NEA 31 lat');
    near(nea.lines[1][1], -dms(5, 58.27), 'NEA 31 lon');
    // Mediterranean ECA: SOx only (no NOx Tier III)
    assert.equal(by('eca-med').sox, 1);
    assert.equal(by('eca-med').nox, 0);
    // Annex I Oman area: first point 22°30.00'N 059°48.00'E (Ras al Hadd)
    near(by('a1-oman').lines[0][0], 22.5, 'Oman lat');
    near(by('a1-oman').lines[0][1], 59.8, 'Oman lon');
    // Antarctic: 60° S
    assert.ok(by('a5-antarctic').lines[0].filter((_, i) => i % 2 === 0).every(v => v === -60));
    // North Sea: 62° N and 4° W corner present
    assert.ok(by('eca-northsea').lines.some(l => l[0] === 62 && l[1] === -4));
});
