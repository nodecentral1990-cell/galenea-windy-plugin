// Usage heat map on Windy's map: one shaded 1° square per place the plugin was used (routes planned,
// positions sailed). Colour from pale to dark purple by how often. Uses Windy's global Leaflet `L`.

import { map } from '@windy/map';

let group: L.Layer[] = [];

/** Pale violet → deep purple (kept clear of the amber / red used for warnings) */
function colorFor(f: number): string {
    const a = [200, 190, 255];
    const b = [90, 20, 140];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',')})`;
}

export function showHeat(cells: Record<string, number>): number {
    hideHeat();
    const vals = Object.values(cells);
    const max = Math.max(1, ...vals);
    const make = (L as unknown as { polygon?: typeof L.polygon }).polygon ?? L.polyline;
    for (const [k, n] of Object.entries(cells)) {
        const [lat, lon] = k.split(',').map(Number);
        const f = Math.log(1 + n) / Math.log(1 + max);
        const poly = make(
            [
                [lat, lon],
                [lat + 1, lon],
                [lat + 1, lon + 1],
                [lat, lon + 1],
            ],
            { color: colorFor(f), weight: 0.5, fill: true, fillColor: colorFor(f), fillOpacity: 0.25 + 0.45 * f, interactive: false },
        );
        poly.addTo(map);
        group.push(poly);
    }
    return vals.length;
}

export function hideHeat(): void {
    for (const l of group) l.remove();
    group = [];
}
