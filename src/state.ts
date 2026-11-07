// Shared state of the plugin (Svelte stores), saved in this browser's local storage.
// Local storage stays on this computer and browser only; "Save ship profile" writes a file
// the user can carry to another computer.

import { fullFlagColors, type FlagColors } from './lib/shipGlyph';
import { derived, readable, writable, type Writable } from 'svelte/store';

import { computePlan, emptyVessel, newRoute, newWaypoint, type Route, type Vessel } from './lib/model';
import { defaultThresholds, nearestSweep, weatherAt, type Thresholds, type WxPoint, type WxSeries } from './lib/weather';
import { simulate, type Current, type SimResult } from './lib/speed';
import type { ShipStyle } from './lib/shipSymbols';

const KEY = 'windy-plugin-passage-plan:v1';

interface Saved {
    route?: Route;
    vessel?: Vessel;
    thresholds?: Thresholds;
    shipStepH?: number;
    tableStepH?: number;
    legClickInserts?: boolean;
    shipWeather?: boolean;
    shipStyle?: ShipStyle;
    followShip?: boolean;
    showShipBox?: boolean;
    showPolarBox?: boolean;
    flagColors?: Partial<FlagColors>;
    showIsobars?: boolean;
}

function load(): Saved {
    try {
        const s = localStorage.getItem(KEY);
        return s ? (JSON.parse(s) as Saved) : {};
    } catch {
        return {};
    }
}

const saved = load();

const mergeThresholds = (t?: Thresholds): Thresholds => {
    const d = defaultThresholds();
    if (!t) return d;
    return { ...d, ...t, resonance: { ...d.resonance, ...t.resonance }, alert: { ...d.alert, ...t.alert }, limit: { ...d.limit, ...t.limit }, cold: { ...d.cold!, ...(t.cold ?? {}) } };
};

export const route: Writable<Route> = writable(saved.route ? { ...newRoute(), ...saved.route } : newRoute());
// Older versions saved the 3 % rule of thumb as the drift: now the plugin estimates it (empty = estimate)
if (saved.vessel && saved.vessel.leewayPct === 3) saved.vessel.leewayPct = null;
export const vessel: Writable<Vessel> = writable({ ...emptyVessel(), ...saved.vessel });
export const thresholds: Writable<Thresholds> = writable(mergeThresholds(saved.thresholds));
/** Ship symbol step on the map, hours (0 = off) */
export const shipStepH = writable<number>(saved.shipStepH ?? 6);
/** Weather table step, hours */
export const tableStepH = writable<number>(saved.tableStepH ?? 6);
/** Waypoints selected on the map or in the table (several with Ctrl/⌘ or the tick boxes) */
export const selectedUids = writable<string[]>([]);
/** When on, a plain click on a leg inserts a waypoint there */
export const legClickInserts = writable<boolean>(saved.legClickInserts ?? true);
/** When on, ship symbols show swell / wave arrows and a wind barb (once the forecast is fetched) */
export const shipWeather = writable<boolean>(saved.shipWeather ?? true);
/** Look of the ship symbols on the map (Route tab) */
export const shipStyle = writable<ShipStyle>(saved.shipStyle ?? 'classic');
/** Keep the ship (at Windy's slider time) in the middle of the map: the map follows it */
export const followShip = writable<boolean>(saved.followShip ?? false);
/** Small window on the map with the ship and the weather at the slider time */
export const showShipBox = writable<boolean>(saved.showShipBox ?? true);
/** Show the polar diagram (IMO roll / broaching by heading and speed) inside the ship window */
export const showPolarBox = writable<boolean>(saved.showPolarBox ?? false);
/** Switch Windy's pressure lines (isobars) on when the plugin opens (owner, 2026-10-27: on by default) */
export const showIsobars = writable<boolean>(saved.showIsobars ?? true);
/** Colours of the sea and swell flags (user's choice; warning colours are not offered) */
/** Flag colours for SWH, sea, swell 1 and swell 2 (owner, 2026-10-30; older saves had sea and swell only) */
export const flagColors = writable<FlagColors>(fullFlagColors(saved.flagColors));
/** The weather model Windy's map is showing (Windy's model menu); the plugin itself always uses ECMWF */
export const mapProduct = writable<string>('');
/** Waypoints whose position is above sea level on Windy's elevation data (warning only) */
export const landUids = writable<Set<string>>(new Set());
/** When on, clicking the map adds a waypoint at the end */
export const addMode = writable(false);
/** Windy's current timeline time (ms) */
export const timelineTs = writable<number>(Date.now());

