// Nautical chart overlay (owner, 2026-11-02, point 7; windy/notes/data-sources-research.md D):
// - OpenSeaMap seamarks (lights, buoys, TSS lanes, anchorages…) drawn over Windy's map, from zoom 9.
//   Tiles CC BY-SA 2.0, data © OpenStreetMap contributors (ODbL).
// - Optional depth shading from GEBCO's public WMS (public domain, "not for navigation"; experimental: the layer
//   name was not checked against GEBCO's server from this sandbox).
// 0.23.2: no extra map pane (Windy's newer map may not support them); the tile layer sits in Windy's own tile layer stack.
// NOT official charts: an aid for orientation only. Third-party servers: if they are down, nothing is drawn.

import { map } from '@windy/map';
import { get } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { chartLayers, type ChartLayers } from '../state';

export const SEAMARK_URL = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';
export const GEBCO_WMS = 'https://wms.gebco.net/mapserv?';
export const SEAMARK_MIN_ZOOM = 9;

let seamarks: L.TileLayer | null = null;
let depth: L.TileLayer | null = null;
let errors = 0;
let legend: HTMLDivElement | null = null;

function showLegend(c: ChartLayers): void {
    const on = c.seamarks || c.depth;
    if (!on) {
        legend?.remove();
        legend = null;
        return;
    }
    if (!legend) {
        legend = document.createElement('div');
        legend.className = 'pp-chart-legend';
        legend.style.cssText =
            'position:absolute;left:8px;bottom:64px;z-index:500;max-width:300px;padding:4px 8px;border-radius:6px;background:rgba(14,20,30,.82);color:#e8edf4;font:11px/1.35 system-ui,sans-serif;pointer-events:auto';
        (map.getContainer() as HTMLElement).appendChild(legend);
    }
    const z = map.getZoom();
    const parts: string[] = [];
    if (c.seamarks) parts.push(`⚓ Seamarks: © OpenSeaMap contributors (CC BY-SA), data © OpenStreetMap (ODbL)${z < SEAMARK_MIN_ZOOM ? ` · <b>zoom in to see them</b> (shown from zoom ${SEAMARK_MIN_ZOOM})` : ''}`);
    if (c.depth) parts.push('Depth shading: GEBCO (public domain)');
    parts.push('<b>Not official charts. Not for navigation.</b>');
    if (errors > 6) parts.push('<span style="color:#ffb4a8">Chart server not answering: some tiles missing.</span>');
    legend.innerHTML = parts.join('<br>');
}

/** Bring the map in line with the chart settings */
export function applyChartLayers(c: ChartLayers = get(chartLayers)): void {
    try {
        if (c.seamarks && !seamarks) {
            errors = 0;
            seamarks = L.tileLayer(SEAMARK_URL, { minZoom: SEAMARK_MIN_ZOOM, maxZoom: 18, opacity: c.opacity, attribution: '© OpenSeaMap contributors', zIndex: 20 } as L.TileLayerOptions);
            seamarks.on('tileerror', () => {
                errors++;
                if (errors === 7) logEvent('error', 'OpenSeaMap tiles: the server is not answering');
                showLegend(get(chartLayers));
            });
            seamarks.addTo(map);
            logEvent('settings', 'Nautical chart overlay (OpenSeaMap) on');
        } else if (!c.seamarks && seamarks) {
            seamarks.remove();
            seamarks = null;
            logEvent('settings', 'Nautical chart overlay (OpenSeaMap) off');
        }
        seamarks?.setOpacity(c.opacity);
        if (c.depth && !depth) {
            // classic Leaflet has tileLayer.wms; Windy's newer map (MapLibre based) takes a {bbox-epsg-3857} address
            const wms = (L.tileLayer as unknown as { wms?: (u: string, o: object) => L.TileLayer }).wms;
            const opts = { opacity: 0.45, attribution: 'GEBCO', zIndex: 19 };
            const d = wms
                ? wms(GEBCO_WMS, { ...opts, layers: 'GEBCO_LATEST', format: 'image/png', transparent: true })
                : L.tileLayer(`${GEBCO_WMS}service=WMS&request=GetMap&version=1.1.1&layers=GEBCO_LATEST&styles=&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`, opts as L.TileLayerOptions);
            d.addTo(map);
            depth = d;
            logEvent('settings', 'Depth shading (GEBCO) on');
        } else if (!c.depth && depth) {
            depth.remove();
            depth = null;
        }
    } catch (e) {
        logEvent('error', `Chart overlay: ${(e as Error).message}`);
    }
    showLegend(c);
}

let unsub: (() => void) | null = null;
const onZoom = () => showLegend(get(chartLayers));

export function startChartLayers(): void {
    if (unsub) return;
    unsub = chartLayers.subscribe(c => applyChartLayers(c));
    try {
        map.on('zoomend', onZoom);
    } catch (e) {
        logEvent('error', `Chart overlay: ${(e as Error).message}`);
    }
}

export function stopChartLayers(): void {
    unsub?.();
    unsub = null;
    map.off('zoomend', onZoom);
    seamarks?.remove();
    depth?.remove();
    seamarks = depth = null;
    legend?.remove();
    legend = null;
}
