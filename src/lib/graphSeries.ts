// What can be shown in the voyage graphs (owner, 2026-10-29): one value per row of the voyage
// (time along x, value along y). Directions are drawn as dots (they jump at 360°).

import type { Vessel } from './model';
import { fromTable } from './speed';
import { encounterOf, seaDirOf, type WxRow } from './weather';
import { sprayIcing } from './icing';

export interface GraphCtx {
    vessel: Vessel;
    /** Roll / pitch estimate for a row (only asked for when shown) */
    motion(row: WxRow): { roll: number; pitch: number } | null;
}

export interface GraphSeries {
    id: string;
    label: string;
    unit: string;
    group: string;
    /** Drawn as dots, not a line (directions) */
    dots?: boolean;
    get(r: WxRow, c: GraphCtx): number | null;
}

const v = (x: number | null | undefined): number | null => (x == null || !isFinite(x) ? null : x);
/** Encounter period at the planned course and speed (0 kn when stopped); very long (waves never pass) left out */
const te = (r: WxRow, period: number | null | undefined, from: number | null | undefined): number | null => {
    const t = encounterOf(period, from, r.pos.course, r.stopped ? 0 : r.speedKn);
    return t == null || !isFinite(t) || t > 120 ? null : t;
};
const stw = (r: WxRow) => (r.sicw != null ? r.sicw - (r.lossKn ?? 0) : r.speedKn);

export const GRAPH_SERIES: GraphSeries[] = [
    { id: 'sog', label: 'SOG', unit: 'kn', group: 'Ship', get: r => v(r.sog ?? r.speedKn) },
    { id: 'sicw', label: 'SiCW (speed in calm water)', unit: 'kn', group: 'Ship', get: r => (r.stopped ? 0 : v(r.sicw)) },
    { id: 'loss', label: 'Weather speed loss', unit: 'kn', group: 'Ship', get: r => v(r.lossKn) },
    { id: 'rpm', label: 'RPM (from your table)', unit: 'rpm', group: 'Ship', get: (r, c) => (r.sicw == null || r.stopped ? null : v(fromTable(c.vessel.speedTable, r.sicw)?.rpm)) },
    {
        id: 'slip',
        label: 'Slip (from RPM and pitch)',
        unit: '%',
        group: 'Ship',
        get: (r, c) => {
            if (r.sicw == null || r.stopped || !c.vessel.pitch) return null;
            const rpm = fromTable(c.vessel.speedTable, r.sicw)?.rpm;
            if (!rpm) return null;
            const eng = (c.vessel.pitch * rpm * 60) / 1852;
            return eng > 0 ? ((eng - stw(r)) / eng) * 100 : null;
        },
    },
    { id: 'power', label: 'Engine power (from your table)', unit: 'kW', group: 'Ship', get: (r, c) => (r.sicw == null || r.stopped ? null : v(fromTable(c.vessel.speedTable, r.sicw)?.powerKw)) },
    { id: 'fuel', label: 'Fuel per day (from your table)', unit: 't/day', group: 'Ship', get: (r, c) => (r.sicw == null || r.stopped ? null : v(fromTable(c.vessel.speedTable, r.sicw)?.fuel)) },
    { id: 'windKn', label: 'Wind speed', unit: 'kn', group: 'Wind', get: r => v(r.wx?.windKn) },
    { id: 'gustKn', label: 'Gust', unit: 'kn', group: 'Wind', get: r => v(r.wx?.gustKn) },
    { id: 'windDir', label: 'Wind direction (from)', unit: '°', group: 'Wind', dots: true, get: r => v(r.wx?.windDir) },
    // The four wave kinds, the same names and order everywhere (owner, 2026-10-30): height, period,
    // direction and encounter period (at the planned course and speed through the water)
    { id: 'hs', label: 'SWH height', unit: 'm', group: 'SWH', get: r => v(r.wx?.hs) },
    { id: 'hsPer', label: 'SWH period', unit: 's', group: 'SWH', get: r => v(r.wx?.hsPeriod) },
    { id: 'hsDir', label: 'SWH direction (from)', unit: '°', group: 'SWH', dots: true, get: r => v(r.wx?.hsDir) },
    { id: 'hsTe', label: 'SWH encounter period', unit: 's', group: 'SWH', get: r => te(r, r.wx?.hsPeriod, r.wx?.hsDir) },
    { id: 'power_w', label: 'Wave power', unit: 'kW/m', group: 'SWH', get: r => v(r.wx?.powerKw) },
    { id: 'seaHs', label: 'Sea height', unit: 'm', group: 'Sea', get: r => v(r.wx?.seaHs) },
    { id: 'seaPer', label: 'Sea period', unit: 's', group: 'Sea', get: r => (r.wx?.seaWindy ? v(r.wx.seaPeriod) : null) },
    { id: 'seaDir', label: 'Sea direction (from)', unit: '°', group: 'Sea', dots: true, get: r => (r.wx ? v(seaDirOf(r.wx)) : null) },
    { id: 'seaTe', label: 'Sea encounter period', unit: 's', group: 'Sea', get: r => (r.wx?.seaWindy ? te(r, r.wx.seaPeriod, seaDirOf(r.wx)) : null) },
    { id: 'sw1', label: 'Swell 1 height', unit: 'm', group: 'Swell 1', get: r => v(r.wx?.sw1) },
    { id: 'sw1Per', label: 'Swell 1 period', unit: 's', group: 'Swell 1', get: r => v(r.wx?.sw1Period) },
    { id: 'sw1Dir', label: 'Swell 1 direction (from)', unit: '°', group: 'Swell 1', dots: true, get: r => v(r.wx?.sw1Dir) },
    { id: 'sw1Te', label: 'Swell 1 encounter period', unit: 's', group: 'Swell 1', get: r => te(r, r.wx?.sw1Period, r.wx?.sw1Dir) },
    { id: 'sw2', label: 'Swell 2 height', unit: 'm', group: 'Swell 2', get: r => v(r.wx?.sw2) },
    { id: 'sw2Per', label: 'Swell 2 period', unit: 's', group: 'Swell 2', get: r => v(r.wx?.sw2Period) },
    { id: 'sw2Dir', label: 'Swell 2 direction (from)', unit: '°', group: 'Swell 2', dots: true, get: r => v(r.wx?.sw2Dir) },
    { id: 'sw2Te', label: 'Swell 2 encounter period', unit: 's', group: 'Swell 2', get: r => te(r, r.wx?.sw2Period, r.wx?.sw2Dir) },
    {
        id: 'curAlong',
        label: 'Current along the track (+ helping, − against)',
        unit: 'kn',
        group: 'Current',
        get: r => {
            if (r.curAlong != null) return r.curAlong;
            const w = r.wx;
            if (w?.currentKn == null || w.currentSet == null) return null;
            return w.currentKn * Math.cos(((w.currentSet - r.pos.course) * Math.PI) / 180);
        },
    },
    { id: 'curKn', label: 'Current speed', unit: 'kn', group: 'Current', get: r => v(r.wx?.currentKn) },
    { id: 'curSet', label: 'Current direction (sets towards)', unit: '°', group: 'Current', dots: true, get: r => v(r.wx?.currentSet) },
    { id: 'roll', label: 'Roll (estimate, significant)', unit: '° roll/pitch', group: 'Motion', get: (r, c) => v(c.motion(r)?.roll) },
    { id: 'pitch', label: 'Pitch (estimate, significant)', unit: '° roll/pitch', group: 'Motion', get: (r, c) => v(c.motion(r)?.pitch) },
    { id: 'air', label: 'Air temperature', unit: '°C', group: 'Temperature / ice', get: r => v(r.wx?.airTempC) },
    { id: 'sst', label: 'Sea water temperature', unit: '°C', group: 'Temperature / ice', get: r => v(r.wx?.seaTempC) },
    { id: 'icing', label: 'Spray icing predictor (0 none, 22 moderate, 53 heavy, 83 extreme)', unit: 'icing', group: 'Temperature / ice', get: r => (r.wx ? v(sprayIcing(r.wx.windKn, r.wx.airTempC, r.wx.seaTempC)?.ppr) : null) },
    { id: 'pressure', label: 'Pressure', unit: 'hPa', group: 'Other', get: r => v(r.wx?.pressureHpa) },
    { id: 'vis', label: 'Visibility', unit: 'nm', group: 'Other', get: r => v(r.wx?.visNm) },
];

