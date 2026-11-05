// Roll chart on the map (owner, 2026-11-01, step 2): lines of equal roll (2°, 4°, 6°, 8°, 10°, 12°, 15° and the
// owner's roll limit, thicker) over whatever Windy shows, light red → dark red, with a key on the map. The ship
// is assumed on the planned course of the nearest leg at that leg's planned speed. Forecast: ECMWF-WAM point
// forecasts on a grid over the map view (shared with the wave chart: same positions, same cache); the wind sea
// is worked out from SWH and the swells. Follows Windy's time slider; worked out in chunks (cancelled when the
// slider moves on). Roll estimate: lib/motions.ts via motionAt (the plugin's own estimate; fine-tuned only if
// the master switched that on).

import { map } from '@windy/map';
import store from '@windy/store';
import { get, writable } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { isolines, refineSmooth, smoothLine, type Grid2D, type Line } from '../lib/contours';
import { isLand } from '../lib/landMask';
import { projectOnLegs } from '../lib/model';
import { calibState, motionAt, motionMissing } from '../lib/motionEstimate';
import { chartColor, chartLevels, levelsOf, maxOf, paintBands, rollField, worstHeading, type ChartQuantity, type FieldPoint } from '../lib/rollField';
import { calibrateWaveReading, readWave, type WaveReading } from '../lib/waveRead';
import { getLatLonInterpolator } from '@windy/interpolator';
import overlays from '@windy/overlays';
import { fmtRun, sampleSeries, type WxSeries } from '../lib/weather';
import { plan, vessel, workEnd, workProgress, workStart } from '../state';
import { fetchSeries, runLimited, waitRedraw } from './forecast';
import { spacingFor, viewBox, waveColorsSuspended, wrap } from './waveChart';

export interface RollChartSettings {
    /** 'sig' = significant roll (as in the table); 'max' = likely biggest in 3 hours */
    value: 'sig' | 'max';
    /** Heading assumed (step 3): planned course of the nearest leg, the worst heading, or one heading chosen */
    heading: 'route' | 'worst' | 'fixed';
    fixedHeading: number;
    /** Filled red bands between the lines */
    filled: boolean;
    /** Only the roll on the map: Windy's colours, particles and pressure lines off while the chart is shown */
    blank: boolean;
    /** Roll chart or pitch chart (step 4) */
    quantity: ChartQuantity;
}
const KEY = 'windy-plugin-passage-plan:rollchart';
const DEF: RollChartSettings = { value: 'sig', heading: 'route', fixedHeading: 0, filled: true, blank: false, quantity: 'roll' };
function load(): RollChartSettings {
    try {
        return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
        return { ...DEF };
    }
}
export const rollChartSettings = writable<RollChartSettings>(load());
rollChartSettings.subscribe(s => {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
        /* not remembered */
    }
});
/** Roll lines on the map now */
export const rollChartOn = writable(false);
export const rollChartStatus = writable('');

let grid: { lat0: number; lon0: number; step: number; rows: number; cols: number; points: { r: number; c: number; lat: number; lon: number; s: WxSeries | null }[] } | null = null;
let fetchedAt = 0;

/** Forecast points over the map view, then the roll lines (cached: the time slider needs no new fetch) */
export async function rollLinesForView(quantity?: ChartQuantity): Promise<void> {
    if (quantity) rollChartSettings.update(s => ({ ...s, quantity }));
    const why = motionMissing(get(vessel));
    if (why) {
        rollChartStatus.set(`${why}.`);
        return;
    }
    if (!get(plan).legs.length) {
        rollChartStatus.set('Make the route first (Route tab): the roll lines assume the planned course and speed.');
        return;
    }
    const { south, north, west, east } = viewBox();
    const step = spacingFor(north - south, east - west);
    const lat0 = Math.floor(south / step) * step;
    const lon0 = Math.floor(west / step) * step;
    const rows = Math.floor((north - lat0) / step) + 1;
    const cols = Math.floor((east - lon0) / step) + 1;
    const jobs: { r: number; c: number; lat: number; lon: number }[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const lat = lat0 + r * step;
        const lon = lon0 + c * step;
        if (!isLand(lat, lon)) jobs.push({ r, c, lat, lon });
    }
    notice = '';
    const signal = { cancelled: false };
    workStart('Roll chart: forecast over the map', ['Wave forecast points'], signal);
    try {
        const res = await runLimited(
            jobs.map(j => () => fetchSeries(j.lat, wrap(j.lon), 3)),
            6,
            n => workProgress('Wave forecast points', n, jobs.length),
            signal,
        );
        if (signal.cancelled) return;
        grid = { lat0, lon0, step, rows, cols, points: jobs.map((j, i) => ({ ...j, s: res[i] ?? null })) };
        fetchedAt = Date.now();
        logEvent('rollchart', `Roll chart: ${res.filter(Boolean).length} of ${jobs.length} forecast points every ${step}°`);
    } finally {
        workEnd();
    }
    rollChartOn.set(true);
    await drawRoll();
}

