import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/pluginConfig';

test("plugin title fits Windy's rule (8–49 characters); author Capt. Node Central", () => {
    assert.ok(config.title.length > 7 && config.title.length < 50, `${config.title.length} characters`);
    assert.ok(/Galenea/.test(config.title) && /seafarer/.test(config.title), 'name and tagline');
    assert.equal(config.author, 'Capt. Node Central');
    assert.equal(config.name, 'windy-plugin-passage-plan', 'internal name unchanged so the install link and saved data stay');
});

test('description starts with this version and its publish date (owner, 2026-11-19: run `npm run stamp` before each release)', () => {
    const m = config.description.match(/^Version (\d+\.\d+\.\d+) · published (\d\d [A-Z][a-z]{2} \d{4})\. /);
    assert.ok(m, 'description begins with "Version x.y.z · published DD Mon YYYY."');
    assert.equal(m![1], config.version, 'the version in the description is this version: run `npm run stamp`');
});
