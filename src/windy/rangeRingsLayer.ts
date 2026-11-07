// Range rings around the ship at the map time (owner, 2026-11-02). Drawn with L.polyline and L.marker + L.divIcon
// only (the building blocks proven in Windy, see CLAUDE.md), redrawn when the map scale or the ship moves.

import { map } from '@windy/map';
import { get } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { circlePoints, ringLabel, ringStep } from '../lib/rangeRings';
import { rangeRings } from '../state';

type Lyr = { remove(): unknown };
let layers: Lyr[] = [];
let center: { lat: number; lon: number } | null = null;
let running = false;
let unsub: (() => void) | null = null;
let errorLogged = false;

function clear(): void {
    for (const l of layers)
        try {
            l.remove();
        } catch {
            /* gone */
        }
    layers = [];
}

function draw(): void {
    clear();
    if (!center || !get(rangeRings)) return;
    try {
        const b = map.getBounds();
        const midLat = (b.getNorth() + b.getSouth()) / 2;
        const hNm = (b.getNorth() - b.getSouth()) * 60;
        const wNm = Math.abs(b.getEast() - b.getWest()) * 60 * Math.cos((midLat * Math.PI) / 180);
        const step = ringStep(Math.min(hNm, wNm));
        for (let k = 1; k <= 3; k++) {
            const r = step * k;
            const pts = circlePoints(center, r);
            layers.push(L.polyline(pts, { color: '#9fe7ff', weight: k === 3 ? 1.6 : 1.2, opacity: 0.85, dashArray: '6 6', interactive: false, className: 'pp-ring' }).addTo(map));
            // label at the top of each ring
            const top = pts[0];
            const icon = L.divIcon({ className: 'pp-ring-icon', html: `<span class="pp-ring-label">${ringLabel(r)}</span>`, iconSize: [60, 16], iconAnchor: [30, 8] });
            layers.push(L.marker(top, { icon, interactive: false, keyboard: false }).addTo(map));
        }
    } catch (e) {
        if (!errorLogged) logEvent('error', `Range rings: ${(e as Error).message}`);
        errorLogged = true;
    }
}

/** The ship's position at the map time (null = no ship shown: no rings) */
export function setRingCenter(p: { lat: number; lon: number } | null): void {
    const same = p && center && Math.abs(p.lat - center.lat) < 1e-4 && Math.abs(p.lon - center.lon) < 1e-4;
    if (same || (!p && !center)) return;
    center = p ? { lat: p.lat, lon: p.lon } : null;
    if (running) draw();
}

export function startRangeRings(): void {
    if (running) return;
    running = true;
    try {
        map.on('zoomend', draw);
        map.on('moveend', draw);
    } catch (e) {
        logEvent('error', `Range rings could not start: ${(e as Error).message}`);
    }
    unsub = rangeRings.subscribe(() => draw());
}

export function stopRangeRings(): void {
    running = false;
    try {
        map.off('zoomend', draw);
        map.off('moveend', draw);
    } catch {
        /* gone */
    }
    unsub?.();
    unsub = null;
    clear();
}
