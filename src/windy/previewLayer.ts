// Optimised route versions drawn on the map before one is taken: dashed lines, one colour each
// (kept clear of the amber / red used for warnings). Uses Windy's global Leaflet `L`.

import { map } from '@windy/map';

import { legPolyline } from '../lib/geo';
import type { RouteVersion } from '../lib/optimisePlan';

export const PREVIEW_COLORS: Record<string, string> = { planned: '#ffffff', optimised: '#39ff14', GC: '#00e5ff', RL: '#da70d6', composite: '#4f8cff' };

let lines: L.Layer[] = [];
let hidden = new Set<string>();

export function showPreview(versions: RouteVersion[], hide: Set<string> = hidden): void {
    hidden = hide;
    for (const l of lines) l.remove();
    lines = [];
    for (const v of versions) {
        if (v.id === 'planned' || hidden.has(v.id)) continue;
        const pts: [number, number][] = [];
        for (let i = 1; i < v.wps.length; i++) pts.push(...legPolyline(v.wps[i - 1], v.wps[i], v.wps[i].legType, 20));
        const line = L.polyline(pts, { color: PREVIEW_COLORS[v.id] ?? '#fff', weight: v.id === 'optimised' ? 3 : 2, dashArray: '6 6', opacity: 0.9, interactive: false });
        line.addTo(map);
        lines.push(line);
    }
}
