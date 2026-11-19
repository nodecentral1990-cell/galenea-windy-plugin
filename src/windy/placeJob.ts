// Port weather and tides for a point (owner, 2026-11-13): the user picks a point on the map (or a port by name),
// the plugin fetches Windy's point forecast there (ECMWF + ECMWF-WAM; times Windy does not cover filled from
// Open-Meteo when that is switched on) and Open-Meteo's marine data (tide = model sea level, current, sea
// temperature, wind sea), then builds the hour-by-hour rows and day summaries (lib/placeWx). Every map call
// guarded (the plugin must always open).

import { map } from '@windy/map';
import { get, writable } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { buildPlace, marineFromJson, marineUrl, type Marine, type PlaceDay, type PlaceHour } from '../lib/placeWx';
import { ports, sphereNm } from '../lib/seaNet';
import { sourceAt } from '../lib/seriesMerge';
import type { TideTurn } from '../lib/tides';
import { forecastInfo, type WxSeries } from '../lib/weather';
import { fetchSeries } from './forecast';

const DAY = 86400_000;
export const PLACE_DAYS = 7;

export interface PlacePoint {
    lat: number;
    lon: number;
    /** Port name (from the port list or typed in), '' when not known */
    name: string;
    /** Nearest listed port when the point is not at one */
    nearest: { name: string; nm: number } | null;
}

export interface PlaceResult {
    point: PlacePoint;
    startDay: number;
    hours: PlaceHour[];
    days: PlaceDay[];
    turns: TideTurn[];
    tide: { ts: number[]; h: (number | null)[] } | null;
    /** Windy forecast run and fetch time, other sources */
    info: ReturnType<typeof forecastInfo>;
    stepH: number | null;
    marine: { ok: boolean; error: string; fetched: number | null };
    fetched: number;
}

const KEY = 'windy-plugin-passage-plan:place';
function loadPoint(): PlacePoint | null {
    try {
        const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
        return p && isFinite(p.lat) && isFinite(p.lon) ? p : null;
    } catch {
        return null;
    }
}
export const placePoint = writable<PlacePoint | null>(loadPoint());
placePoint.subscribe(p => {
    try {
        if (p) localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
        /* not remembered */
    }
});
export const placeData = writable<PlaceResult | null>(null);
export const placeStatus = writable('');
export const placeBusy = writable(false);
/** Waiting for a click on the map */
export const picking = writable(false);

/** The port at a point (within 15 nm), else the nearest listed port and its distance */
export function nameOf(lat: number, lon: number): { name: string; nearest: { name: string; nm: number } | null } {
    let best: { name: string; nm: number } | null = null;
    try {
        for (const p of ports()) {
            if (Math.abs(p.lat - lat) > 3) continue;
            const d = sphereNm({ lat, lon }, { lat: p.lat, lon: p.lon });
            if (!best || d < best.nm) best = { name: `${p.name} (${p.country})`, nm: d };
        }
    } catch {
        /* no port list */
    }
    return best && best.nm <= 15 ? { name: best.name, nearest: null } : { name: '', nearest: best && best.nm <= 300 ? best : null };
}

export function setPoint(lat: number, lon: number, name?: string): void {
    const lonW = ((((lon + 180) % 360) + 360) % 360) - 180;
    const n = nameOf(lat, lonW);
    placePoint.set({ lat, lon: lonW, name: name ?? n.name, nearest: name ? null : n.nearest });
    showMarker();
    logEvent('place', `Point chosen ${lat.toFixed(3)}, ${lonW.toFixed(3)}${name ?? n.name ? ` (${name ?? n.name})` : ''}`);
}

/** Arm the next click on the map (it does not add a waypoint) */
export function startPick(): void {
    picking.set(true);
    placeStatus.set('Click the place on the map…');
    try {
        (map.getContainer() as HTMLElement).style.cursor = 'crosshair';
    } catch {
        /* ignore */
    }
}
export function cancelPick(): void {
    picking.set(false);
    try {
        (map.getContainer() as HTMLElement).style.cursor = '';
    } catch {
        /* ignore */
    }
}
/** Called by the map's click handler first: true when the click was used to pick the place */
export function pickAt(lat: number, lon: number): boolean {
    if (!get(picking)) return false;
    cancelPick();
    setPoint(lat, lon);
    loadPlace().catch(() => {});
    return true;
}

