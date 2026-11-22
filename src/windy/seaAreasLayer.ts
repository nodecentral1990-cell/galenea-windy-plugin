// Sea areas and limits on the map (owner, 2026-11-22: "include emission control area borders also have check box for
// ECA, SECA, Marpol Areas as per annex, Special area, Ballast water areas, and 12 nm area (territorial seas from all
// coast, 50 nm, 200 nm etc").
//
// The data is not in the plugin (Windy's upload limit, ~3 MB): it is fetched once from the plugin's public code page on
// GitHub (data/seaareas/), kept in this browser (IndexedDB) and used from there afterwards, also with no internet.
//   imo.json        IMO areas, from the official IMO texts (windy/tools/sea-areas/build_areas.py)
//   zones/...       lines at 3 / 50 / 200 nm from land and the 12 nm / 24 nm / EEZ limits, in 10° tiles
//                   (windy/tools/make-sea-zones.py; see windy/notes/sea-zones-data.md)
// Only the map building blocks proven in Windy are used (L.polyline, L.marker + L.divIcon); every call is guarded.

import { map } from '@windy/map';
import { get, writable } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { idbGet, idbSet } from '../lib/idbCache';
import { seaAreaLayers, type SeaAreaLayers } from '../state';

/** Where the data lives (the public code page; raw.githubusercontent.com allows the browser to read it) */
export const SEA_AREAS_BASE = 'https://raw.githubusercontent.com/nodecentral1990-cell/galenea-windy-plugin/main/data/seaareas/';
const KEEP_MS = 30 * 86400e3;

export interface ImoArea {
    id: string;
    name: string;
    /** eca, a1 (Annex I), a2, a4, a5 */
    g: 'eca' | 'a1' | 'a2' | 'a4' | 'a5';
    /** flat [lat, lon, lat, lon, ...] */
    lines: number[][];
    label: [number, number][];
    note: string;
    src: string;
    sox?: number;
    nox?: number;
    future?: number;
}
interface ImoData {
    v: number;
    areas: ImoArea[];
}
type ZoneKind = 'nm3' | 'ts12' | 'cz24' | 'nm50' | 'nm200' | 'eez';
interface ZoneIndex {
    v: number;
    made?: string;
    kinds: Partial<Record<ZoneKind, { tiles: string[]; source?: string; licence?: string; note?: string }>>;
}

export const ZONE_KINDS: ZoneKind[] = ['nm3', 'ts12', 'cz24', 'nm50', 'nm200', 'eez'];
/** Zoom from which each line is drawn (finer lines only when zoomed in) */
export const ZONE_MIN_ZOOM: Record<ZoneKind, number> = { nm3: 6, ts12: 5, cz24: 5, nm50: 4, nm200: 3, eez: 3 };
export const ZONE_LABEL: Record<ZoneKind, string> = {
    nm3: '3 nm from land',
    ts12: '12 nm: territorial sea limit',
    cz24: '24 nm: contiguous zone limit',
    nm50: '50 nm from land',
    nm200: '200 nm from land',
    eez: 'EEZ limits (200 nm or agreed boundaries)',
};

type Style = { color: string; weight: number; dashArray?: string; opacity: number };
export const AREA_STYLE: Record<ImoArea['g'], Style> = {
    eca: { color: '#d21fd2', weight: 2.5, opacity: 0.95 },
    a1: { color: '#2f6dff', weight: 2, dashArray: '10 4', opacity: 0.95 },
    a2: { color: '#00a3a3', weight: 2, dashArray: '2 5 8 5', opacity: 0.95 },
    a4: { color: '#a0632b', weight: 2, dashArray: '6 3', opacity: 0.95 },
    a5: { color: '#22b14c', weight: 2, dashArray: '4 4', opacity: 0.95 },
};
export const ZONE_STYLE: Record<ZoneKind, Style> = {
    nm3: { color: '#ffffff', weight: 1, dashArray: '1 4', opacity: 0.85 },
    ts12: { color: '#ffffff', weight: 1.5, opacity: 0.9 },
    cz24: { color: '#bfe3ff', weight: 1.2, dashArray: '6 4', opacity: 0.9 },
    nm50: { color: '#7fd0ff', weight: 1.3, dashArray: '3 3', opacity: 0.9 },
    nm200: { color: '#4fa0ff', weight: 1.5, dashArray: '10 6', opacity: 0.9 },
    eez: { color: '#e0b0ff', weight: 1.5, dashArray: '12 4 2 4', opacity: 0.9 },
};
const FUTURE_DASH = '8 6';

/** Status line for the settings (what is drawn, what failed, zoom in to see …) */
export const seaAreaStatus = writable('');
/** The IMO areas once loaded (the settings list them with their notes and sources) */
export const imoAreas = writable<ImoArea[]>([]);

