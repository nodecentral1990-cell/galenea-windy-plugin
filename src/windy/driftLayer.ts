// Drift mode on the map (owner, 2026-11-26): the area the ship may drift into, one track per side to the weather
// (starboard side green, port side red), solid up to now and dashed ahead, a mark every 1 or 3 hours with the time every
// 3 hours, the master's fixes, a warning where land comes within the danger distance, and the ship at the map time.
// Only L.polyline, L.polygon and L.marker + L.divIcon (the building blocks proven in Windy; CLAUDE.md).
import { map } from '@windy/map';
import { get } from 'svelte/store';

import { pointAt } from '../lib/drift';
import { timelineTs } from '../state';
import { driftResult, driftSession, driftSettings, type DriftResult } from './driftJob';

type Lyr = { remove(): unknown };
let layers: Lyr[] = [];
let unsubs: (() => void)[] = [];
let raf = 0;
let logged = false;
/** Zoom to the drift as soon as its tracks are worked out (set by Start drift) */
let fitPending = false;
export const fitWhenReady = () => (fitPending = true);

export const SIDE_COLOR = { stbd: '#35d07f', port: '#ff5d5d' } as const;
export const SIDE_NAME = { stbd: 'starboard side to the weather', port: 'port side to the weather' } as const;

function clear(): void {
    for (const l of layers)
        try {
            l.remove();
        } catch {
            /* gone */
        }
    layers = [];
}

const hhmm = (t: number) => {
    const d = new Date(t);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
};

function icon(html: string, cls: string, size: [number, number], anchor: [number, number]) {
    return L.divIcon({ html, className: `pp-drift-ic ${cls}`, iconSize: size, iconAnchor: anchor });
}

function shipIcon(heading: number, color: string): string {
    return `<svg width="26" height="26" viewBox="-13 -13 26 26" style="transform:rotate(${heading}deg)"><path d="M0,-11 L5,-3 L5,9 L-5,9 L-5,-3 Z" fill="${color}" stroke="#0b1116" stroke-width="1.4"/></svg>`;
}

function draw(r: DriftResult | null): void {
    clear();
    if (!r) return;
    if (fitPending && r.tracks.some(t => t.pts.length > 1)) {
        fitPending = false;
        setTimeout(fitDrift, 0);
    }
    try {
        const s = get(driftSettings);
        const ses = get(driftSession);
        if (r.area.length > 2) layers.push(L.polygon(r.area as never, { color: '#ffd166', weight: 1, opacity: 0.6, fillColor: '#ffd166', fillOpacity: 0.16, dashArray: '4 4', interactive: false, className: 'pp-drift-area' }).addTo(map));
        // the master's fixes (and the start), joined
        const fixes = [ses.start, ...ses.fixes].filter(Boolean) as { lat: number; lon: number; t: number }[];
        if (fixes.length > 1) layers.push(L.polyline(fixes.map(f => [f.lat, f.lon]), { color: '#ffffff', weight: 2.5, opacity: 0.9, interactive: false }).addTo(map));
        fixes.forEach((f, i) =>
            layers.push(
                L.marker([f.lat, f.lon], {
                    icon: icon(`<span></span><b>${i === 0 ? 'Start' : 'Fix'} ${hhmm(f.t)}</b>`, 'pp-drift-fix', [10, 10], [5, 5]),
                    interactive: false,
                    keyboard: false,
                }).addTo(map),
            ),
        );
        for (const tr of r.tracks) {
            const c = SIDE_COLOR[tr.side];
            const past = tr.pts.filter(p => p.t <= r.now).map(p => [p.lat, p.lon]);
            const ahead = tr.pts.filter(p => p.t >= r.now - 10 * 60e3).map(p => [p.lat, p.lon]);
            if (past.length > 1) layers.push(L.polyline(past as never, { color: c, weight: 3, opacity: 0.95, interactive: false }).addTo(map));
            if (ahead.length > 1) layers.push(L.polyline(ahead as never, { color: c, weight: 3, opacity: 0.95, dashArray: '8 6', interactive: false }).addTo(map));
            const step = s.marksH * 3600e3;
            const first = Math.ceil(r.from.t / step) * step;
            for (let t = first; t <= r.until; t += step) {
                const p = pointAt(tr.pts, t);
                if (!p) break;
                const label = new Date(t).getUTCHours() % 3 === 0 && tr === r.tracks[0];
                layers.push(
                    L.marker([p.lat, p.lon], {
                        icon: icon(`<span style="background:${c}"></span>${label ? `<b>${hhmm(t)}</b>` : ''}`, 'pp-drift-dot', [8, 8], [4, 4]),
                        interactive: false,
                        keyboard: false,
                    }).addTo(map),
                );
            }
            if (tr.danger)
                layers.push(
                    L.marker([tr.danger.lat, tr.danger.lon], {
                        icon: icon(`<i>!</i><b>${tr.danger.nm.toFixed(1)} nm off land ${hhmm(tr.danger.t)}</b>`, 'pp-drift-warn', [18, 18], [9, 9]),
                        interactive: false,
                        keyboard: false,
                    }).addTo(map),
                );
            // the ship at the map time
            const at = pointAt(tr.pts, get(timelineTs));
            if (at)
                layers.push(
                    L.marker([at.lat, at.lon], { icon: icon(shipIcon(at.heading, c), 'pp-drift-ship', [26, 26], [13, 13]), interactive: false, keyboard: false, zIndexOffset: 500 }).addTo(map),
                );
        }
    } catch (e) {
        if (!logged) console.error('[galenea] drift on the map', e);
        logged = true;
    }
}

const later = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => draw(get(driftResult)));
};

export function startDriftLayer(): void {
    if (unsubs.length) return;
    css();
    unsubs = [driftResult.subscribe(later), timelineTs.subscribe(later), driftSettings.subscribe(later)];
}

export function stopDriftLayer(): void {
    for (const u of unsubs) u();
    unsubs = [];
    cancelAnimationFrame(raf);
    clear();
}

/** Zoom the map to the drift (start, fixes, tracks ahead) */
export function fitDrift(): void {
    const r = get(driftResult);
    if (!r) return;
    const pts = [...r.tracks.flatMap(t => t.pts.map(p => [p.lat, p.lon])), ...r.area];
    if (pts.length)
        try {
            map.fitBounds(pts as never, { padding: [40, 40], maxZoom: 10 } as never);
        } catch {
            /* the map is not ready */
        }
}

function css(): void {
    if (document.getElementById('pp-drift-css')) return;
    const st = document.createElement('style');
    st.id = 'pp-drift-css';
    st.textContent = `
.pp-drift-ic{background:none!important;border:0!important}
.pp-drift-ic b{position:absolute;left:12px;top:-6px;white-space:nowrap;font:600 11px/1.3 system-ui,sans-serif;color:#fff;background:rgba(12,18,24,.78);padding:1px 5px;border-radius:4px;pointer-events:none}
.pp-drift-dot span{display:block;width:8px;height:8px;border-radius:50%;border:1px solid #0b1116}
.pp-drift-fix span{display:block;width:10px;height:10px;background:#fff;border:2px solid #0b1116}
.pp-drift-warn i{display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#ff3b30;color:#fff;font:800 13px/1 system-ui;border:2px solid #fff}
.pp-drift-warn b{left:22px;top:0;background:#7a0d0d}
`;
    document.head.appendChild(st);
}
