// "Now" (owner, 2026-10-29): one click sets Windy's forecast time to the computer's present time (UTC)
// and puts the ship in the middle of the map, so the map, the ship window, the graphs and the tables
// all show the present.

import store from '@windy/store';
import { map } from '@windy/map';
import { get } from 'svelte/store';
import { plan, route } from '../state';
import { positionAt } from '../lib/model';
import { logEvent } from '../lib/activityLog';

/** Where the ship is at `t`: on the plan, else the start (before ETD) or the end (after ETA) of the route */
export function shipAtTime(t: number): { lat: number; lon: number } | null {
    const r = get(route);
    const p = get(plan);
    if (!r.waypoints.length) return null;
    if (p.etd != null && p.eta != null && t >= p.etd && t <= p.eta) {
        const pos = positionAt(r, p, t);
        if (pos) return pos;
    }
    if (p.fix && (p.etd == null || t < p.etd)) return { lat: p.fix.lat, lon: p.fix.lon };
    const w = p.eta != null && t > p.eta ? r.waypoints[r.waypoints.length - 1] : r.waypoints[0];
    return { lat: w.lat, lon: w.lon };
}

export function goToNow(): void {
    const t = Date.now();
    store.set('timestamp', t);
    const pos = shipAtTime(t);
    if (pos) map.panTo([pos.lat, pos.lon], { animate: true, duration: 0.4 });
    logEvent('now', 'Now: map set to the present time');
}