/**
 * Weather fetched along the route. The point forecasts cover the whole forecast period, so they
 * stay valid when only times change (ETD, speeds, fixed ETAs): the weather then follows the new
 * timing straight away. They go stale only when the route itself changes.
 */
export const wxSeries = writable<WxSeries[]>([]);
/** Values read from Windy's map layers (currents, 100 m wind) at the plan times, by time */
export const wxSweep = writable<Map<number, Partial<WxPoint>>>(new Map());
/** Route key the forecast belongs to */
export const wxPlanKey = writable<string>('');
/** Timing key the map-layer readings belong to (they were read at positions for those times) */
export const wxSweepKey = writable<string>('');

/** Plan from speeds and allowances only (no weather): used to choose where to fetch the forecast */
export const basePlan = derived([route, vessel], ([$route, $vessel]) => computePlan($route, $vessel));

/** A short fingerprint of the route the forecast depends on (positions and leg types). */
export const planKey = derived(route, $route => JSON.stringify($route.waypoints.map(w => [w.lat.toFixed(4), w.lon.toFixed(4), w.legType])));

/** Fingerprint of route and timing: map-layer readings are only good for the times they were read at. */
export const sweepKey = derived([planKey, basePlan], ([$key, $plan]) =>
    JSON.stringify([$key, $plan.etd, $plan.legs.map(l => (l.arriveMs == null ? null : Math.round(l.arriveMs / 60e3)))]),
);

/** Map-layer readings that still fit the current route and times (empty otherwise). */
export const wxSweepValid = derived([wxSweep, wxSweepKey, sweepKey], ([$m, $a, $b]) => ($a === $b ? $m : new Map<number, Partial<WxPoint>>()));

let timer: ReturnType<typeof setTimeout> | null = null;
const persist = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        try {
            let r: Route | undefined, v: Vessel | undefined, t: Thresholds | undefined, s1 = 6, s2 = 6, lc = true, sw = true, ss: ShipStyle = 'classic', fs = false, sb = true, pb = false, fc = { sea: '#1e88e5', swell: '#43d16b' }, iso = true;
            route.subscribe(x => (r = x))();
            vessel.subscribe(x => (v = x))();
            thresholds.subscribe(x => (t = x))();
            shipStepH.subscribe(x => (s1 = x))();
            tableStepH.subscribe(x => (s2 = x))();
            legClickInserts.subscribe(x => (lc = x))();
            shipWeather.subscribe(x => (sw = x))();
            shipStyle.subscribe(x => (ss = x))();
            followShip.subscribe(x => (fs = x))();
            showShipBox.subscribe(x => (sb = x))();
            showPolarBox.subscribe(x => (pb = x))();
            flagColors.subscribe(x => (fc = x))();
            showIsobars.subscribe(x => (iso = x))();
            localStorage.setItem(KEY, JSON.stringify({ route: r, vessel: v, thresholds: t, shipStepH: s1, tableStepH: s2, legClickInserts: lc, shipWeather: sw, shipStyle: ss, followShip: fs, showShipBox: sb, showPolarBox: pb, flagColors: fc, showIsobars: iso }));
        } catch {
            /* storage blocked or full: settings simply won't be remembered */
        }
    }, 500);
};
[route, vessel, thresholds, shipStepH, tableStepH, legClickInserts, shipWeather, shipStyle, followShip, showShipBox, showPolarBox, flagColors, showIsobars].forEach(s => (s as Writable<unknown>).subscribe(persist));

export function clearSaved(): void {
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
}

/** Update the route immutably so Svelte notices. */
export function updateRoute(fn: (r: Route) => void): void {
    route.update(r => {
        const copy: Route = { ...r, waypoints: r.waypoints.map(w => ({ ...w })) };
        fn(copy);
        return copy;
    });
}

/** Select a waypoint; with `additive` (Ctrl/⌘) it is added to or removed from the selection. */
export function selectWp(uid: string, additive: boolean): void {
    selectedUids.update(sel => (additive ? (sel.includes(uid) ? sel.filter(u => u !== uid) : [...sel, uid]) : [uid]));
}

/** Delete the given waypoints. */
export function deleteWaypoints(uids: string[]): void {
    if (!uids.length) return;
    const set = new Set(uids);
    updateRoute(r => {
        r.waypoints = r.waypoints.filter(w => !set.has(w.uid));
    });
    selectedUids.update(sel => sel.filter(u => !set.has(u)));
}

