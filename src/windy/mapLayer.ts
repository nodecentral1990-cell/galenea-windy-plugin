// Everything the plugin draws on Windy's map: legs, distance labels, waypoints
// (draggable, with a live position readout) and ship symbols.
// Uses Windy's global Leaflet GL `L` and the map from @windy/map.

import { map } from '@windy/map';

import { fmtLat, fmtLon, fmtTime } from '../lib/format';
import { legPolyline } from '../lib/geo';
import type { PlanCalc, Route, ShipPosition } from '../lib/model';
import { glyphSvg, GLYPH_SIZE, type FlagColors, type ShipGlyph } from '../lib/shipGlyph';
import { shipSymbolSize, shipSymbolSvg, type ShipStyle } from '../lib/shipSymbols';

export interface LayerCallbacks {
    /** Waypoint dragged. `final` is false while dragging, true on release */
    onMove(uid: string, lat: number, lon: number, final: boolean): void;
    /** Insert a waypoint before waypoint `beforeIndex` (click or right-click on a leg) */
    onInsert(beforeIndex: number, lat: number, lon: number): void;
    /** Waypoint clicked. `additive` = Ctrl/⌘ held (multi-select) */
    onSelect(uid: string, additive: boolean): void;
    /** Click on empty map (used in "add waypoints" mode) */
    onMapClick(lat: number, lon: number): void;
    /** Right-click on a waypoint, at screen position x, y */
    onWaypointMenu(uid: string, x: number, y: number): void;
    /** Right-click on a leg: offer to insert before waypoint `beforeIndex` */
    onLegMenu(beforeIndex: number, lat: number, lon: number, x: number, y: number): void;
    /** Whether a plain click on a leg inserts a waypoint */
    legClickInserts(): boolean;
    /** A ship symbol was clicked: its planned time */
    onShipClick(time: number): void;
}

type Handler = (e: unknown) => void;

const LEG_COLOR = '#ff2d95';
/** Default colour of the part of the track already sailed */
const DONE_COLOR = '#9e9e9e';
/** How close (screen pixels) a click must be to a leg or waypoint to count as on it */
const HIT_PX = 10;
/** Minimum screen distance between ships that show weather arrows */
const GLYPH_GAP_PX = 90;


const isAdditive = (ev: MouseEvent | undefined) => !!ev && (ev.ctrlKey || ev.metaKey);

export class RouteLayer {
    private lines: L.Polyline[] = [];
    private labels: L.Marker[] = [];
    private wpMarkers = new Map<string, L.Marker>();
    private wpIconKey = new Map<string, string>();
    private ships: L.Marker[] = [];
    private nowShip: L.Marker | null = null;
    private readout: L.Marker | null = null;
    private dragging: string | null = null;
    private legPts: [number, number][][] = [];
    private legTexts: string[] = [];
    private wpPts: { uid: string; lat: number; lon: number }[] = [];
    private onView: Handler;
    private onClick: Handler;
    private onContext: Handler;
    private raf = 0;
    private land = new Set<string>();
    private lastShips: Parameters<RouteLayer['renderShips']> | null = null;
    private compareLines: L.Layer[] = [];

    constructor(private cb: LayerCallbacks) {
        this.onView = () => {
            this.placeLabels();
            if (this.lastShips) this.renderShips(...this.lastShips);
        };
        // Clicks on legs are found by distance on screen, not by events on the drawn line:
        // Windy notes that clicks over plugin-drawn shapes are unreliable with its new map engine.
        this.onClick = (e: unknown) => {
            const ev = e as L.LeafletMouseEvent;
            const leg = this.legAt(ev.containerPoint);
            if (leg && this.cb.legClickInserts()) {
                this.cb.onInsert(leg.beforeIndex, ev.latlng.lat, ev.latlng.lng);
                return;
            }
            this.cb.onMapClick(ev.latlng.lat, ev.latlng.lng);
        };
        this.onContext = (e: unknown) => {
            const ev = e as L.LeafletMouseEvent;
            const wp = this.waypointAt(ev.containerPoint);
            const oe = ev.originalEvent;
            if (wp) {
                oe?.preventDefault?.();
                this.cb.onWaypointMenu(wp, oe?.clientX ?? 0, oe?.clientY ?? 0);
                return;
            }
            const leg = this.legAt(ev.containerPoint);
            if (leg) {
                oe?.preventDefault?.();
                this.cb.onLegMenu(leg.beforeIndex, ev.latlng.lat, ev.latlng.lng, oe?.clientX ?? 0, oe?.clientY ?? 0);
            }
        };
        map.on('moveend', this.onView);
        map.on('zoomend', this.onView);
        map.on('click', this.onClick);
        map.on('contextmenu', this.onContext);
    }