export const seriesById = (id: string): GraphSeries | undefined => GRAPH_SERIES.find(s => s.id === id);

export interface AxisPlan {
    /** Units on the left and right axes (a third unit has its own scale, given in the legend, no axis) */
    left: string | null;
    right: string | null;
    ranges: Record<string, [number, number]>;
}

/** Range per unit over the values shown, a little padded; 0 kept in view for speeds and heights */
export function axisPlan(ids: string[], values: Record<string, (number | null)[]>): AxisPlan {
    const units: string[] = [];
    for (const id of ids) {
        const u = seriesById(id)?.unit;
        if (u && !units.includes(u)) units.push(u);
    }
    const ranges: Record<string, [number, number]> = {};
    for (const u of units) {
        const vals = ids.filter(id => seriesById(id)?.unit === u).flatMap(id => values[id] ?? []).filter((x): x is number => x != null);
        if (!vals.length) continue;
        let lo = Math.min(...vals);
        let hi = Math.max(...vals);
        if (u === '°') [lo, hi] = [0, 360];
        else {
            if (lo > 0 && !['hPa', '°C', 'rpm'].includes(u)) lo = 0;
            if (hi - lo < 1e-6) hi = lo + 1;
            const pad = (hi - lo) * 0.08;
            hi += pad;
            if (lo < 0 || ['hPa', '°C', 'rpm'].includes(u)) lo -= pad;
        }
        ranges[u] = [lo, hi];
    }
    return { left: units[0] ?? null, right: units[1] ?? null, ranges };
}

/** Round tick values for an axis */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
    const out: number[] = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t / step) * step);
    return out;
}
