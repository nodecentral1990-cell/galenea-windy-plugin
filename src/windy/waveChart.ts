// Wave chart (owner, 2026-10-28): the user's own colours for Windy's wave (SWH), wind-sea and swell
// layers (white below a minimum, flat bands every 0.5 / 1 m, light → dark), lines of equal height
// switched on per wave type, and a small legend on the map saying what is shown.
// Lines for the layer Windy is showing come from Windy's own map data (fine, read with its
// interpolator); lines for other wave types come from ECMWF-WAM point forecasts on a grid over the
// map view (coarser, smoothed). Windy's colour scale is replaced only while the plugin is open, and
// put back on closing (including any colours the user had set in Windy).

import bcast from '@windy/broadcast';
import colors from '@windy/colors';
import { getLatLonInterpolator } from '@windy/interpolator';
import { map } from '@windy/map';
import overlays from '@windy/overlays';
import store from '@windy/store';
import { get, writable } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { isolines, levelsFor, refineSmooth, smoothLine, type Grid2D, type Line } from '../lib/contours';
import { isLand } from '../lib/landMask';
import {
    calibrateDecode,
    decodeWave,
    layerOfOverlay,
    lineOfOverlay,
    migrateWaveColors,
    PALETTES,
    bandColor,
    WAVE_LINES,
    waveGradient,
    type WaveColorSettings,
    type WaveDecode,
    type WaveLine,
} from '../lib/waveColors';
import { fmtRun, sampleSeries, type WxSeries } from '../lib/weather';
import { workEnd, workProgress, workStart } from '../state';
import { fetchSeries, runLimited } from './forecast';

const KEY = 'windy-plugin-passage-plan:wavecolors';
function load(): WaveColorSettings {
    try {
        return migrateWaveColors(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
    } catch {
        return migrateWaveColors({});
    }
}
export const waveColors = writable<WaveColorSettings>(load());
export const waveChartStatus = writable('');

// ---------- colours ----------

interface ColorScale {
    hasCustomColor(): boolean;
    getColorGradient(): unknown;
    setCustomColor(g: unknown, save?: boolean): Promise<void>;
    removeCustomColor(): Promise<void>;
}
/** Windy's colour scale used by an overlay */
const scaleOf = (overlay: string): ColorScale | null =>
    ((overlays as unknown as Record<string, { overlayColor?: ColorScale }>)[overlay]?.overlayColor ?? (colors as unknown as Record<string, ColorScale>).waves ?? null);

/** What the scale was before the plugin changed it (to put back) */
const original = new Map<ColorScale, unknown | null>();

/** Set by the roll chart while it shows "only the roll" (the wave layer painted white): leave the colours alone */
export const waveColorsSuspended = { on: false };

async function applyColors(): Promise<void> {
    if (waveColorsSuspended.on) return;
    const s = get(waveColors);
    const overlay = String(store.get('overlay') ?? '');
    const layer = layerOfOverlay(overlay);
    const scale = layer ? scaleOf(overlay) : null;
    if (s.on && layer && scale) {
        if (!original.has(scale)) original.set(scale, scale.hasCustomColor() ? scale.getColorGradient() : null);
        await scale.setCustomColor(waveGradient(layer, s), false);
    } else {
        await restoreColors();
    }
}

/** Put Windy's colours back as they were */
export async function restoreColors(): Promise<void> {
    for (const [scale, before] of original) {
        if (before) await scale.setCustomColor(before, false);
        else await scale.removeCustomColor();
    }
    original.clear();
}

// ---------- data for the lines ----------

/** Forecast points over the map view (for wave types Windy is not showing) */
let grid: { lat0: number; lon0: number; step: number; series: (WxSeries | null)[][] } | null = null;
let fetchedAt = 0;
/** How to read a height from Windy's map data (worked out once, see calibrateDecode) */
let decode: WaveDecode | null = null;
let lastRaw = '';

/** Grid spacing so the map view needs at most ~300 forecast points */
export function spacingFor(latSpan: number, lonSpan: number): number {
    for (const s of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]) if ((latSpan / s + 1) * (lonSpan / s + 1) <= 300) return s;
    return 6;
}