export function hideRollLines(): void {
    rollChartOn.set(false);
    cancel.cancelled = true;
    exitBlank();
    clear();
    legend?.remove();
    legend = null;
    rollChartStatus.set('');
}

// ---------- drawing ----------

let layers: L.Layer[] = [];
const clear = () => {
    for (const l of layers) l.remove();
    layers = [];
};
let cancel = { cancelled: false };
let lastInfo: { t: number; max: number | null; lines: number; mode: string } | null = null;

/** The planned course of the nearest leg and that leg's planned speed at a position */
function courseSpeedAt(lat: number, lon: number): { heading: number; speed: number } | null {
    const p = get(plan);
    const pr = projectOnLegs(p.legs, lat, lon);
    if (!pr) return null;
    const leg = p.legs[pr.legIdx];
    return { heading: leg.geom.pointAt(pr.sNm).course, speed: leg.stw };
}

async function drawRoll(): Promise<void> {
    if (!grid || !get(rollChartOn)) return;
    cancel.cancelled = true;
    const signal = { cancelled: false };
    cancel = signal;
    const t = Number(store.get('timestamp'));
    const v = get(vessel);
    const set = get(rollChartSettings);
    const g0 = grid;
    const points: FieldPoint[] = g0.points.map(p => ({ r: p.r, c: p.c, lat: p.lat, lon: p.lon, wx: p.s ? sampleSeries(p.s, t) : null }));
    showLegend(t, 'working', 0);
    // with "only the roll on the map", Windy's wind-wave layer is the (white) layer drawn: read the sea from it
    seaRead = 0;
    if (set.blank) {
        enterBlank();
        seaRead = await readSeaInto(points, t, signal).catch(() => 0);
        if (signal.cancelled) return;
    }
    const field = await rollField(
        {
            rows: g0.rows,
            cols: g0.cols,
            lat0: g0.lat0,
            lon0: g0.lon0,
            step: g0.step,
            points,
            rollAt: (wx, lat, lon) => {
                const cs = courseSpeedAt(lat, lon);
                if (!cs) return null;
                const at = (h: number) => {
                    const m = motionAt(wx, h, cs.speed, v);
                    if (!m) return null;
                    if (set.quantity === 'pitch') return set.value === 'max' ? m.pitchMax : m.pitch;
                    return set.value === 'max' ? m.rollMax : m.roll;
                };
                if (set.heading === 'worst') return worstHeading(at, [cs.heading])?.roll ?? null;
                return at(set.heading === 'fixed' ? set.fixedHeading : cs.heading);
            },
        },
        signal,
        (d, n) => showLegend(t, 'working', Math.round((100 * d) / Math.max(1, n))),
    );
    if (!field || signal.cancelled || !get(rollChartOn)) return;
    const fine: Grid2D = refineSmooth(field, 4);
    const levels = chartLevels(set.quantity, set.quantity === 'pitch' ? (v.pitchLimitDeg ?? null) : (v.rollLimitDeg ?? null));
    const lines: { level: number; limit: boolean; pts: Line }[] = [];
    for (const { level, limit } of levels) for (const l of isolines(fine, level)) if (l.length >= 3) lines.push({ level, limit, pts: smoothLine(l, 2) });
    clear();
    if (!set.blank) exitBlank();
    if (set.filled) {
        const band = bandsImage(fine, levels.map(l => l.level), set.blank, set.quantity);
        if (band) layers.push(band);
    }
    for (const { level, limit, pts } of lines) {
        const color = chartColor(set.quantity, level);
        // a white edge under the red line so it shows on any of Windy's colours
        layers.push(L.polyline(pts, { color: '#ffffff', weight: limit ? 5 : 3.4, opacity: 0.7, interactive: false }).addTo(map));
        layers.push(L.polyline(pts, { color, weight: limit ? 3 : 1.8, opacity: 0.95, dashArray: limit ? '8 5' : undefined, interactive: false }).addTo(map));
        const every = Math.max(30, Math.floor(pts.length / Math.max(1, Math.round(pts.length / 60))));
        for (let i = Math.floor(Math.min(every, pts.length) / 2); i < pts.length; i += every) {
            layers.push(
                L.marker(pts[i], {
                    icon: L.divIcon({ className: 'pp-iso-label pp-roll-label', html: `<span style="color:${color}">${limit ? 'limit ' : ''}${+level.toFixed(1)}°</span>`, iconSize: [0, 0] }),
                    interactive: false,
                }).addTo(map),
            );
        }
    }
    lastInfo = { t, max: maxOf(field), lines: lines.length, mode: set.value };
    showLegend(t, 'done', 100);
}

