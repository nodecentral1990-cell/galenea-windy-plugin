// Usage statistics (owner, 2026-10-27): how long the plugin has been used, routes planned and
// sailed, where (1° squares for the heat map), and fuel / time saved by route optimisation. Kept in
// this browser only and never sent anywhere: totals for a whole fleet would need a server.

import { writable } from 'svelte/store';

export interface OptimisationRecord {
    t: number;
    /** Fuel of the route before and after optimising, t (null = not worked out: no fuel table) */
    fuelBeforeT: number | null;
    fuelAfterT: number | null;
    hoursBefore: number | null;
    hoursAfter: number | null;
    nmBefore: number;
    nmAfter: number;
    /** True when the user took the optimised route */
    accepted: boolean;
}

export interface Usage {
    since: number;
    sessions: number;
    usedMs: number;
    /** Routes planned (forecast fetched), by route fingerprint */
    routes: Record<string, { t: number; nm: number; legs: number }>;
    plannedNm: number;
    voyages: number;
    sailedNm: number;
    /** Heat map: "lat,lon" of the south-west corner of each 1° square → weight */
    cells: Record<string, number>;
    optimisations: OptimisationRecord[];
}

const KEY = 'windy-plugin-passage-plan:usage';
const KEY_ON = 'windy-plugin-passage-plan:usage-on';

export const emptyUsage = (): Usage => ({ since: Date.now(), sessions: 0, usedMs: 0, routes: {}, plannedNm: 0, voyages: 0, sailedNm: 0, cells: {}, optimisations: [] });

function load(): Usage {
    try {
        const s = localStorage.getItem(KEY);
        return s ? { ...emptyUsage(), ...(JSON.parse(s) as Usage) } : emptyUsage();
    } catch {
        return emptyUsage();
    }
}

export const usage = writable<Usage>(load());
const onSaved = (() => {
    try {
        return localStorage.getItem(KEY_ON) !== '0';
    } catch {
        return true;
    }
})();
/** Counting on / off (⚙ Settings → Activity log and usage) */
export const usageEnabled = writable<boolean>(onSaved);
let enabled = onSaved;
usageEnabled.subscribe(v => {
    enabled = v;
    try {
        localStorage.setItem(KEY_ON, v ? '1' : '0');
    } catch {
        /* not remembered */
    }
});

let timer: ReturnType<typeof setTimeout> | null = null;
usage.subscribe(u => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        try {
            localStorage.setItem(KEY, JSON.stringify(u));
        } catch {
            /* not remembered */
        }
    }, 1000);
});

function change(fn: (u: Usage) => void): void {
    if (!enabled) return;
    usage.update(u => {
        fn(u);
        return u;
    });
}

export const cellKey = (lat: number, lon: number): string => `${Math.floor(lat)},${Math.floor((((lon + 180) % 360) + 360) % 360) - 180}`;

/** Add each 1° square the points pass through once (weight w). */
export function addCells(cells: Record<string, number>, pts: { lat: number; lon: number }[], w = 1): void {
    const seen = new Set(pts.map(p => cellKey(p.lat, p.lon)));
    for (const k of seen) cells[k] = (cells[k] ?? 0) + w;
}

export const startSession = (): void => change(u => (u.sessions += 1));
export const addUsedTime = (ms: number): void => change(u => (u.usedMs += Math.max(0, ms)));

/** A route planned (forecast fetched): counted once per route shape; its track goes into the heat map. */
export function recordRoutePlanned(fingerprint: string, nm: number, legs: number, track: { lat: number; lon: number }[]): void {
    change(u => {
        if (u.routes[fingerprint]) return;
        u.routes[fingerprint] = { t: Date.now(), nm, legs };
        u.plannedNm += nm;
        addCells(u.cells, track, 1);
    });
}

export const recordVoyageStart = (): void => change(u => (u.voyages += 1));

/** Distance sailed between two position updates; the position counts double in the heat map. */
export function recordSailed(nm: number, pos: { lat: number; lon: number }): void {
    change(u => {
        if (nm > 0 && nm < 2000) u.sailedNm += nm;
        addCells(u.cells, [pos], 2);
    });
}

export const recordOptimisation = (r: Omit<OptimisationRecord, 't'>): void => change(u => u.optimisations.push({ t: Date.now(), ...r }));

/** Totals of the optimised routes the user took */
export function savings(u: Usage): { count: number; taken: number; fuelT: number; hours: number; nm: number } {
    const taken = u.optimisations.filter(o => o.accepted);
    const sum = (f: (o: OptimisationRecord) => number | null) => taken.reduce((s, o) => s + (f(o) ?? 0), 0);
    return {
        count: u.optimisations.length,
        taken: taken.length,
        fuelT: sum(o => (o.fuelBeforeT != null && o.fuelAfterT != null ? o.fuelBeforeT - o.fuelAfterT : null)),
        hours: sum(o => (o.hoursBefore != null && o.hoursAfter != null ? o.hoursBefore - o.hoursAfter : null)),
        nm: sum(o => o.nmBefore - o.nmAfter),
    };
}

export function resetUsage(): void {
    usage.set(emptyUsage());
}
