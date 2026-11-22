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
/** Names drawn at the Distances end points (port names give way to them) */
let distEnds: { lat: number; lon: number; name: string }[] = [];

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

/** Zoom from which the port names are written next to the dots */
const PORT_LABEL_ZOOM = 6;

/**
 * Ports in view (owner's report 2026-11-22: "port names and dot for the port location are overlapping"): the dot is a
 * small ring (Windy's own town names stay readable through it), our name sits to the right of it on a dark label, and
 * a dot or name that would fall on one already drawn is left out (zoom in to see it).
 */
function drawPorts(): void {
    portLayers = clear(portLayers);
    if (!get(placesLayers).ports || map.getZoom() < PORT_MIN_ZOOM) return;
    const b = map.getBounds();
    const z = map.getZoom();
    const named = z >= PORT_LABEL_ZOOM;
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
    // the canal / strait names and the Distances end points are drawn anyway: ports give way to them
    const fixed = [...(get(placesLayers).canals ? PASSAGES.map(ps => ({ lat: ps.points[0].lat, lon: ps.points[0].lon, name: ps.name })) : []), ...distEnds];
    for (const f of fixed) {
        try {
            const q = map.latLngToContainerPoint([f.lat, f.lon]);
            taken.push({ x0: q.x - 11, y0: q.y - 10, x1: q.x + 16 + f.name.length * 6.2, y1: q.y + 10 });
        } catch {
            /* not on screen */
        }
    }
    const hits = (r: { x0: number; y0: number; x1: number; y1: number }) => taken.some(t => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0);
    let n = 0;
    for (const p of ports()) {
        if (!b.contains([p.lat, p.lon])) continue;
        let xy: { x: number; y: number };
        try {
            xy = map.latLngToContainerPoint([p.lat, p.lon]);
        } catch {
            xy = { x: n * 20, y: 0 };
        }
        const dotBox = { x0: xy.x - 5, y0: xy.y - 5, x1: xy.x + 5, y1: xy.y + 5 };
        if (hits(dotBox)) continue;
        // the name: about 6.2 px a letter at 11 px, starting 9 px right of the dot
        const lab = named ? { x0: xy.x + 8, y0: xy.y - 8, x1: xy.x + 14 + p.name.length * 6.2, y1: xy.y + 8 } : null;
        const showName = !!lab && !hits(lab);
        taken.push(dotBox);
        if (showName && lab) taken.push(lab);
        if (++n > 400) break;
        portLayers.push(dot(p.lat, p.lon, `${p.name} (${p.code}), approximate position`, 'pp-place-dot--port', showName ? p.name : ''));
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
        distEnds = [];
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
            for (const q of [e.a, e.b]) {
                distLayers.push(dot(q.lat, q.lon, q.name, 'pp-place-dot--end', q.name));
                distEnds.push({ lat: q.lat, lon: q.lon, name: q.name });
            }
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
    distEnds = [];
    redraw();
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