    /** Waypoint under a screen point, if any. */
    private waypointAt(p: L.Point): string | null {
        let best: string | null = null;
        let bd = HIT_PX + 2;
        for (const w of this.wpPts) {
            const q = map.latLngToContainerPoint([w.lat, w.lon]);
            const d = Math.hypot(q.x - p.x, q.y - p.y);
            if (d < bd) {
                bd = d;
                best = w.uid;
            }
        }
        return best;
    }

    /** Leg under a screen point, if any (and not on top of a waypoint). */
    private legAt(p: L.Point): { beforeIndex: number } | null {
        if (this.waypointAt(p)) return null;
        let best: number | null = null;
        let bd = HIT_PX;
        this.legPts.forEach((pts, li) => {
            for (let i = 1; i < pts.length; i++) {
                const a = map.latLngToContainerPoint([pts[i - 1][0], pts[i - 1][1]]);
                const b = map.latLngToContainerPoint([pts[i][0], pts[i][1]]);
                const d = segDist(p.x, p.y, a.x, a.y, b.x, b.y);
                if (d < bd) {
                    bd = d;
                    best = li;
                }
            }
        });
        return best == null ? null : { beforeIndex: best + 1 };
    }

    /** Draw or update the route. Keeps the marker being dragged untouched. */
    render(route: Route, plan: PlanCalc, selected: string[], land: Set<string> = new Set(), doneNm: number | null = null): void {
        this.land = land;
        this.clearLines();
        const color = route.color || LEG_COLOR;
        const doneColor = route.doneColor || DONE_COLOR;
        const wps = route.waypoints;
        this.legPts = [];
        this.legTexts = [];
        this.wpPts = wps.map(w => ({ uid: w.uid, lat: w.lat, lon: w.lon }));
        for (let i = 1; i < wps.length; i++) {
            const pts = legPolyline(wps[i - 1], wps[i], wps[i].legType);
            this.legPts.push(pts);
            const leg = plan.legs[i - 1];
            const fix = plan.fix && plan.fix.legIdx === i - 1 ? plan.fix : null;
            this.legTexts.push(
                fix ? `${(leg.distNm - fix.sNm).toFixed(1)} nm from PP${wps[i].legType === 'GC' ? ' GC' : ''}` : `${leg ? leg.distNm.toFixed(1) : '?'} nm${wps[i].legType === 'GC' ? ' GC' : ''}`,
            );
            const dash = wps[i].legType === 'GC' ? '8 5' : null;
            const draw = (p: [number, number][], c: string, w = 2.5) => this.lines.push(L.polyline(p, { color: c, weight: w, dashArray: dash, interactive: false }).addTo(map));
            const start = leg ? leg.cumNm - leg.distNm : 0;
            if (fix) {
                // Leg with the present position: the planned leg stays as a thin dotted line; sailed part
                // up to the present position, and the track from there to the next waypoint
                this.lines.push(L.polyline(pts, { color, weight: 1.5, opacity: 0.45, dashArray: '2 5', interactive: false }).addTo(map));
                const [a, b] = splitLeg(leg, fix.sNm, pts[0][1]);
                draw(a, doneColor, 3.5);
                draw(b, color);
            } else if (doneNm == null || !leg || doneNm <= start) {
                draw(pts, color);
            } else if (doneNm >= leg.cumNm) {
                draw(pts, doneColor, 3.5);
            } else {
                // split this leg at the point reached
                const [a, b] = splitLeg(leg, doneNm - start, pts[0][1]);
                draw(a, doneColor, 3.5);
                draw(b, color);
            }
        }
        const fx = plan.fix;
        if (fx) {
            const m = L.marker([fx.lat, fx.lon], {
                icon: L.divIcon({ className: 'pp-fix-icon', html: `<div class="pp-fix" title="Present position ${fmtTime(fx.t)} UTC">⊕</div><div class="pp-fix-label">PP ${fmtTime(fx.t)} UTC</div>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
                interactive: false,
            }).addTo(map);
            this.lines.push(m as unknown as L.Polyline);
        }
        this.renderWaypoints(route, new Set(selected));
        this.placeLabels();
    }

    /** Routes kept for comparison: thin lines in their own colours, with the name at the middle. */
    renderCompare(list: { name: string; color: string; waypoints: { lat: number; lon: number; legType: 'RL' | 'GC' }[] }[]): void {
        this.compareLines.forEach(l => l.remove());
        this.compareLines = [];
        for (const r of list) {
            const pts: [number, number][] = [];
            for (let i = 1; i < r.waypoints.length; i++) {
                const seg = legPolyline(r.waypoints[i - 1], r.waypoints[i], r.waypoints[i].legType);
                if (pts.length) {
                    // keep longitudes continuous across legs (antimeridian)
                    const shift = Math.round((pts[pts.length - 1][1] - seg[0][1]) / 360) * 360;
                    seg.forEach(p => (p[1] += shift));
                    seg.shift();
                }
                pts.push(...seg);
            }
            if (pts.length < 2) continue;
            this.compareLines.push(L.polyline(pts, { color: r.color, weight: 2, opacity: 0.9, dashArray: '2 6', lineCap: 'round', interactive: false }).addTo(map));
            const mid = pts[Math.floor(pts.length / 2)];
            const safe = r.name.replace(/[<>&"]/g, '');
            this.compareLines.push(
                L.marker(mid, {
                    icon: L.divIcon({ className: 'pp-cmp-label', html: `<span style="color:${r.color}">${safe}</span>`, iconSize: [0, 0], iconAnchor: [0, 0] }),
                    interactive: false,
                }).addTo(map),
            );
        }
    }

    private renderWaypoints(route: Route, selected: Set<string>): void {
        const seen = new Set<string>();
        route.waypoints.forEach((w, i) => {
            seen.add(w.uid);
            const sel = selected.has(w.uid);
            const onLand = this.land.has(w.uid);
            const key = `${i + 1}|${sel}|${onLand}`;
            let m = this.wpMarkers.get(w.uid);
            const icon = L.divIcon({
                className: 'pp-wp-icon',
                html: `${onLand ? '<div class="pp-land" title="This position is above sea level on Windy\'s elevation data: check the chart">⚠ land?</div>' : ''}<div class="pp-wp${sel ? ' pp-wp--sel' : ''}" title="WP${i + 1} ${w.name} (click: go to its time; right-click: options; Ctrl/⌘-click: select several)">${i + 1}</div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10],
            });
            if (!m) {
                m = L.marker([w.lat, w.lon], { icon, draggable: true, bubblingMouseEvents: false, zIndexOffset: 1000 }).addTo(map);
                this.bindMarker(m, w.uid);
                this.wpMarkers.set(w.uid, m);
                this.wpIconKey.set(w.uid, key);
            } else {
                if (this.dragging !== w.uid) {
                    const ll = m.getLatLng();
                    if (Math.abs(ll.lat - w.lat) > 1e-9 || Math.abs(ll.lng - w.lon) > 1e-9) {
                        m.setLatLng([w.lat, w.lon]);
                    }
                }
                // Never replace the icon of the marker being dragged: it would break the drag.
                if (this.wpIconKey.get(w.uid) !== key && this.dragging !== w.uid) {
                    m.setIcon(icon);
                    this.wpIconKey.set(w.uid, key);
                    this.bindDom(m, w.uid);
                }
            }
        });
        for (const [uid, m] of this.wpMarkers) {
            if (!seen.has(uid)) {
                m.remove();
                this.wpMarkers.delete(uid);
                this.wpIconKey.delete(uid);
            }
        }
    }