/** Insert a waypoint before index `beforeIndex`, copying the settings of the leg it splits. */
export function insertWaypoint(beforeIndex: number, lat: number, lon: number): void {
    updateRoute(r => {
        const next = r.waypoints[beforeIndex];
        const wp = newWaypoint(lat, lon, next?.legType ?? r.defaultLegType);
        if (next) {
            wp.speed = next.speed;
            wp.allowance = next.allowance;
            wp.rpm = next.rpm;
            wp.engineSpeed = next.engineSpeed;
            wp.zoneMin = next.zoneMin;
        }
        r.waypoints.splice(beforeIndex, 0, wp);
        selectedUids.set([wp.uid]);
    });
}

/** Current at a time from the map-layer readings (nearest reading within 3 h). */
function currentFrom(sweep: Map<number, Partial<WxPoint>>, t: number): Current | null {
    const best = nearestSweep(sweep, t, 'currentKn');
    return best && best.currentKn != null && best.currentSet != null ? { kn: best.currentKn, set: best.currentSet } : null;
}

/**
 * The plan used everywhere: stepped along the route with weather loss, currents and planned
 * stops (weather only once it has been fetched for this route and these times).
 */
export const sim = derived(
    [route, vessel, basePlan, wxSeries, wxSweepValid, wxPlanKey, planKey],
    ([$route, $vessel, $base, $series, $sweep, $wxKey, $key]): SimResult => {
        const wxOk = $series.length > 0 && $wxKey === $key;
        return simulate($route, $base, $vessel, {
            wx: (p, t) => (wxOk ? weatherAt($series, p, t) : null),
            current: (_p, t) => ($route.useCurrents && wxOk ? currentFrom($sweep, t) : null),
        });
    },
);

export const plan = derived(sim, $sim => $sim.plan);

// ---------- Route comparison ----------

export interface SavedRoute {
    id: string;
    route: Route;
    color: string;
    show: boolean;
}

const CMP_KEY = 'windy-plugin-passage-plan:compare:v1';
export const COMPARE_COLORS = ['#00e5ff', '#ffd400', '#7CFC00', '#ff8c00', '#da70d6', '#ff6b6b', '#ffffff', '#4169e1'];

function loadCompare(): SavedRoute[] {
    try {
        const s = localStorage.getItem(CMP_KEY);
        return s ? (JSON.parse(s) as SavedRoute[]) : [];
    } catch {
        return [];
    }
}

/** Routes kept for comparison (saved in this browser) */
export const savedRoutes = writable<SavedRoute[]>(loadCompare());
savedRoutes.subscribe(list => {
    try {
        localStorage.setItem(CMP_KEY, JSON.stringify(list));
    } catch {
        /* storage full or blocked: the list simply won't be remembered */
    }
});
/** Which comparison entry the Route tab's route was opened from (to save changes back) */
export const activeCompareId = writable<string | null>(null);
/** Weather fetched per compared route (kept in memory only) */
export const compareWx = writable<Map<string, { series: WxSeries[]; sweep: Map<number, Partial<WxPoint>> }>>(new Map());
/** Compare all routes with the same ETD (null = each route's own ETD) */
export const compareEtd = writable<number | null>(null);

