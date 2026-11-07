// Weather under the cursor (owner, 2026-11-02): wherever the mouse rests on the map, the weather there at Windy's map
// time, in a bar at the top of the map. Data: Windy point forecast (ECMWF + ECMWF-WAM) for the nearest 0.25° point
// (kept, so moving back and forth costs nothing); currents / visibility only when Windy's map shows that layer.
// Every map call is guarded (the plugin must always open, see CLAUDE.md).

import { map } from '@windy/map';
import store from '@windy/store';
import { getLatLonInterpolator } from '@windy/interpolator';
import { get, writable } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { MS_TO_KN, sampleSeries, type WxPoint } from '../lib/weather';
import { timelineTs } from '../state';
import { fetchSeries } from './forecast';

export interface CursorWx {
    lat: number;
    lon: number;
    /** The forecast point used (0.25° grid) */
    cell: { lat: number; lon: number } | null;
    wx: WxPoint | null;
    /** Map time the values are for */
    t: number;
    status: 'idle' | 'loading' | 'ok' | 'none' | 'error';
    /** Forecast run, if known */
    run?: string;
    /** From Windy's map layer, when it shows currents / visibility */
    currentKn?: number | null;
    currentSet?: number | null;
    visNm?: number | null;
}

export const cursorPos = writable<{ lat: number; lon: number } | null>(null);
export const cursorWx = writable<CursorWx | null>(null);

const CELL = 0.25;
const REST_MS = 300;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
let last: { lat: number; lon: number } | null = null;
let running = false;
let unsubTime: (() => void) | null = null;

const snap = (v: number) => Math.round(v / CELL) * CELL;
const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

async function readLayer(lat: number, lon: number): Promise<Partial<CursorWx>> {
    const overlay = store.get('overlay') as string;
    if (overlay !== 'currents' && overlay !== 'visibility') return {};
    try {
        const interp = await getLatLonInterpolator();
        const raw = interp ? await Promise.resolve(interp({ lat, lon })) : null;
        const v = Array.isArray(raw) ? (raw as number[]) : null;
        if (!v) return {};
        // ASSUMPTIONS (as in the route reading): visibility = metres; currents = east / north m/s
        if (overlay === 'visibility' && isFinite(v[0]) && v[0] >= 0) return { visNm: v[0] / 1852 };
        if (overlay === 'currents' && isFinite(v[0]) && isFinite(v[1])) return { currentKn: Math.hypot(v[0], v[1]) * MS_TO_KN, currentSet: ((Math.atan2(v[0], v[1]) * 180) / Math.PI + 360) % 360 };
    } catch {
        /* layer not readable */
    }
    return {};
}

async function load(lat: number, lon: number): Promise<void> {
    const my = ++seq;
    const t = get(timelineTs);
    const cell = { lat: snap(lat), lon: wrapLon(snap(lon)) };
    cursorWx.update(c => ({ ...(c ?? { lat, lon, wx: null }), lat, lon, cell, t, status: 'loading' }) as CursorWx);
    try {
        const s = await fetchSeries(cell.lat, cell.lon, 3);
        if (my !== seq) return;
        const wx = sampleSeries(s, t);
        const layer = await readLayer(lat, lon);
        if (my !== seq) return;
        cursorWx.set({ lat, lon, cell, t, wx, status: wx ? 'ok' : 'none', run: s.refTime, ...layer });
    } catch (e) {
        if (my !== seq) return;
        cursorWx.set({ lat, lon, cell, t, wx: null, status: 'error' });
        logEvent('error', `Weather under the cursor: ${(e as Error).message}`);
    }
}

function onMove(e: { latlng?: { lat: number; lng: number } }): void {
    if (!e?.latlng) return;
    const p = { lat: e.latlng.lat, lon: wrapLon(e.latlng.lng) };
    last = p;
    cursorPos.set(p);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => last && load(last.lat, last.lon), REST_MS);
}

export function startCursorWx(): void {
    if (running) return;
    running = true;
    try {
        map.on('mousemove', onMove as never);
    } catch (e) {
        logEvent('error', `Weather under the cursor could not start: ${(e as Error).message}`);
    }
    // a new map time: read again where the cursor last rested
    unsubTime = timelineTs.subscribe(() => last && get(cursorWx) && load(last.lat, last.lon));
}

export function stopCursorWx(): void {
    if (!running) return;
    running = false;
    try {
        map.off('mousemove', onMove as never);
    } catch {
        /* already gone */
    }
    unsubTime?.();
    unsubTime = null;
    if (timer) clearTimeout(timer);
    cursorPos.set(null);
    cursorWx.set(null);
}