// ---------- filled bands (one image over the grid, rows in Web-Mercator) ----------

const BAND_PANE = 'ppRollBands';
function bandsImage(g: Grid2D, levels: number[], blank: boolean, q: ChartQuantity): L.Layer | null {
    const rows = g.values.length;
    const cols = g.values[0]?.length ?? 0;
    if (rows < 2 || cols < 2) return null;
    const south = g.lat0;
    const north = g.lat0 + (rows - 1) * g.dLat;
    const west = g.lon0;
    const east = g.lon0 + (cols - 1) * g.dLon;
    const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const width = Math.min(1200, Math.max(200, cols * 8));
    const height = Math.round(Math.min(1400, Math.max(100, (width * (merc(north) - merc(south))) / (((east - west) * Math.PI) / 180))));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(width, height);
    img.data.set(paintBands(g, south, north, west, east, width, height, levels, 255, l => chartColor(q, l)));
    ctx.putImageData(img, 0, 0);
    // a pane just under Windy-overlay vectors, so the lines and labels stay on top of the bands; guarded (0.23.2):
    // if Windy's map has no extra panes or image overlays, the lines are still drawn, without the bands
    try {
        let pane: string | undefined;
        try {
            if (!map.getPane(BAND_PANE)) {
                map.createPane(BAND_PANE);
                (map.getPane(BAND_PANE) as HTMLElement).style.zIndex = '390';
                (map.getPane(BAND_PANE) as HTMLElement).style.pointerEvents = 'none';
            }
            pane = BAND_PANE;
        } catch {
            pane = undefined;
        }
        return L.imageOverlay(canvas.toDataURL(), [[south, west], [north, east]], { opacity: blank ? 0.85 : 0.55, interactive: false, ...(pane ? { pane } : {}) }).addTo(map);
    } catch (e) {
        logEvent('error', `Roll chart bands: ${(e as Error).message}`);
        return null;
    }
}

// ---------- "only the roll on the map" (blank map) ----------
// Windy has no empty layer (type files 3.0.5, rootScope overlays list), so: its wave layer, painted white,
// particles and pressure lines off. Everything is put back when the chart is hidden or the plugin closes.
// If the user picks another layer meanwhile, the blank map steps aside (it does not fight Windy).

interface ColorScale {
    hasCustomColor(): boolean;
    getColorGradient(): unknown;
    setCustomColor(g: unknown, save?: boolean): Promise<void>;
    removeCustomColor(): Promise<void>;
}
// the wind-wave layer, so the sea can be read from it (step 4); the SWH layer is shown briefly once to learn
// how Windy's wave numbers are made up (same as the route's "Read sea")
const BLANK_OVERLAY = 'wwaves';
const scaleOf = (ov: string): ColorScale | null => ((overlays as unknown as Record<string, { overlayColor?: ColorScale }>)[ov]?.overlayColor ?? null) as ColorScale | null;
const WHITE: [number, [number, number, number, number]][] = [[0, [246, 248, 250, 255]], [30, [246, 248, 250, 255]]];
type Particles = 'on' | 'off' | 'intensive';
let saved: { overlay: string | null; particles: Particles | null; isolinesOn: boolean | null; scales: { scale: ColorScale; gradient: unknown | null }[] } | null = null;
let ownChange = false;
/** A note kept in the status line until the next roll chart (e.g. why the blank map stepped aside) */
let notice = '';

function enterBlank(): void {
    if (saved) return;
    const scales = [...new Set([scaleOf(BLANK_OVERLAY), scaleOf('waves')].filter((x): x is ColorScale => !!x))];
    saved = {
        overlay: (store.get('overlay') as string) ?? null,
        particles: (store.get('particlesAnim') as Particles) ?? null,
        isolinesOn: (store.get('isolinesOn') as boolean) ?? null,
        scales: scales.map(scale => ({ scale, gradient: scale.hasCustomColor() ? scale.getColorGradient() : null })),
    };
    waveColorsSuspended.on = true;
    ownChange = true;
    try {
        store.set('overlay', BLANK_OVERLAY);
        store.set('particlesAnim', 'off');
        store.set('isolinesOn', false);
    } finally {
        ownChange = false;
    }
    for (const sc of scales) sc.setCustomColor(WHITE, false).catch(() => {});
    logEvent('rollchart', 'Roll chart: only the roll on the map (Windy\'s wave layer painted white, particles and pressure lines off)');
}

