// Map drawing for point 8 (owner, 2026-11-02): ports (approximate positions), canals / straits, and the
// distance lines of the Distances table: great circle (dashed), rhumb line (dotted), along the sea lanes (solid).
// Pilot boarding places and traffic separation schemes are drawn by the OpenSeaMap layer where mapped.
//
// 0.23.2 (owner's report: 0.23.1 did not open in Windy): only the map building blocks proven in Windy since 0.1
// (L.polyline, L.marker with L.divIcon) are used here: no extra panes, layer groups, circle markers or tooltips,
// which Windy's newer map may not support. Every drawing call is guarded so a failure cannot stop the plugin.

import { map } from '@windy/map';
import { get, writable } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { legPolyline } from '../lib/geo';
import { PASSAGES, ports, unwrapPath, type DistanceRow, type Port } from '../lib/seaNet';
import { placesLayers, type PlacesLayers } from '../state';

type Lyr = { remove(): unknown };
let portLayers: Lyr[] = [];
let passLayers: Lyr[] = [];
let distLayers: Lyr[] = [];

/** Distance rows drawn on the map */
export const shownDistances = writable<DistanceRow[]>([]);

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const clear = (l: Lyr[]) => {
    for (const x of l)
        try {
            x.remove();
        } catch {
            /* already gone */
        }
    return [] as Lyr[];
};
function guard(what: string, fn: () => void): void {
    try {
        fn();
    } catch (e) {
        logEvent('error', `${what}: ${(e as Error).message}`);
    }
}

/** A small round marker with a hover text (plain HTML: works on every map Windy uses) */
function dot(lat: number, lon: number, title: string, cls: string, label = ''): Lyr {
    const icon = L.divIcon({
        className: 'pp-place-icon',
        html: `<div class="pp-place-dot ${cls}" title="${esc(title)}"></div>${label ? `<div class="pp-place-label">${esc(label)}</div>` : ''}`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
    });
    return L.marker([lat, lon], { icon, interactive: false, keyboard: false }).addTo(map);
}

const PORT_MIN_ZOOM = 4;

function drawPorts(): void {
    portLayers = clear(portLayers);
    if (!get(placesLayers).ports || map.getZoom() < PORT_MIN_ZOOM) return;
    const b = map.getBounds();
    let n = 0;
    for (const p of ports()) {
        if (!b.contains([p.lat, p.lon])) continue;
        if (++n > 400) break;
        portLayers.push(dot(p.lat, p.lon, `${p.name} (${p.code}), approximate position`, 'pp-place-dot--port', map.getZoom() >= 7 ? p.name : ''));
    }
}

function drawPassages(): void {
    passLayers = clear(passLayers);
    if (!get(placesLayers).canals) return;
    for (const ps of PASSAGES) {
        const ll = ps.points.map(q => [q.lat, q.lon] as [number, number]);
        if (ps.kind === 'canal') passLayers.push(L.polyline(ll, { color: '#00b3a4', weight: 5, opacity: 0.85, interactive: false }).addTo(map));
        passLayers.push(dot(ll[0][0], ll[0][1], `${ps.name}${ps.lengthNote ? `: ${ps.lengthNote}` : ''} (approximate position)`, 'pp-place-dot--pass', ps.name));
    }
}

/** Draw the distance rows: GC dashed, RL dotted, sea lanes solid, with the ports marked */
export function drawDistances(rows: DistanceRow[], ends: { a: Port | { lat: number; lon: number; name: string }; b: Port | { lat: number; lon: number; name: string } }[]): void {
    guard('Distances on the map', () => {
        distLayers = clear(distLayers);
        if (!rows.length) return;
        const all: [number, number][] = [];
        rows.forEach((r, i) => {
            const e = ends[i];
            if (!e) return;
            const gc = legPolyline(e.a, e.b, 'GC');
            const rl = legPolyline(e.a, e.b, 'RL');
            distLayers.push(L.polyline(gc, { color: '#ffd400', weight: 2, dashArray: '8 6', interactive: false, className: 'pp-dist pp-dist--gc' }).addTo(map));
            distLayers.push(L.polyline(rl, { color: '#ff8fd0', weight: 2, dashArray: '2 5', interactive: false, className: 'pp-dist pp-dist--rl' }).addTo(map));
            if (r.sea) {
                const p = unwrapPath(r.sea.path);
                distLayers.push(L.polyline(p, { color: '#38e1ff', weight: 3, opacity: 0.95, interactive: false, className: 'pp-dist pp-dist--sea' }).addTo(map));
                all.push(...p);
            }
            for (const q of [e.a, e.b]) distLayers.push(dot(q.lat, q.lon, q.name, 'pp-place-dot--end', q.name));
            all.push(...gc);
        });
        if (all.length) {
            const lats = all.map(p => p[0]);
            const lons = all.map(p => p[1]);
            map.fitBounds(
                [
                    [Math.min(...lats), Math.min(...lons)],
                    [Math.max(...lats), Math.max(...lons)],
                ],
                { padding: [40, 40], maxZoom: 7 } as never,
            );
        }
    });
}

export function clearDistances(): void {
    distLayers = clear(distLayers);
}

let unsub: (() => void) | null = null;
const redraw = () => guard('Ports on the map', drawPorts);

export function startPlaces(): void {
    if (unsub) return;
    unsub = placesLayers.subscribe((_: PlacesLayers) => {
        guard('Ports on the map', drawPorts);
        guard('Canals on the map', drawPassages);
    });
    map.on('moveend', redraw);
}

export function stopPlaces(): void {
    unsub?.();
    unsub = null;
    map.off('moveend', redraw);
    portLayers = clear(portLayers);
    passLayers = clear(passLayers);
    distLayers = clear(distLayers);
}