export const viewBox = (): { south: number; north: number; west: number; east: number } => {
    const b = map.getBounds();
    const south = Math.max(-75, b.getSouth());
    const north = Math.min(75, b.getNorth());
    const west = b.getWest();
    const east = Math.min(b.getEast(), west + 360);
    return { south, north, west, east };
};
export const wrap = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Fetch the forecast at grid points over the map view (cached: moving the time slider needs no new fetch). */
export async function loadLinesForView(): Promise<void> {
    const { south, north, west, east } = viewBox();
    const step = spacingFor(north - south, east - west);
    const lat0 = Math.floor(south / step) * step;
    const lon0 = Math.floor(west / step) * step;
    const rows = Math.floor((north - lat0) / step) + 1;
    const cols = Math.floor((east - lon0) / step) + 1;
    const jobs: { r: number; c: number; lat: number; lon: number }[] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const lat = lat0 + r * step;
            const lon = lon0 + c * step;
            if (!isLand(lat, lon)) jobs.push({ r, c, lat, lon });
        }
    }
    const signal = { cancelled: false };
    workStart('Wave chart: forecast over the map', ['Wave forecast points'], signal);
    try {
        const res = await runLimited(
            jobs.map(j => () => fetchSeries(j.lat, wrap(j.lon), 3)),
            6,
            n => workProgress('Wave forecast points', n, jobs.length),
            signal,
        );
        const series: (WxSeries | null)[][] = Array.from({ length: rows }, () => new Array(cols).fill(null));
        jobs.forEach((j, i) => (series[j.r][j.c] = res[i] ?? null));
        grid = { lat0, lon0, step, series };
        fetchedAt = Date.now();
        logEvent('wavechart', `Wave chart: ${res.filter(Boolean).length} of ${jobs.length} forecast points every ${step}°`);
    } finally {
        workEnd();
    }
    await drawLines();
}

/** Height of one wave type from a point forecast (sea worked out from SWH and the swells) */
function pointValue(line: WaveLine, s: WxSeries | null, t: number): number {
    const p = s ? sampleSeries(s, t) : null;
    const v = !p ? null : line === 'hs' ? p.hs : line === 'sea' ? p.seaHs : line === 'swell1' ? p.sw1 : p.sw2;
    return v == null ? NaN : v;
}

function gridFromPoints(line: WaveLine, t: number): Grid2D | null {
    if (!grid) return null;
    const g: Grid2D = { lat0: grid.lat0, lon0: grid.lon0, dLat: grid.step, dLon: grid.step, values: grid.series.map(row => row.map(x => pointValue(line, x, t))) };
    return refineSmooth(g, 4);
}

/** Windy's own data for the layer it is showing, on a fine grid over the map view */
async function gridFromWindy(line: WaveLine, t: number): Promise<Grid2D | null> {
    const interp = (await getLatLonInterpolator()) as unknown as ((p: { lat: number; lon: number }) => unknown) | null;
    if (!interp) return null;
    const { south, north, west, east } = viewBox();
    const d = Math.max(0.05, (east - west) / 90);
    const rows = Math.min(90, Math.floor((north - south) / d) + 1);
    const cols = Math.floor((east - west) / d) + 1;
    const raw: unknown[][] = [];
    for (let r = 0; r < rows; r++) {
        const lat = south + r * d;
        raw.push(await Promise.all(Array.from({ length: cols }, (_, c) => Promise.resolve(interp({ lat, lon: wrap(west + c * d) })).catch(() => null))));
    }
    const mid = raw[Math.floor(rows / 2)][Math.floor(cols / 2)];
    lastRaw = JSON.stringify(mid)?.slice(0, 60) ?? '';
    if (decode == null) decode = await calibrate(line, t, raw, south, west, d);
    if (decode == null) return null;
    const how = decode;
    return { lat0: south, lon0: west, dLat: d, dLon: d, values: raw.map((row, r) => row.map((v, c) => (isLand(south + r * d, west + c * d) ? NaN : decodeWave(v, how)))) };
}