    /** Right-click directly on the waypoint symbol (works even if the map does not pass the event on). */
    private bindDom(m: L.Marker, uid: string): void {
        const el = m.getElement();
        if (!el || (el as HTMLElement & { _ppBound?: boolean })._ppBound) return;
        (el as HTMLElement & { _ppBound?: boolean })._ppBound = true;
        el.addEventListener('contextmenu', (ev: MouseEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            this.cb.onWaypointMenu(uid, ev.clientX, ev.clientY);
        });
    }

    private bindMarker(m: L.Marker, uid: string): void {
        this.bindDom(m, uid);
        m.on('click', (e: unknown) => this.cb.onSelect(uid, isAdditive((e as L.LeafletMouseEvent).originalEvent)));
        m.on('dragstart', () => {
            this.dragging = uid;
        });
        m.on('drag', () => {
            const ll = m.getLatLng();
            this.showReadout(ll.lat, ll.lng);
            cancelAnimationFrame(this.raf);
            this.raf = requestAnimationFrame(() => this.cb.onMove(uid, ll.lat, ll.lng, false));
        });
        m.on('dragend', () => {
            const ll = m.getLatLng();
            this.dragging = null;
            this.hideReadout();
            cancelAnimationFrame(this.raf);
            this.cb.onMove(uid, ll.lat, ll.lng, true);
            this.cb.onSelect(uid, false);
        });
    }