export function addToCompare(r: Route): string {
    const id = `cmp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    savedRoutes.update(list => {
        const used = new Set(list.map(x => x.color));
        const color = COMPARE_COLORS.find(c => !used.has(c)) ?? COMPARE_COLORS[list.length % COMPARE_COLORS.length];
        return [...list, { id, route: JSON.parse(JSON.stringify(r)) as Route, color, show: true }];
    });
    return id;
}

// ---------- Long jobs (forecast, reading currents / visibility) ----------

export interface WorkStep {
    label: string;
    done: number;
    total: number;
}
export interface Work {
    title: string;
    steps: WorkStep[];
    signal: { cancelled: boolean };
    /** Why the job is waiting (e.g. the Windy tab is hidden), or null */
    paused?: string | null;
}
/** The job running now (shown as a progress window over the map), or null */
export const work = writable<Work | null>(null);

export function workStart(title: string, labels: string[], signal: { cancelled: boolean }): void {
    work.set({ title, signal, steps: labels.map(label => ({ label, done: 0, total: 0 })) });
}
export function workProgress(label: string, done: number, total: number): void {
    work.update(w => (w ? { ...w, steps: w.steps.map(s => (s.label === label ? { ...s, done, total } : s)) } : w));
}
export function workPaused(why: string | null): void {
    work.update(w => (w ? { ...w, paused: why } : w));
}
export function workEnd(): void {
    work.set(null);
}

/** Which IMO warnings the polar diagram shows (all are still checked and listed elsewhere) (owner, 2026-10-28) */
const POLAR_KEY = 'windy-plugin-passage-plan:polarshow';
export const polarShow = writable<Record<'parametric' | 'synchronous' | 'highWaves' | 'surf', boolean>>(
    (() => {
        const d = { parametric: true, synchronous: true, highWaves: true, surf: true };
        try {
            return { ...d, ...JSON.parse(localStorage.getItem(POLAR_KEY) ?? '{}') };
        } catch {
            return d;
        }
    })(),
);
polarShow.subscribe(v => {
    try {
        localStorage.setItem(POLAR_KEY, JSON.stringify(v));
    } catch {
        /* not remembered */
    }
});

/** Polar diagram: also show pale zones where higher waves would warn (owner, 2026-10-28: off by default, clearer) */
const PALE_KEY = 'windy-plugin-passage-plan:polarpale';
export const polarPale = writable<boolean>(
    (() => {
        try {
            return localStorage.getItem(PALE_KEY) === '1';
        } catch {
            return false;
        }
    })(),
);
polarPale.subscribe(v => {
    try {
        localStorage.setItem(PALE_KEY, v ? '1' : '0');
    } catch {
        /* not remembered */
    }
});

/** A setting saved on its own in this browser (2026-11-02 additions) */
function persisted<T>(key: string, initial: T): Writable<T> {
    let v = initial;
    try {
        const s = localStorage.getItem(`windy-plugin-passage-plan:${key}`);
        if (s != null) {
            const j = JSON.parse(s);
            v = typeof initial === 'object' && initial && typeof j === 'object' && j ? ({ ...initial, ...j } as T) : typeof j === typeof initial ? (j as T) : initial;
        }
    } catch {
        /* storage blocked */
    }
    const w = writable<T>(v);
    w.subscribe(x => {
        try {
            localStorage.setItem(`windy-plugin-passage-plan:${key}`, JSON.stringify(x));
        } catch {
            /* storage blocked */
        }
    });
    return w;
}

/** Fill the times Windy does not cover (past, or beyond the user's Windy plan) from Open-Meteo, free (point 6) */
export const freeForecast = persisted<boolean>('freeForecast', true);
/** Nautical chart overlay (OpenSeaMap seamarks) on the map (point 7) */
export interface ChartLayers {
    seamarks: boolean;
    opacity: number;
    /** Depth shading from GEBCO (experimental) */
    depth: boolean;
}
export const chartLayers = persisted<ChartLayers>('chartLayers', { seamarks: false, opacity: 1, depth: false });
/** Ports, canals and distances on the map (point 8) */
export interface PlacesLayers {
    ports: boolean;
    canals: boolean;
    tss: boolean;
}
export const placesLayers = persisted<PlacesLayers>('placesLayers', { ports: false, canals: false, tss: true });

/** Panel brightness for the wheelhouse at night (UI overhaul 2026-11-02): dim = softer text and accents */
export const panelDim = persisted<boolean>('panelDim', false);

/**
 * Phone screen (owner, 2026-11-02): Windy shows plugins full screen on phones, so the floating ship and graph
 * windows would cover the panel. True when the screen is 600 px wide or less.
 */
export const phone = readable(false, set => {
    try {
        const mq = window.matchMedia('(max-width: 600px)');
        set(mq.matches);
        const on = () => set(mq.matches);
        mq.addEventListener?.('change', on);
        return () => mq.removeEventListener?.('change', on);
    } catch {
        return () => {};
    }
});

/** Weather under the cursor bar at the top of the map (owner, 2026-11-02): on by default, can be minimised / closed */
export const cursorBar = persisted<{ on: boolean; min: boolean }>('cursorBar', { on: true, min: false });
/** Range rings around the ship at the map time (owner, 2026-11-02): 3 rings, spacing follows the map scale */
export const rangeRings = persisted<boolean>('rangeRings', true);
/** Live polar from the phone's GPS (owner, 2026-11-02): heading typed in (GPS gives only the course over ground),
 *  speed from GPS or typed in */
export const liveSettings = persisted<{ heading: number; speedMode: 'gps' | 'manual'; manualSpeed: number }>('liveSettings', { heading: 0, speedMode: 'gps', manualSpeed: 12 });
