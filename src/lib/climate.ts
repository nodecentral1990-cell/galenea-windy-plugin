// Climate averages beyond the forecast (owner, 2026-11-23: "what if the voyage is for more than 15 days ... is there
// weather available from past experience that we can use"; research windy/notes/long-voyage-weather-research.md, steps 2
// and 3). A monthly world table on a 2° grid, worked out once from ERA5 (ECMWF / Copernicus reanalysis, 2006–2025) by
// windy/tools/climate/make_climate.py: the usual (mean) and "bad day" (1 in 10) wind and waves, chances of a gale and of
// high seas. NEVER a forecast: rows from it are marked C and never give a firm warning.

import type { WxPoint } from './weather';

export interface ClimMonthFile {
    v: number;
    month: number;
    years: string;
    samples: number;
    step: number;
    lat0: number;
    lon0: number;
    nlat: number;
    nlon: number;
    fields: { k: string; scale: number }[];
    src?: string;
    d: Record<string, string>;
}

export interface ClimMonth {
    month: number;
    years: string;
    step: number;
    lat0: number;
    lon0: number;
    nlat: number;
    nlon: number;
    scale: Record<string, number>;
    data: Record<string, Uint8Array>;
}

/** The climate figures behind a C row (for the table's notes) */
export interface ClimStats {
    month: number;
    years: string;
    windP90: number | null;
    galePct: number | null;
    hsP90: number | null;
    hsGt4Pct: number | null;
    hsGt6Pct: number | null;
}

const b64 = (s: string): Uint8Array => {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

export function decodeClimMonth(f: ClimMonthFile): ClimMonth {
    const data: Record<string, Uint8Array> = {};
    for (const [k, v] of Object.entries(f.d)) data[k] = b64(v);
    return { month: f.month, years: f.years, step: f.step, lat0: f.lat0, lon0: f.lon0, nlat: f.nlat, nlon: f.nlon, scale: Object.fromEntries(f.fields.map(x => [x.k, x.scale])), data };
}

/** Cell value (degrees for *_dir fields), null when no data */
function val(m: ClimMonth, k: string, i: number): number | null {
    const a = m.data[k];
    if (!a || i < 0 || i >= a.length) return null;
    const b = a[i];
    if (b === 255) return null;
    const v = b / (m.scale[k] ?? 1);
    return k.endsWith('_dir') ? v * 2 : v;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (m: number) => MONTHS[(m - 1 + 12) % 12];

/**
 * The usual weather (monthly means) at a place as a weather point: wind (mean speed, usual direction FROM), SWH, sea,
 * swell 1, swell 2 (mean heights; periods and directions weighted by wave energy). Waves are taken from a neighbouring
 * square when the nearest one is land. Null when there is nothing there.
 */
export function climatePoint(m: ClimMonth, lat: number, lon: number): WxPoint | null {
    const row = Math.round((m.lat0 - lat) / m.step);
    const col = Math.round(((((lon - m.lon0) % 360) + 360) % 360) / m.step) % m.nlon;
    if (row < 0 || row >= m.nlat) return null;
    const idx = (r: number, c: number) => r * m.nlon + (((c % m.nlon) + m.nlon) % m.nlon);
    const i0 = idx(row, col);
    let iw = i0;
    if (val(m, 'hs_mean', iw) == null) {
        search: for (const dr of [0, -1, 1])
            for (const dc of [0, -1, 1]) {
                const r = row + dr;
                if (r < 0 || r >= m.nlat) continue;
                const j = idx(r, col + dc);
                if (val(m, 'hs_mean', j) != null) {
                    iw = j;
                    break search;
                }
            }
    }
    const wind = val(m, 'w_mean', i0);
    const hs = val(m, 'hs_mean', iw);
    if (wind == null && hs == null) return null;
    const part = (p: string) => ({ h: val(m, `${p}_h`, iw), t: val(m, `${p}_t`, iw), d: val(m, `${p}_dir`, iw) });
    const sea = part('sea');
    const s1 = part('sw1');
    const s2 = part('sw2');
    // SWH period and direction: energy-weighted from the three parts (ERA5 total-wave fields are not in the table)
    const parts = [sea, s1, s2].filter(p => p.h != null && p.t != null && p.h > 0) as { h: number; t: number; d: number | null }[];
    const e = parts.reduce((a, p) => a + p.h * p.h, 0);
    const hsPeriod = e > 0 ? parts.reduce((a, p) => a + p.h * p.h * p.t, 0) / e : null;
    const big = [...parts].sort((a, b) => b.h - a.h)[0];
    const powerKw = hs != null && hsPeriod != null ? 0.49 * hs * hs * hsPeriod : null;
    const stats: ClimStats = {
        month: m.month,
        years: m.years,
        windP90: val(m, 'w_p90', i0),
        galePct: val(m, 'w_gale', i0),
        hsP90: val(m, 'hs_p90', iw),
        hsGt4Pct: val(m, 'hs_gt4', iw),
        hsGt6Pct: val(m, 'hs_gt6', iw),
    };
    return {
        windKn: wind,
        gustKn: null,
        windDir: val(m, 'w_dir', i0),
        pressureHpa: null,
        precipMm: null,
        fog: false,
        thunder: false,
        hs,
        hsDir: big?.d ?? null,
        hsPeriod,
        sw1: s1.h,
        sw1Dir: s1.d,
        sw1Period: s1.t,
        sw2: s2.h,
        sw2Dir: s2.d,
        sw2Period: s2.t,
        seaHs: sea.h,
        seaDir: sea.d,
        seaPeriod: sea.t,
        seaWindy: sea.h != null,
        seaSrc: 'climate',
        rhPct: null,
        powerKw,
        powerCalc: true,
        airTempC: null,
        seaTempC: null,
        clim: stats,
    } as WxPoint;
}

/** One line in words for a C row: "Climate, Jan (2006–2025): bad day 33 kn, gale on 7 % of days; SWH bad day 6.6 m, over 4 m on 64 %" */
export function climateWords(c: ClimStats): string {
    const p = (v: number | null) => (v == null ? '—' : `${Math.round(v)} %`);
    const n = (v: number | null, d = 0) => (v == null ? '—' : v.toFixed(d));
    return `Climate, ${monthName(c.month)} (${c.years.replace('-', '–')}): bad day (1 in 10) ${n(c.windP90)} kn, gale (Bft 8+) on ${p(c.galePct)} of days; SWH bad day ${n(c.hsP90, 1)} m, over 4 m on ${p(c.hsGt4Pct)}, over 6 m on ${p(c.hsGt6Pct)}. An average of past years, not a forecast.`;
}

// ---------- the source the weather code asks (set by the plugin once months are loaded) ----------

let source: ((lat: number, lon: number, t: number) => WxPoint | null) | null = null;
export function setClimateSource(fn: typeof source): void {
    source = fn;
}
/** Climate weather at a place and time, or null (switched off, month not loaded, no data) */
export function climateAt(lat: number, lon: number, t: number): WxPoint | null {
    return source ? source(lat, lon, t) : null;
}