/** Work out which of Windy's three numbers is the height, by comparing with point forecasts at a few sea positions */
async function calibrate(line: WaveLine, t: number, raw: unknown[][], lat0: number, lon0: number, d: number): Promise<WaveDecode | null> {
    const rows = raw.length;
    const cols = raw[0]?.length ?? 0;
    const picks: [number, number][] = [];
    for (const fr of [0.3, 0.5, 0.7]) for (const fc of [0.3, 0.5, 0.7]) picks.push([Math.floor(rows * fr), Math.floor(cols * fc)]);
    const sea = picks.filter(([r, c]) => !isLand(lat0 + r * d, lon0 + c * d)).slice(0, 4);
    const samples = await Promise.all(
        sea.map(async ([r, c]) => {
            const lat = Math.round((lat0 + r * d) * 4) / 4;
            const lon = Math.round(wrap(lon0 + c * d) * 4) / 4;
            const s = await fetchSeries(lat, lon, 3).catch(() => null);
            return { raw: raw[r][c], height: pointValue(line, s, t) };
        }),
    );
    const how = calibrateDecode(samples.filter(x => Number.isFinite(x.height)));
    logEvent('wavechart', `Reading Windy's ${line} layer: ${how == null ? 'no match with the point forecast' : `height = ${how === 'hypot' ? 'length of values 1 and 2' : `value ${how + 1}`}`}`, { samples: samples.map(s => ({ raw: s.raw, height: s.height })) });
    return how;
}

// ---------- drawing ----------

let layers: L.Layer[] = [];
const clearLines = () => {
    for (const l of layers) l.remove();
    layers = [];
};

interface Drawn {
    line: WaveLine;
    source: 'windy' | 'points' | 'none';
    count: number;
}
let drawn: Drawn[] = [];
let drawing = 0;

/** Draw the lines switched on, for Windy's slider time. */
export async function drawLines(): Promise<void> {
    const ticket = ++drawing;
    const s = get(waveColors);
    const t = Number(store.get('timestamp'));
    const shown = lineOfOverlay(String(store.get('overlay') ?? ''));
    const result: { d: Drawn; lines: { lv: number; pts: Line }[] }[] = [];
    for (const wl of WAVE_LINES) {
        if (!s.lines[wl.id]) continue;
        let g: Grid2D | null = null;
        let source: Drawn['source'] = 'none';
        if (shown === wl.id) {
            g = await gridFromWindy(wl.id, t).catch(() => null);
            if (g) source = 'windy';
        }
        if (!g) {
            g = gridFromPoints(wl.id, t);
            if (g) source = 'points';
        }
        const lines: { lv: number; pts: Line }[] = [];
        if (g) {
            for (const lv of levelsFor(g, s.min[wl.minOf], s.step)) {
                for (const l of isolines(g, lv)) if (l.length >= 3) lines.push({ lv, pts: smoothLine(l, 2) });
            }
        }
        result.push({ d: { line: wl.id, source, count: lines.length }, lines });
    }
    if (ticket !== drawing) return; // a newer drawing started meanwhile
    clearLines();
    for (const { d, lines } of result) {
        const color = WAVE_LINES.find(w => w.id === d.line)!.color;
        for (const { lv, pts } of lines) {
            const whole = Number.isInteger(lv);
            const dash = whole ? undefined : '5 4';
            // dark line on a thin white edge, so it shows on light and dark colours alike
            layers.push(L.polyline(pts, { color: '#ffffff', weight: whole ? 3.4 : 2.6, opacity: 0.65, dashArray: dash, interactive: false }).addTo(map));
            layers.push(L.polyline(pts, { color, weight: whole ? 1.6 : 1.1, opacity: 0.95, dashArray: dash, interactive: false }).addTo(map));
            // a label every ~60 points along the line, at least one
            const every = Math.max(30, Math.floor(pts.length / Math.max(1, Math.round(pts.length / 60))));
            for (let i = Math.floor(Math.min(every, pts.length) / 2); i < pts.length; i += every) {
                layers.push(
                    L.marker(pts[i], {
                        icon: L.divIcon({ className: 'pp-iso-label', html: `<span style="color:${color}">${lv % 1 ? lv.toFixed(1) : lv.toFixed(0)}</span>`, iconSize: [0, 0] }),
                        interactive: false,
                    }).addTo(map),
                );
            }
        }
    }
    drawn = result.map(r => r.d);
    updateLegend();
}

// ---------- legend on the map ----------

let legend: HTMLDivElement | null = null;
const LBL: Record<WaveLine, string> = { hs: 'SWH', sea: 'Sea', swell1: 'Swell 1', swell2: 'Swell 2' };
const OVERLAY_NAME: Record<string, string> = { waves: 'SWH (waves)', wwaves: 'Sea (wind waves)', swell1: 'Swell 1', swell2: 'Swell 2', swell3: 'Swell 3', swell: 'Swell' };