// ---- marker on the map (L.marker + L.divIcon: proven in Windy) ----
let marker: L.Marker | null = null;
export function showMarker(): void {
    const p = get(placePoint);
    try {
        if (!p) return;
        if (!marker) {
            marker = L.marker([p.lat, p.lon], {
                icon: L.divIcon({ className: 'pp-pick-dot', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
                interactive: false,
                keyboard: false,
            }).addTo(map);
        } else marker.setLatLng([p.lat, p.lon]);
    } catch {
        /* the map can do without it */
    }
}
export function hideMarker(): void {
    try {
        marker?.remove();
    } catch {
        /* gone */
    }
    marker = null;
}

const marineCache = new Map<string, { at: number; m: Marine | null; err: string }>();
async function getMarine(lat: number, lon: number): Promise<{ m: Marine | null; err: string; at: number }> {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const c = marineCache.get(key);
    if (c && Date.now() - c.at < 3600e3) return c;
    let out: { m: Marine | null; err: string; at: number };
    try {
        const r = await fetch(marineUrl(lat, lon, PLACE_DAYS));
        if (!r.ok) {
            let why = `HTTP ${r.status}`;
            try {
                const j = (await r.json()) as { reason?: string };
                if (j?.reason) why += `: ${j.reason}`;
            } catch {
                /* no body */
            }
            throw new Error(why);
        }
        const m = marineFromJson(await r.json());
        out = { m, err: m ? '' : 'no marine data for this point', at: Date.now() };
    } catch (e) {
        out = { m: null, err: (e as Error).message, at: Date.now() };
    }
    marineCache.set(key, out);
    return out;
}

const iconAtOf = (s: WxSeries | null) => (t: number) => {
    if (!s?.icon?.length) return null;
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < s.ts.length; i++) {
        const d = Math.abs(s.ts[i] - t);
        if (d < bd) {
            bd = d;
            bi = i;
        }
    }
    return bd <= 3 * 3600e3 ? (s.icon[bi] ?? null) : null;
};

let seq = 0;
/** Fetch and build the port weather and tides for the chosen point */
export async function loadPlace(): Promise<void> {
    const p = get(placePoint);
    if (!p) {
        placeStatus.set('Choose a place first: pick it on the map or type a port name.');
        return;
    }
    const my = ++seq;
    placeBusy.set(true);
    placeStatus.set('Getting the forecast and the tide for this place…');
    const t0 = Date.now();
    const startDay = Math.floor(Date.now() / DAY) * DAY;
    try {
        const [series, marine] = await Promise.all([
            fetchSeries(p.lat, p.lon, 1, { start: startDay, end: startDay + PLACE_DAYS * DAY }).catch(() => null),
            getMarine(p.lat, p.lon),
        ]);
        if (my !== seq) return;
        const built = buildPlace(series, marine.m, p.lat, p.lon, startDay, PLACE_DAYS, iconAtOf(series), t => {
            const part = sourceAt(series, t);
            return part?.label ?? '';
        });
        const step = series && series.ts.length > 1 ? Math.round((series.ts[1] - series.ts[0]) / 3600e3) : null;
        placeData.set({
            point: p,
            startDay,
            ...built,
            tide: marine.m ? { ts: marine.m.ts, h: marine.m.seaLevel } : null,
            info: series ? forecastInfo([series]) : null,
            stepH: step,
            marine: { ok: !!marine.m, error: marine.err, fetched: marine.m ? marine.at : null },
            fetched: Date.now(),
        });
        const miss = [!series ? 'weather (Windy did not answer)' : '', !marine.m ? `tide, current and sea temperature (Open-Meteo: ${marine.err || 'no answer'})` : ''].filter(Boolean);
        placeStatus.set(miss.length ? `Done, but missing: ${miss.join('; ')}.` : `Done (${((Date.now() - t0) / 1000).toFixed(1)} s).`);
        logEvent('place', `Port weather: ${series ? 'weather ok' : 'no weather'}, ${marine.m ? 'marine ok' : `no marine (${marine.err})`}`, { lat: p.lat, lon: p.lon });
    } catch (e) {
        if (my !== seq) return;
        placeStatus.set(`Could not get the weather for this place: ${(e as Error).message}`);
        logEvent('error', `Port weather failed: ${(e as Error).message}`);
    } finally {
        if (my === seq) placeBusy.set(false);
    }
}

/** Where the numbers come from and when they were fetched (screen and PDF) */
export function placeSources(d: PlaceResult): string[] {
    const hm = (t: number) => new Date(t).toISOString().slice(11, 16);
    const out: string[] = [];
    if (d.info) out.push(`Weather: Windy ${d.info.air} · waves ${d.info.waves} · fetched ${d.info.fetched}${d.stepH === 3 ? ' · 3-hourly, hours in between worked out' : ''}${d.info.other.length ? ` · also ${d.info.other.join('; ')}` : ''}`);
    else out.push('Weather: not available (Windy did not answer)');
    out.push(d.marine.ok && d.marine.fetched ? `Tide, current, sea temperature: Open-Meteo marine (Météo-France model, about 8 km; CC BY 4.0), fetched ${hm(d.marine.fetched)} UTC` : `Tide, current, sea temperature: not available (${d.marine.error || 'Open-Meteo did not answer'})`);
    out.push('Sun and moon: worked out by the plugin');
    return out;
}