    private showReadout(lat: number, lon: number): void {
        const html = `<div class="pp-readout">${fmtLat(lat)}<br>${fmtLon(lon)}</div>`;
        const icon = L.divIcon({ className: 'pp-readout-icon', html, iconSize: [120, 34], iconAnchor: [-14, 40] });
        if (!this.readout) {
            this.readout = L.marker([lat, lon], { icon, interactive: false, zIndexOffset: 2000 }).addTo(map);
        } else {
            this.readout.setLatLng([lat, lon]);
            this.readout.setIcon(icon);
        }
    }

    private hideReadout(): void {
        this.readout?.remove();
        this.readout = null;
    }

    /**
     * Put each leg's distance label in the middle of the part of the leg that is on screen,
     * parallel to the leg, just above it. Hidden if the leg is off screen or too short on screen.
     */
    placeLabels(): void {
        this.labels.forEach(l => l.remove());
        this.labels = [];
        const size = map.getSize();
        const W = size.x;
        const H = size.y;
        const margin = 20;
        this.legPts.forEach((pts, li) => {
            const px = pts.map(p => map.latLngToContainerPoint([p[0], p[1]]));
            const segs: [L.Point, L.Point, number][] = [];
            let total = 0;
            for (let i = 1; i < px.length; i++) {
                const c = clip(px[i - 1], px[i], margin, margin, W - margin, H - margin);
                if (c) {
                    const len = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y);
                    segs.push([c[0], c[1], len]);
                    total += len;
                }
            }
            if (total < 60) {
                return;
            }
            let half = total / 2;
            for (const [a, b, len] of segs) {
                if (half <= len) {
                    const f = len > 0 ? half / len : 0;
                    const x = a.x + (b.x - a.x) * f;
                    const y = a.y + (b.y - a.y) * f;
                    let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
                    if (ang > 90) ang -= 180;
                    if (ang < -90) ang += 180;
                    const ll = map.containerPointToLatLng([x, y]);
                    const icon = L.divIcon({
                        className: 'pp-label-icon',
                        html: `<div class="pp-label" style="transform: translate(-50%, -100%) rotate(${ang.toFixed(1)}deg); transform-origin: 50% 100%;">${this.legTexts[li]}</div>`,
                        iconSize: [0, 0],
                        iconAnchor: [0, 0],
                    });
                    this.labels.push(L.marker(ll, { icon, interactive: false }).addTo(map));
                    return;
                }
                half -= len;
            }
        });
    }

    /** Ship symbols at each time step, plus the highlighted one at Windy's slider time. */
    /**
     * Ship symbols at each time step, plus the highlighted one at Windy's slider time.
     * `glyph(p)` may return weather to draw on the ship (swell/wave arrows and wind barb).
     */
    renderShips(
        positions: ShipPosition[],
        now: ShipPosition | null,
        zoneLabel: (p: ShipPosition) => string,
        glyph: (p: ShipPosition) => ShipGlyph | null = () => null,
        showArrows = true,
        style: ShipStyle = 'classic',
        colors: Partial<FlagColors> = {},
    ): void {
        this.lastShips = [positions, now, zoneLabel, glyph, showArrows, style, colors];
        const S = shipSymbolSize(style);
        const SN = shipSymbolSize(style, true);
        const G = GLYPH_SIZE;
        // Declutter: weather only on ships at least GLYPH_GAP_PX apart on screen (redone on zoom)
        let lastPt: L.Point | null = null;
        const roomFor = (p: ShipPosition) => {
            const q = map.latLngToContainerPoint([p.lat, p.lon]);
            if (lastPt && Math.hypot(q.x - lastPt.x, q.y - lastPt.y) < GLYPH_GAP_PX) return false;
            lastPt = q;
            return true;
        };
        const wx = (g: ShipGlyph | null, p: ShipPosition, shipSize: number, always = false) => {
            if (!g || !showArrows) return '';
            if (!always && !roomFor(p)) return '';
            return `<div class="pp-glyph-wrap" style="position:absolute;left:${shipSize / 2 - G / 2}px;top:${shipSize / 2 - G / 2}px">${glyphSvg(g, G, p.lat < 0, colors)}</div>`;
        };
        this.ships.forEach(s => s.remove());
        this.ships = positions.map(p => {
            const g = glyph(p);
            const m = L.marker([p.lat, p.lon], {
                icon: L.divIcon({
                    className: 'pp-ship-icon',
                    html: `${wx(g, p, S)}<div class="pp-ship${g?.imo ? ' pp-ship--imo' : ''}" style="transform: rotate(${p.course.toFixed(1)}deg)" title="${zoneLabel(p)}${g?.imo ? ' · IMO roll/broaching warning' : ''} · click to show this time">${shipSymbolSvg(style, S, !!g?.imo)}</div><div class="pp-ship-time" style="left:${S + 2}px;top:${S / 2 - 7}px">${fmtTime(p.time).slice(0, 2)}/${fmtTime(p.time).slice(7, 9)}${fmtTime(p.time).slice(10, 12)} UTC</div>`,
                    iconSize: [S, S],
                    iconAnchor: [S / 2, S / 2],
                }),
                interactive: true,
                bubblingMouseEvents: false,
            }).addTo(map);
            m.on('click', () => this.cb.onShipClick(p.time));
            return m;
        });
        this.nowShip?.remove();
        const gNow = now ? glyph(now) : null;
        this.nowShip = now
            ? L.marker([now.lat, now.lon], {
                  icon: L.divIcon({
                      className: 'pp-ship-icon',
                      html: `${wx(gNow, now, SN, true)}<div class="pp-ship pp-ship--now" style="transform: rotate(${now.course.toFixed(1)}deg)">${shipSymbolSvg(style, SN, !!gNow?.imo, true)}</div><div class="pp-ship-time pp-ship-time--now" style="left:${SN / 2 - 34}px;top:${SN + 2}px">${fmtTime(now.time)} UTC</div>`,
                      iconSize: [SN, SN],
                      iconAnchor: [SN / 2, SN / 2],
                  }),
                  interactive: false,
                  zIndexOffset: 1500,
              }).addTo(map)
            : null;
    }

    fitTo(route: Route): void {
        if (route.waypoints.length === 0) return;
        const pts: [number, number][] = route.waypoints.map(w => [w.lat, w.lon]);
        map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 40], paddingBottomRight: [40, 40] });
    }

    private clearLines(): void {
        this.lines.forEach(l => l.remove());
        this.lines = [];
    }

    destroy(): void {
        map.off('moveend', this.onView);
        map.off('zoomend', this.onView);
        map.off('click', this.onClick);
        map.off('contextmenu', this.onContext);
        this.clearLines();
        this.labels.forEach(l => l.remove());
        this.wpMarkers.forEach(m => m.remove());
        this.ships.forEach(s => s.remove());
        this.nowShip?.remove();
        this.compareLines.forEach(l => l.remove());
        this.hideReadout();
        this.wpMarkers.clear();
    }
}