function updateLegend(): void {
    const s = get(waveColors);
    const overlay = String(store.get('overlay') ?? '');
    const layer = layerOfOverlay(overlay);
    const coloured = s.on && layer;
    // shown only when the map shows something of the wave chart
    const any = coloured || drawn.some(d => d.source !== 'none');
    if (!any) {
        legend?.remove();
        legend = null;
        waveChartStatus.set('');
        return;
    }
    if (!legend) {
        legend = document.createElement('div');
        legend.className = 'pp pp-wave-legend';
        document.body.appendChild(legend);
    }
    const p = PALETTES.find(x => x.id === s.palette) ?? PALETTES[0];
    let bar = '';
    if (coloured) {
        const min = s.min[layer];
        const n = 8;
        bar =
            `<div class="wl-bar"><span style="background:#fff;color:#000">&lt;${min}</span>` +
            Array.from({ length: n }, (_, i) => {
                const c = bandColor(p, i, n);
                const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
                return `<span style="background:rgb(${c.slice(0, 3).join(',')});color:${lum > 140 ? '#000' : '#fff'}">${+(min + i * s.step).toFixed(1)}</span>`;
            }).join('') +
            `</div>`;
    }
    const first = grid?.series.flat().find(Boolean) as WxSeries | undefined;
    const lineRows = drawn
        .map(d => {
            const c = WAVE_LINES.find(w => w.id === d.line)!.color;
            const how =
                d.source === 'windy'
                    ? "from Windy's map (fine)"
                    : d.source === 'points'
                      ? `forecast points every ${grid?.step}°, smoothed${d.line === 'sea' ? ' (sea worked out from SWH and swells)' : ''}`
                      : 'needs "Lines for this view" (Weather tab)';
            return `<div><i style="background:${c}"></i><b>${LBL[d.line]}</b> ${d.count ? `${d.count} lines, ` : ''}${how}</div>`;
        })
        .join('');
    const t = Number(store.get('timestamp'));
    legend.innerHTML =
        `<div class="wl-title">🌊 Wave chart · ${new Date(t).toISOString().slice(8, 10)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][new Date(t).getUTCMonth()]} ${new Date(t).toISOString().slice(11, 16)} UTC</div>` +
        (coloured
            ? `<div>Colours: <b>${OVERLAY_NAME[overlay] ?? overlay}</b> height (m), your scale, steps ${s.step} m, white below ${s.min[layer]} m</div>${bar}`
            : `<div>Colours: Windy's own (${OVERLAY_NAME[overlay] ?? overlay})</div>`) +
        (drawn.length ? `<div class="wl-sub">Lines of equal height every ${s.step} m (solid = whole metres):</div>${lineRows}` : '') +
        `<div class="wl-src">ECMWF-WAM${first?.wavesRefTime ? ` run ${fmtRun(first.wavesRefTime)}` : ''}${fetchedAt ? ` · points fetched ${new Date(fetchedAt).toISOString().slice(11, 16)} UTC` : ''}. Guide only.</div>`;
    waveChartStatus.set(
        drawn.length
            ? drawn.map(d => `${LBL[d.line]}: ${d.source === 'windy' ? "Windy's map (fine)" : d.source === 'points' ? `points every ${grid?.step}°` : 'press "Load lines for this map view"'}`).join(' · ') +
                  (decode == null && lastRaw ? ` · Windy's map data could not be read (sample ${lastRaw})` : '')
            : '',
    );
}

// ---------- start / stop with the plugin ----------

let timer: ReturnType<typeof setTimeout> | null = null;
const redraw = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        applyColors();
        drawLines();
    }, 250);
};
let off: (() => void) | null = null;

export function startWaveChart(): void {
    stopWaveChart();
    const unsub = waveColors.subscribe(s => {
        try {
            localStorage.setItem(KEY, JSON.stringify(s));
        } catch {
            /* not remembered */
        }
        redraw();
    });
    store.on('overlay', redraw);
    // Windy has finished drawing a new time, layer or map view: its data can be read now
    bcast.on('redrawFinished', redraw);
    off = () => {
        unsub();
        store.off('overlay', redraw);
        bcast.off('redrawFinished', redraw);
    };
}

export function stopWaveChart(): void {
    off?.();
    off = null;
    if (timer) clearTimeout(timer);
    drawing++;
    clearLines();
    legend?.remove();
    legend = null;
    restoreColors();
}

/** Show one of the wave types on Windy's map (Windy's own layer, in the user's colours) */
export function showWaveLayer(line: WaveLine): void {
    store.set('overlay', WAVE_LINES.find(w => w.id === line)!.overlay);
}