/** Put Windy back as it was. `keepOverlay` = the user picked another layer: leave it */
function exitBlank(keepOverlay = false): void {
    if (!saved) return;
    const s = saved;
    saved = null;
    for (const { scale, gradient } of s.scales) (gradient ? scale.setCustomColor(gradient, false) : scale.removeCustomColor()).catch(() => {});
    ownChange = true;
    try {
        if (!keepOverlay && s.overlay != null) store.set('overlay', s.overlay as never);
        if (s.particles != null) store.set('particlesAnim', s.particles);
        if (s.isolinesOn != null) store.set('isolinesOn', s.isolinesOn);
    } finally {
        ownChange = false;
    }
    waveColorsSuspended.on = false;
}

// ---------- the sea from Windy's wind-wave layer (step 4) ----------

/** How Windy's wave numbers are made up (learnt once per session from the SWH layer vs the point forecast) */
let reading: WaveReading | null = null;
let seaRead = 0;
let seaTried = 0;

/** Read Windy's wind-wave layer at the grid points for the chart time; returns how many were read */
async function readSeaInto(points: FieldPoint[], t: number, signal: { cancelled: boolean }): Promise<number> {
    if (document.hidden) return 0; // Windy does not draw a hidden page
    if (!reading) {
        ownChange = true;
        try {
            store.set('overlay', 'waves');
        } finally {
            ownChange = false;
        }
        await waitRedraw(4000);
        const interp0 = (await getLatLonInterpolator()) as unknown as ((p: { lat: number; lon: number }) => unknown) | null;
        const sea = points.filter(p => p.wx && p.wx.hs != null);
        const picks = sea.filter((_, i) => i % Math.max(1, Math.floor(sea.length / 6)) === 0).slice(0, 6);
        const samples = await Promise.all(
            picks.map(async p => ({ raw: interp0 ? await Promise.resolve(interp0({ lat: p.lat, lon: wrap(p.lon) })).catch(() => null) : null, height: p.wx?.hs ?? NaN, dir: p.wx?.hsDir ?? null, period: p.wx?.hsPeriod ?? null })),
        );
        reading = calibrateWaveReading(samples.filter(s => Number.isFinite(s.height)));
        logEvent('rollchart', `Roll chart: learning Windy's wave numbers from the SWH layer: ${reading ? 'done' : 'no match with the point forecast'}`, { samples: samples.slice(0, 3) });
        ownChange = true;
        try {
            store.set('overlay', BLANK_OVERLAY);
        } finally {
            ownChange = false;
        }
        if (!reading || signal.cancelled) return 0;
    }
    // Windy redraws the layer for the new time; read once it has finished
    await waitRedraw(2500);
    if (signal.cancelled || document.hidden) return 0;
    const interp = (await getLatLonInterpolator()) as unknown as ((p: { lat: number; lon: number }) => unknown) | null;
    if (!interp) return 0;
    let n = 0;
    seaTried = 0;
    for (const p of points) {
        if (!p.wx) continue;
        seaTried++;
        const raw = await Promise.resolve(interp({ lat: p.lat, lon: wrap(p.lon) })).catch(() => null);
        const w = readWave(raw, reading);
        if (Number.isFinite(w.h)) {
            p.wx = { ...p.wx, seaHs: w.h, seaDir: w.dir, seaPeriod: w.period, seaWindy: true };
            n++;
        }
    }
    return n;
}

/** The user picked another Windy layer while the map was blank: step aside */
function onOverlay(): void {
    if (ownChange || !saved) return;
    exitBlank(true);
    rollChartSettings.update(s => ({ ...s, blank: false }));
    notice = '"Only the roll on the map" switched off: you picked another Windy layer.';
    rollChartStatus.set(notice);
}

// ---------- key on the map ----------

let legend: HTMLDivElement | null = null;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtT = (t: number) => `${new Date(t).toISOString().slice(8, 10)} ${MON[new Date(t).getUTCMonth()]} ${new Date(t).toISOString().slice(11, 16)} UTC`;