/** Points of a leg up to `nm` and from `nm` on, sampled so great circles stay curved. */
function splitLeg(leg: { distNm: number; geom: { pointAt(nm: number): { lat: number; lon: number } } }, nm: number, lon0: number): [[number, number][], [number, number][]] {
    const n = Math.max(2, Math.ceil(leg.distNm / 20));
    const pts: [number, number][] = [];
    let prev = lon0;
    const add = (d: number) => {
        const p = leg.geom.pointAt(d);
        const lon = prev + ((((p.lon - prev) % 360) + 540) % 360) - 180;
        pts.push([p.lat, lon]);
        prev = lon;
    };
    const ds = Array.from({ length: n + 1 }, (_, i) => (leg.distNm * i) / n);
    const cut = ds.findIndex(d => d >= nm);
    ds.splice(cut < 0 ? ds.length : cut, 0, nm);
    ds.forEach(add);
    const k = ds.indexOf(nm);
    return [pts.slice(0, k + 1), pts.slice(k)];
}

/** Distance from point (px, py) to segment a–b, in pixels. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Liang–Barsky clipping of segment a–b to a rectangle. Returns the visible part or null. */
function clip(a: L.Point, b: L.Point, x0: number, y0: number, x1: number, y1: number): [L.Point, L.Point] | null {
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const p = [-dx, dx, -dy, dy];
    const q = [a.x - x0, x1 - a.x, a.y - y0, y1 - a.y];
    for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
            if (q[i] < 0) return null;
        } else {
            const r = q[i] / p[i];
            if (p[i] < 0) {
                if (r > t1) return null;
                if (r > t0) t0 = r;
            } else {
                if (r < t0) return null;
                if (r < t1) t1 = r;
            }
        }
    }
    return [new L.Point(a.x + t0 * dx, a.y + t0 * dy), new L.Point(a.x + t1 * dx, a.y + t1 * dy)];
}
