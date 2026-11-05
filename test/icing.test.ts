import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sprayIcing } from '../src/lib/icing';
import { checkLimits, defaultThresholds, type WxPoint } from '../src/lib/weather';

test('spray icing (Overland): none when warm, classes grow with wind and cold, a warmer sea lowers it', () => {
    assert.equal(sprayIcing(30, 2, 5)?.cls, 'none', 'air above freezing');
    assert.equal(sprayIcing(30, -10, 15)?.cls, 'none', 'warm sea: outside the method');
    // PPR = Va (Tf − Ta) / (1 + 0.3 (Tw − Tf)), Va m/s, Tf −1.8 °C
    const p = sprayIcing(30, -10, 0)!;
    const va = 30 * 0.514444;
    assert.ok(Math.abs(p.ppr - (va * 8.2) / (1 + 0.3 * 1.8)) < 1e-9, `PPR ${p.ppr.toFixed(1)}`);
    assert.equal(p.cls, 'heavy');
    assert.equal(sprayIcing(15, -5, 2)?.cls, 'light');
    assert.equal(sprayIcing(45, -15, -1)?.cls, 'extreme');
    assert.ok(sprayIcing(30, -10, 4)!.ppr < sprayIcing(30, -10, 0)!.ppr, 'warmer sea: less icing');
    assert.equal(sprayIcing(null, -10, 0), null);
});

test('cold and ice limits: air, sea surface and icing warnings', () => {
    const wx = { windKn: 30, airTempC: -10, seaTempC: -1.2, hs: 2 } as WxPoint;
    const hits = checkLimits(wx, 0, defaultThresholds());
    const lv = (w: string) => hits.find(h => h.what === w)?.level ?? 0;
    assert.equal(lv('Air temp'), 1, 'air −10 °C ≤ −5: alert');
    assert.equal(lv('Sea temp'), 2, 'sea −1.2 ≤ −1: limit');
    assert.equal(lv('Icing'), 2, 'heavy icing = limit');
    assert.match(hits.find(h => h.what === 'Sea temp')!.detail, /no sea-ice data/);
    assert.equal(checkLimits({ windKn: 10, airTempC: 12, seaTempC: 14 } as WxPoint, 0, defaultThresholds()).length, 0);
});
