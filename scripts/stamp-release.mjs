// Puts "Version x.y.z · published DD Mon YYYY." at the start of the plugin's description in Windy's plugin list
// (owner, 2026-11-19: "always mention the version number and date of publish of the new version so that people can
// understand"). Run before every public release: `npm run stamp` (date = today, UTC; or `npm run stamp -- 2026-11-25`).
// A unit test (test/config.test.ts) fails if the description does not name the current version.
import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('../src/pluginConfig.ts', import.meta.url);
let s = readFileSync(p, 'utf8');
const version = (s.match(/version: '(\d+\.\d+\.\d+)'/) ?? [])[1];
if (!version) throw new Error('stamp: version not found in pluginConfig.ts');
const arg = process.argv[2];
const d = arg ? new Date(`${arg}T12:00:00Z`) : new Date();
if (isNaN(d.getTime())) throw new Error(`stamp: not a date: ${arg}`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const stamp = `Version ${version} · published ${String(d.getUTCDate()).padStart(2, '0')} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}. `;
const re = /(description:\s*\n?\s*")(?:Version \d+\.\d+\.\d+ · published \d\d [A-Z][a-z]{2} \d{4}\. )?/;
if (!re.test(s)) throw new Error('stamp: description not found in pluginConfig.ts');
s = s.replace(re, `$1${stamp}`);
writeFileSync(p, s);
console.log(stamp.trim());