const modeText = (s: RollChartSettings) =>
    s.heading === 'worst'
        ? 'the <b>most roll at any heading</b> (worst of 8 headings, refined; speed of the nearest leg): pale = small roll whatever course you steer'
        : s.heading === 'fixed'
          ? `if the ship steers <b>${String(Math.round(s.fixedHeading) % 360).padStart(3, '0')}°</b> at the planned speed of the nearest leg`
          : 'if the ship steers the <b>planned course of the nearest leg at its planned speed</b>';

function showLegend(t: number, state: 'working' | 'done', pct: number): void {
    if (!get(rollChartOn)) return;
    if (!legend) {
        legend = document.createElement('div');
        legend.className = 'pp pp-roll-legend';
        document.body.appendChild(legend);
    }
    const v = get(vessel);
    const set = get(rollChartSettings);
    const q = set.quantity;
    const word = q === 'pitch' ? 'pitch' : 'roll';
    const levels = chartLevels(q, q === 'pitch' ? (v.pitchLimitDeg ?? null) : (v.rollLimitDeg ?? null));
    const lv = levelsOf(q);
    const chips = levels
        .map(({ level, limit }) => `<span class="rk-chip${limit ? ' rk-limit' : ''}" style="background:${chartColor(q, level)};color:${level >= lv[2] ? '#fff' : '#000'}">${limit ? 'mark ' : ''}${+level.toFixed(1)}°</span>`)
        .join('');
    const first = grid?.points.find(p => p.s)?.s;
    const cal = calibState(v).applied;
    const info = state === 'working' ? `<div class="rk-work">Working out the ${word}… ${pct} %</div>` : lastInfo ? `<div>${lastInfo.lines ? `${lastInfo.lines} lines` : `No line: the ${word} stays under ${lv[0]}° here`}${lastInfo.max != null ? ` · largest ${lastInfo.max.toFixed(1)}°` : ''}</div>` : '';
    const seaTxt = seaRead > 0 ? `sea read from Windy's wind-wave layer (${seaRead} of ${seaTried} points)` : 'sea worked out from SWH and swells';
    legend.innerHTML =
        `<div class="rk-title">${q === 'pitch' ? '🔵 Pitch chart' : '🔴 Roll chart'} · ${fmtT(t)}</div>` +
        `<div>${set.value === 'max' ? `<b>Likely biggest ${word} in 3 h</b>` : `<b>Significant ${word}</b> (as in the weather table)`}${q === 'roll' ? ', one side' : ''}, ${modeText(set).replace('most roll', `most ${word}`).replace('small roll', `small ${word}`)}.</div>` +
        `<div class="rk-chips">${chips}</div>` +
        info +
        `<div class="rk-src">Plugin estimate${cal ? ', fine-tuned from your observed rolls' : ''}. Forecast points every ${grid?.step ?? '—'}°, smoothed; ${seaTxt}. ECMWF-WAM${first?.wavesRefTime ? ` run ${fmtRun(first.wavesRefTime)}` : ''}${fetchedAt ? ` · fetched ${new Date(fetchedAt).toISOString().slice(11, 16)} UTC` : ''}. ${q === 'roll' ? 'Parametric roll not included (see the IMO warnings). ' : ''}Guide only.</div>`;
    const main = state === 'working' ? `Working out the ${word}… ${pct} %` : lastInfo ? `${q === 'pitch' ? 'Pitch' : 'Roll'} lines shown for ${fmtT(lastInfo.t)}${lastInfo.max != null ? ` · largest ${lastInfo.max.toFixed(1)}°` : ''}` : '';
    rollChartStatus.set([main, notice].filter(Boolean).join(' · '));
}

// ---------- start / stop with the plugin ----------

let timer: ReturnType<typeof setTimeout> | null = null;
const redraw = () => {
    if (!grid || !get(rollChartOn)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => drawRoll(), 300);
};
let off: (() => void) | null = null;
let lastT = 0;

export function startRollChart(): void {
    stopRollChart();
    const onTime = (ts: number) => {
        if (ts !== lastT) {
            lastT = ts;
            redraw();
        }
    };
    store.on('timestamp', onTime);
    store.on('overlay', onOverlay);
    // a change of route, speeds, ship data, limit or settings: draw again
    const u1 = plan.subscribe(() => redraw());
    const u2 = vessel.subscribe(() => redraw());
    const u3 = rollChartSettings.subscribe(() => redraw());
    off = () => {
        store.off('timestamp', onTime);
        store.off('overlay', onOverlay);
        u1();
        u2();
        u3();
    };
}

export function stopRollChart(): void {
    off?.();
    off = null;
    if (timer) clearTimeout(timer);
    hideRollLines();
    grid = null;
}

