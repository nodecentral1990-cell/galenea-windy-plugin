// The weather area on the map (owner, 2026-11-19): a dashed box from north / south latitude and west / east
// longitude. L.polyline only (proven in Windy), guarded: the plugin must always open.

import { map } from '@windy/map';

import { areaWidth, type WxArea } from '../lib/weather';
import { wxAuto } from './weatherJobs';

let box: L.Polyline | null = null;
let unsub: (() => void) | null = null;

function draw(a: WxArea | null, on: boolean): void {
    try {
        box?.remove();
        box = null;
        if (!a || !on) return;
        const w = areaWidth(a);
        const pts: [number, number][] = [];
        const n = Math.max(2, Math.ceil(w / 2));
        for (let i = 0; i <= n; i++) pts.push([a.n, a.w + (w * i) / n]);
        for (let i = n; i >= 0; i--) pts.push([a.s, a.w + (w * i) / n]);
        pts.push(pts[0]);
        box = L.polyline(pts, { color: '#ffd400', weight: 1.5, dashArray: '6 5', interactive: false, className: 'pp-wx-area' }).addTo(map);
    } catch {
        /* the map can do without it */
    }
}

export function startAreaLayer(): void {
    stopAreaLayer();
    unsub = wxAuto.subscribe(v => draw(v.area, v.areaOn));
}
export function stopAreaLayer(): void {
    unsub?.();
    unsub = null;
    draw(null, false);
}