type Lyr = { remove(): unknown };
let areaLayers: Lyr[] = [];
let zoneLayers: Lyr[] = [];
const clear = (l: Lyr[]) => {
    for (const x of l)
        try {
            x.remove();
        } catch {
            /* gone */
        }
    return [] as Lyr[];
};
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** JSON from the data folder: kept copy first (fresh if under 30 days old; any age if the download fails) */
async function getData<T>(path: string): Promise<T | null> {
    const key = `sa:${path}`;
    const kept = await idbGet<{ at: number; data: T }>(key).catch(() => undefined);
    if (kept && Date.now() - kept.at < KEEP_MS) return kept.data;
    try {
        const r = await fetch(SEA_AREAS_BASE + path);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as T;
        idbSet(key, { at: Date.now(), data }).catch(() => {});
        return data;
    } catch (e) {
        if (kept) return kept.data;
        throw e;
    }
}

let imo: ImoData | null = null;
let imoP: Promise<ImoData | null> | null = null;
function loadImo(): Promise<ImoData | null> {
    if (imo) return Promise.resolve(imo);
    if (!imoP)
        imoP = getData<ImoData>('imo.json')
            .then(d => {
                imo = d;
                imoAreas.set(d?.areas ?? []);
                return d;
            })
            .catch(e => {
                imoP = null;
                throw e;
            });
    return imoP;
}

let zIndex: ZoneIndex | null = null;
let zIndexP: Promise<ZoneIndex | null> | null = null;
function loadIndex(): Promise<ZoneIndex | null> {
    if (zIndex) return Promise.resolve(zIndex);
    if (!zIndexP)
        zIndexP = getData<ZoneIndex>('zones/index.json')
            .then(d => (zIndex = d))
            .catch(e => {
                zIndexP = null;
                throw e;
            });
    return zIndexP;
}
const tiles = new Map<string, Promise<number[][] | null>>();
function loadTile(kind: ZoneKind, tile: string): Promise<number[][] | null> {
    const k = `${kind}/${tile}`;
    let p = tiles.get(k);
    if (!p) {
        p = getData<{ l: number[][] }>(`zones/${k}.json`).then(d => (d?.l ?? []).map(unpack));
        p.catch(() => tiles.delete(k));
        tiles.set(k, p);
    }
    return p;
}
/** First point in 0.001°, the rest as steps in 0.001° → flat [lat, lon, …] in degrees */
export function unpack(l: number[]): number[] {
    const out: number[] = [];
    let la = 0;
    let lo = 0;
    for (let i = 0; i + 1 < l.length; i += 2) {
        la += l[i];
        lo += l[i + 1];
        out.push(la / 1000, lo / 1000);
    }
    return out;
}

/** Which IMO areas the switches ask for */
export function areaWanted(a: ImoArea, s: SeaAreaLayers): boolean {
    if (a.g === 'eca') return ((s.sox && !!a.sox) || (s.nox && !!a.nox)) && (!a.future || s.future);
    return !!s[a.g];
}
const anyArea = (s: SeaAreaLayers) => s.sox || s.nox || s.a1 || s.a2 || s.a4 || s.a5;

function pairs(flat: number[]): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
    return out;
}
/** Split a line where it jumps across 180° so it is not drawn round the world */
function splitDateLine(ll: [number, number][]): [number, number][][] {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    for (const p of ll) {
        if (cur.length && Math.abs(p[1] - cur[cur.length - 1][1]) > 180) {
            out.push(cur);
            cur = [];
        }
        cur.push(p);
    }
    if (cur.length) out.push(cur);
    return out.filter(x => x.length > 1);
}

function drawAreas(s: SeaAreaLayers): void {
    areaLayers = clear(areaLayers);
    if (!imo) return;
    const z = map.getZoom();
    const b = map.getBounds().pad(0.2);
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const shown = imo.areas.filter(a => areaWanted(a, s));
    // ECAs on top (drawn last)
    const order: ImoArea['g'][] = ['a5', 'a4', 'a2', 'a1', 'eca'];
    for (const g of order)
        for (const a of shown.filter(x => x.g === g)) {
            const st = AREA_STYLE[a.g];
            for (const flat of a.lines)
                for (const part of splitDateLine(pairs(flat)))
                    areaLayers.push(
                        L.polyline(part, { ...st, ...(a.future ? { dashArray: FUTURE_DASH } : {}), interactive: false, className: `pp-sea pp-sea--${a.g}` }).addTo(map),
                    );
            if (!s.labels || z < 3) continue;
            for (const [la, lo] of a.label) {
                if (!b.contains([la, lo])) continue;
                let xy = { x: 0, y: 0 };
                try {
                    xy = map.latLngToContainerPoint([la, lo]);
                } catch {
                    /* no screen position: still drawn */
                }
                const w = 10 + a.name.length * 6;
                const box = { x0: xy.x - w / 2, y0: xy.y - 9, x1: xy.x + w / 2, y1: xy.y + 9 };
                if (taken.some(t => box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0)) continue;
                taken.push(box);
                const icon = L.divIcon({
                    className: 'pp-sea-icon',
                    html: `<div class="pp-sea-label" style="border-color:${st.color}" title="${esc(`${a.name}. ${a.note} Source: ${a.src}. Not official: check the current regulations and charts.`)}">${esc(a.name)}</div>`,
                    iconSize: [0, 0],
                    iconAnchor: [0, 0],
                });
                areaLayers.push(L.marker([la, lo], { icon, interactive: false, keyboard: false }).addTo(map));
            }
        }
}

