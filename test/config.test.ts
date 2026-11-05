import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/pluginConfig';

test("plugin title fits Windy's rule (8–49 characters); author Capt. Node Central", () => {
    assert.ok(config.title.length > 7 && config.title.length < 50, `${config.title.length} characters`);
    assert.ok(/Galenea/.test(config.title) && /seafarer/.test(config.title), 'name and tagline');
    assert.equal(config.author, 'Capt. Node Central');
    assert.equal(config.name, 'windy-plugin-passage-plan', 'internal name unchanged so the install link and saved data stay');
});
