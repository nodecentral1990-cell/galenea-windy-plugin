// Turns this build into the PRIVATE TEST plugin (owner, 2026-11-02): own name and link, so the public plugin
// (windy-plugin-passage-plan) under review at Windy is not touched. Used only by the publish workflow with
// "variant = test"; never committed in this changed state.
import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('../src/pluginConfig.ts', import.meta.url);
let s = readFileSync(p, 'utf8');
const rep = (re, to) => {
    if (!re.test(s)) throw new Error(`test variant: ${re} not found in pluginConfig.ts`);
    s = s.replace(re, to);
};
rep(/name: 'windy-plugin-passage-plan'/, "name: 'windy-plugin-galenea-test'");
rep(/title: '[^']*'/, "title: 'Galenea TEST – not public'");
rep(/routerPath: '[^']*'/, "routerPath: '/galenea-test'");
rep(/private: false/, 'private: true');
writeFileSync(p, s);
console.log('Test variant: windy-plugin-galenea-test (private)');
