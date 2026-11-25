// Loads the climate months a voyage needs (owner, 2026-11-23) from the plugin's public code page (data/climate/, not in
// the plugin: Windy's ~3 MB upload limit), keeps them in this browser for a year (also used with no internet), and gives
// them to the weather code (lib/climate.ts). Only for voyages that run past the forecast (about 10 days ahead).

import { get, writable } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { IS_APP } from '../lib/appMode';
import { climatePoint, decodeClimMonth, setClimateSource, type ClimMonth, type ClimMonthFile } from '../lib/climate';
import { idbGet, idbSet } from '../lib/idbCache';
import { basePlan, climateOn, climateTick } from '../state';

export const CLIMATE_WEB = 'https://raw.githubusercontent.com/nodecentral1990-cell/galenea-windy-plugin/main/data/climate/';
/** In the Galenea app all 12 months are inside the app (galenea-app/scripts/copy-data.mjs): voyages in any month, no internet */
export const CLIMATE_BASE = IS_APP ? 'data/climate/' : CLIMATE_WEB;
const KEEP_MS = 365 * 86400e3;
/** Voyages ending later than this from now get the climate months */
const NEEDED_AFTER_MS = 7 * 86400e3;

export const climateStatus = writable('');
const months = new Map<number, ClimMonth>();
const loading = new Map<number, Promise<ClimMonth | null>>();

function loadMonth(m: number): Promise<ClimMonth | null> {
    if (months.has(m)) return Promise.resolve(months.get(m) as ClimMonth);
    let p = loading.get(m);
    if (p) return p;
    const name = `m${String(m).padStart(2, '0')}.json`;
    p = (async () => {
        if (IS_APP) {
            // the app's own copy: no download, no browser copy
            const r = await fetch(CLIMATE_BASE + name);
            if (!r.ok) throw new Error(`climate file missing in the app (${name})`);
            const cm = decodeClimMonth((await r.json()) as ClimMonthFile);
            months.set(m, cm);
            return cm;
        }
        const key = `cl:${name}`;
        const kept = await idbGet<{ at: number; data: ClimMonthFile }>(key).catch(() => undefined);
        let file: ClimMonthFile | null = kept && Date.now() - kept.at < KEEP_MS ? kept.data : null;
        if (!file) {
            try {
                const r = await fetch(CLIMATE_BASE + name);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                file = (await r.json()) as ClimMonthFile;
                idbSet(key, { at: Date.now(), data: file }).catch(() => {});
            } catch (e) {
                if (kept) file = kept.data;
                else throw e;
            }
        }
        const cm = decodeClimMonth(file);
        months.set(m, cm);
        return cm;
    })();
    p.catch(() => loading.delete(m));
    loading.set(m, p);
    return p;
}

/** Calendar months (1–12, UTC) from `a` to `b`, at most 6 */
export function monthsBetween(a: number, b: number): number[] {
    const out: number[] = [];
    const d = new Date(Date.UTC(new Date(a).getUTCFullYear(), new Date(a).getUTCMonth(), 1));
    while (d.getTime() <= b && out.length < 6) {
        out.push(d.getUTCMonth() + 1);
        d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
}

async function update(): Promise<void> {
    if (!get(climateOn)) {
        setClimateSource(null);
        climateStatus.set('Climate beyond the forecast: switched off.');
        climateTick.update(n => n + 1);
        return;
    }
    const bp = get(basePlan);
    const now = Date.now();
    const end = bp.eta ?? null;
    if (end == null || end < now + NEEDED_AFTER_MS) {
        climateStatus.set('');
        return;
    }
    const want = monthsBetween(Math.max(now, bp.etd ?? now), end);
    if (want.every(m => months.has(m))) return;
    try {
        await Promise.all(want.map(loadMonth));
        setClimateSource((lat, lon, t) => {
            const m = months.get(new Date(t).getUTCMonth() + 1);
            return m ? climatePoint(m, lat, lon) : null;
        });
        climateStatus.set(`Climate averages loaded for ${want.length} month${want.length === 1 ? '' : 's'} (ERA5, 2006–2025): used beyond the forecast, marked C.`);
        logEvent('weather', `Climate months loaded: ${want.join(', ')}`);
        climateTick.update(n => n + 1);
    } catch (e) {
        climateStatus.set(
            IS_APP
                ? `Climate averages could not be read (${(e as Error).message}): beyond the forecast the app assumes calm water.`
                : `Climate averages could not be downloaded (${(e as Error).message}): beyond the forecast the plugin assumes calm water. They need internet once; then they are kept in this browser.`,
        );
        logEvent('error', `Climate: ${(e as Error).message}`);
    }
}

let unsubs: (() => void)[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const soon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void update(), 800);
};

export function startClimate(): void {
    if (unsubs.length) return;
    // a climate source set before (months already loaded) stays valid
    if (months.size)
        setClimateSource((lat, lon, t) => {
            const m = months.get(new Date(t).getUTCMonth() + 1);
            return m ? climatePoint(m, lat, lon) : null;
        });
    unsubs = [basePlan.subscribe(soon), climateOn.subscribe(soon)];
}

export function stopClimate(): void {
    unsubs.forEach(u => u());
    unsubs = [];
    if (timer) clearTimeout(timer);
    setClimateSource(null);
}