let zoneRun = 0;
async function drawZones(s: SeaAreaLayers): Promise<void> {
    const run = ++zoneRun;
    const kinds = ZONE_KINDS.filter(k => s[k]);
    if (!kinds.length) {
        zoneLayers = clear(zoneLayers);
        return;
    }
    const idx = await loadIndex();
    if (run !== zoneRun || !idx) return;
    const z = map.getZoom();
    const b = map.getBounds();
    const s0 = Math.floor(Math.max(-90, b.getSouth()) / 10) * 10;
    const n0 = Math.floor(Math.min(89.99, b.getNorth()) / 10) * 10;
    const west = b.getWest();
    const east = b.getEast();
    const wanted: { kind: ZoneKind; tile: string }[] = [];
    const tooFar: ZoneKind[] = [];
    const missing: ZoneKind[] = [];
    for (const kind of kinds) {
        const list = idx.kinds[kind]?.tiles;
        if (!list) {
            missing.push(kind);
            continue;
        }
        if (z < ZONE_MIN_ZOOM[kind]) {
            tooFar.push(kind);
            continue;
        }
        const have = new Set(list);
        for (let la = s0; la <= n0; la += 10)
            for (let lo = Math.floor(west / 10) * 10; lo < east && lo < Math.floor(west / 10) * 10 + 360; lo += 10) {
                const lw = ((((lo + 180) % 360) + 360) % 360) - 180;
                const t = `${la}_${lw}`;
                if (have.has(t)) wanted.push({ kind, tile: t });
            }
    }
    if (wanted.length > 60) wanted.length = 60;
    const got = await Promise.all(wanted.map(w => loadTile(w.kind, w.tile).then(l => ({ ...w, l }), () => ({ ...w, l: null }))));
    if (run !== zoneRun) return;
    zoneLayers = clear(zoneLayers);
    let failed = 0;
    for (const g of got) {
        if (!g.l) {
            failed++;
            continue;
        }
        // shift a tile on the far side of 180° next to the view
        const shift = Math.round((map.getCenter().lng - (Number(g.tile.split('_')[1]) + 5)) / 360) * 360;
        for (const flat of g.l) {
            const ll = pairs(flat).map(([la, lo]) => [la, lo + shift] as [number, number]);
            zoneLayers.push(L.polyline(ll, { ...ZONE_STYLE[g.kind], interactive: false, className: `pp-zone pp-zone--${g.kind}` }).addTo(map));
        }
    }
    const notes: string[] = [];
    if (tooFar.length) notes.push(`zoom in to see: ${tooFar.map(k => ZONE_LABEL[k]).join(', ')}`);
    if (missing.length) notes.push(`not available yet: ${missing.map(k => ZONE_LABEL[k]).join(', ')}`);
    if (failed) notes.push(`${failed} map piece(s) could not be downloaded`);
    zoneNote = notes.join('; ');
    report(s);
}

let zoneNote = '';
function report(s: SeaAreaLayers): void {
    const n = imo ? imo.areas.filter(a => areaWanted(a, s)).length : 0;
    const parts: string[] = [];
    if (anyArea(s)) parts.push(imo ? `${n} IMO area${n === 1 ? '' : 's'} on the map` : 'IMO areas: loading…');
    if (zoneNote) parts.push(zoneNote);
    seaAreaStatus.set(parts.join(' · '));
}

async function redraw(): Promise<void> {
    const s = get(seaAreaLayers);
    try {
        if (anyArea(s)) {
            await loadImo();
            drawAreas(s);
        } else areaLayers = clear(areaLayers);
        report(s);
    } catch (e) {
        areaLayers = clear(areaLayers);
        seaAreaStatus.set(`IMO areas could not be downloaded (${(e as Error).message}). They need internet once; afterwards they are kept in this browser.`);
        logEvent('error', `Sea areas: ${(e as Error).message}`);
    }
    try {
        await drawZones(s);
    } catch (e) {
        zoneLayers = clear(zoneLayers);
        seaAreaStatus.set(`Distance lines could not be downloaded (${(e as Error).message}).`);
        logEvent('error', `Sea zones: ${(e as Error).message}`);
    }
}

let unsub: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const onMove = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void redraw(), 150);
};

export function startSeaAreas(): void {
    if (unsub) return;
    unsub = seaAreaLayers.subscribe(() => void redraw());
    map.on('moveend', onMove);
}

export function stopSeaAreas(): void {
    unsub?.();
    unsub = null;
    map.off('moveend', onMove);
    if (timer) clearTimeout(timer);
    areaLayers = clear(areaLayers);
    zoneLayers = clear(zoneLayers);
    zoneRun++;
}
