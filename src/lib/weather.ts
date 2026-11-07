// Weather along the route: turning Windy point-forecast series into values at a time,
// derived values, limit checks and the rows of the weather table.
// Pure logic: the calls to Windy live in ../windy/forecast.ts.

import { checkWaveSystem, encounterAngle, encounterPeriod, estimateRollPeriod, type ResonanceHit, type ResonanceSettings, type WaveSystem } from './circ1228';
import { defaultCold, ICING_RATE, icingRank, sprayIcing, type ColdLimits } from './icing';
import { norm180, norm360 } from './geo';
import { type PlanCalc, type Route, type ShipPosition, type Vessel, positionAt } from './model';

export const MS_TO_KN = 1.943844;

/** One point forecast: ECMWF (air) merged with ECMWF-WAM (waves). Units as Windy sends them. */
export interface WxSeries {
    lat: number;
    lon: number;
    ts: number[];
    model: string;
    /** Model run time (ISO), if Windy sent it */
    refTime?: string;
    /** When the plugin fetched it (UTC ms) */
    fetchedAt?: number;
    wind?: (number | null)[];
    windGust?: (number | null)[];
    windDir?: (number | null)[];
    pressure?: (number | null)[];
    precipAmount?: (number | null)[];
    icon?: (number | null)[];
    /** Air temperature (Windy sends kelvin) */
    temp?: (number | null)[];
    /** Sea surface temperature at this point, °C: ONE value per point (not hourly), if Windy sent it */
    sstC?: number | null;
    waves?: (number | null)[];
    wavesDir?: (number | null)[];
    wavesPeriod?: (number | null)[];
    /** Wave power from Windy (ECMWF-WAM "wavesPower"), kW per metre of wave front (assumed unit) */
    wavesPower?: (number | null)[];
    swell1?: (number | null)[];
    swell1Dir?: (number | null)[];
    swell1Period?: (number | null)[];
    swell2?: (number | null)[];
    swell2Dir?: (number | null)[];
    swell2Period?: (number | null)[];
    /** Wave fields may come on their own time steps */
    wavesTs?: number[];
    wavesModel?: string;
    wavesRefTime?: string;
    /** Visibility in metres (Open-Meteo only; Windy's comes from its map layer) */
    vis?: (number | null)[];
    /** Relative humidity, % (Windy "rh" if sent; Open-Meteo relative_humidity_2m) */
    rh?: (number | null)[];
    /** Wind sea (wind waves) height / direction FROM / period on the wave times (Open-Meteo only) */
    windWave?: (number | null)[];
    windWaveDir?: (number | null)[];
    windWavePeriod?: (number | null)[];
    /** Where each stretch of time comes from (Windy now, Windy earlier run kept in the browser, Open-Meteo) */
    parts?: SeriesPart[];
}

/** One stretch of a point forecast and where it comes from (2026-11-02: past and longer weather) */
export interface SeriesPart {
    kind: 'windy' | 'kept' | 'openmeteo';
    /** Which data: 'air' (wind, pressure…) or 'waves' */
    group: 'air' | 'waves';
    from: number;
    to: number;
    /** e.g. "Windy ECMWF run 02 Nov 2026 00:00 UTC" */
    label: string;
}

/** Weather at one time and place, in mariner units. Null = no data. */
export interface WxPoint {
    windKn: number | null;
    gustKn: number | null;
    windDir: number | null;
    pressureHpa: number | null;
    precipMm: number | null;
    fog: boolean;
    thunder: boolean;
    hs: number | null;
    hsDir: number | null;
    hsPeriod: number | null;
    sw1: number | null;
    sw1Dir: number | null;
    sw1Period: number | null;
    sw2: number | null;
    sw2Dir: number | null;
    sw2Period: number | null;
    /** Wind sea height: Windy's wind-wave layer when read (seaWindy), else DERIVED as √(Hs² − swell1² − swell2²) */
    seaHs: number | null;
    /** Wind sea direction FROM and period, from Windy's wind-wave layer (owner, 2026-10-28) */
    seaDir?: number | null;
    seaPeriod?: number | null;
    /** True when the sea values come from Windy's wind-wave layer */
    seaWindy?: boolean;
    /** Wave power (energy flux), kW per metre of wave front */
    powerKw?: number | null;
    /** True when the power was worked out here (0.49 × SWH² × period) rather than sent by Windy */
    powerCalc?: boolean;
    /** Air temperature, °C */
    airTempC?: number | null;
    /** Sea surface temperature, °C (one value per forecast point, not hourly) */
    seaTempC?: number | null;
    /** Relative humidity, % */
    rhPct?: number | null;
    /** Visibility, nautical miles (from Windy's visibility layer) */
    visNm?: number | null;
    /** Values only available from the map layer sweep */
    wind100Kn?: number | null;
    wind100Dir?: number | null;
    currentKn?: number | null;
    /** Direction the current flows TOWARDS, degrees true */
    currentSet?: number | null;
}

// Windy weather symbol codes (node-forecast types, plugin-devtools 3.0.5)
const FOG_ICONS = new Set([17, 22]);
const THUNDER_ICONS = new Set([14, 15, 16, 21, 23, 24]);

const valid = (v: number | null | undefined): v is number => v != null && isFinite(v);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "26 Oct 2026 06:00 UTC" from an ISO time or ms; the text as given if it can't be read */
export function fmtRun(v: string | number | undefined | null): string {
    if (v == null || v === '') return 'time not given';
    const t = typeof v === 'number' ? v : Date.parse(String(v).replace(' ', 'T'));
    if (isNaN(t)) return String(v);
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** Which model runs the weather comes from, and when it was fetched (for display). */
export function forecastInfo(series: WxSeries[]): { air: string; waves: string; fetched: string; other: string[] } | null {
    const s = series.find(x => !x.model.startsWith('Open-Meteo')) ?? series[0];
    if (!s) return null;
    const fetched = Math.min(...series.map(x => x.fetchedAt ?? Infinity));
    // other sources (past times from earlier runs kept in the browser, Open-Meteo) with the times they cover
    const span = new Map<string, { from: number; to: number }>();
    for (const x of series)
        for (const p of x.parts ?? []) {
            if (p.kind === 'windy') continue;
            const o = span.get(p.label);
            span.set(p.label, o ? { from: Math.min(o.from, p.from), to: Math.max(o.to, p.to) } : { from: p.from, to: p.to });
        }
    const day = (t: number) => fmtRun(t).replace(/ \d{4}/, '');
    return {
        air: `${s.model} run ${fmtRun(s.refTime)}`,
        waves: s.wavesModel ? `${s.wavesModel} run ${fmtRun(s.wavesRefTime)}` : 'no wave data',
        fetched: isFinite(fetched) ? fmtRun(fetched) : 'unknown',
        other: [...span].sort((a, b) => a[1].from - b[1].from).map(([label, sp]) => `${label}: ${day(sp.from)} – ${day(sp.to)}`),
    };
}

/** Index i and fraction f so that t lies between ts[i] and ts[i+1]. Null if outside the series. */
function bracket(ts: number[], t: number): { i: number; f: number } | null {
    if (ts.length === 0 || t < ts[0] || t > ts[ts.length - 1]) {
        return null;
    }
    let lo = 0;
    let hi = ts.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (ts[mid] <= t) lo = mid;
        else hi = mid;
    }
    const span = ts[hi] - ts[lo];
    return { i: lo, f: span > 0 ? (t - ts[lo]) / span : 0 };
}

/** Largest gap between two forecast values that is still interpolated across. */
const MAX_GAP_MS = 12 * 3600_000;
/** How far from the nearest value a one-sided value may still be used. */
const ONE_SIDED_MS = 3 * 3600_000;

/**
 * Value of a series at time t, interpolated between the nearest VALID values before and after.
 * Windy can send hourly time steps with empty (null) slots where the model only has 3- or
 * 6-hourly data further out; those slots are skipped instead of ending the forecast.
 */
function valueAt(ts: number[], arr: (number | null)[] | undefined, t: number, mode: 'lin' | 'ang' | 'nearest'): number | null {
    if (!arr || !ts.length) return null;
    let lo = -1;
    let a = 0;
    let b = ts.length - 1;
    while (a <= b) {
        const m = (a + b) >> 1;
        if (ts[m] <= t) {
            lo = m;
            a = m + 1;
        } else b = m - 1;
    }
    let i = lo;
    while (i >= 0 && !valid(arr[i]) && t - ts[i] <= MAX_GAP_MS) i--;
    let j = lo >= 0 && ts[lo] === t ? lo : lo + 1;
    while (j < ts.length && !valid(arr[j]) && ts[j] - t <= MAX_GAP_MS) j++;
    const hasI = i >= 0 && valid(arr[i]) && t - ts[i] <= MAX_GAP_MS;
    const hasJ = j < ts.length && valid(arr[j]) && ts[j] - t <= MAX_GAP_MS;
    if (hasI && hasJ) {
        const vi = arr[i] as number;
        const vj = arr[j] as number;
        if (ts[j] === ts[i]) return mode === 'ang' ? norm360(vi) : vi;
        const f = (t - ts[i]) / (ts[j] - ts[i]);
        if (mode === 'nearest') return f < 0.5 ? vi : vj;
        if (mode === 'ang') return norm360(vi + norm180(vj - vi) * f);
        return vi + (vj - vi) * f;
    }
    if (hasI && t - ts[i] <= ONE_SIDED_MS) return mode === 'ang' ? norm360(arr[i] as number) : (arr[i] as number);
    if (hasJ && ts[j] - t <= ONE_SIDED_MS) return mode === 'ang' ? norm360(arr[j] as number) : (arr[j] as number);
    return null;
}

/** Weather from a series at time t, or null if t is outside the forecast. */
export function sampleSeries(s: WxSeries, t: number): WxPoint | null {
    if (!bracket(s.ts, t)) {
        return null;
    }
    // Wave values: use their own time steps if given; missing waves (e.g. on land) stay null.
    const wts = s.wavesTs ?? s.ts;
    const wv = (arr: (number | null)[] | undefined) => valueAt(wts, arr, t, 'lin');
    const wd = (arr: (number | null)[] | undefined) => valueAt(wts, arr, t, 'ang');
    const wind = valueAt(s.ts, s.wind, t, 'lin');
    const gust = valueAt(s.ts, s.windGust, t, 'lin');
    const pressure = valueAt(s.ts, s.pressure, t, 'lin');
    const icon = valueAt(s.ts, s.icon, t, 'nearest');
    const temp = valueAt(s.ts, s.temp, t, 'lin');
    const hs = wv(s.waves);
    const sw1 = wv(s.swell1);
    const sw2 = wv(s.swell2);
    const wwH = wv(s.windWave);
    const visM = valueAt(s.ts, s.vis, t, 'lin');
    if (!valid(wind) && !valid(hs) && !valid(pressure)) {
        // Inside the time range but no values at all: past the end of the usable forecast.
        return null;
    }
    return {
        windKn: valid(wind) ? wind * MS_TO_KN : null,
        gustKn: valid(gust) ? gust * MS_TO_KN : null,
        windDir: valueAt(s.ts, s.windDir, t, 'ang'),
        pressureHpa: valid(pressure) ? pressure / 100 : null,
        precipMm: valueAt(s.ts, s.precipAmount, t, 'nearest'),
        fog: icon != null && FOG_ICONS.has(icon),
        thunder: icon != null && THUNDER_ICONS.has(icon),
        hs,
        hsDir: wd(s.wavesDir),
        hsPeriod: wv(s.wavesPeriod),
        sw1,
        sw1Dir: wd(s.swell1Dir),
        sw1Period: wv(s.swell1Period),
        sw2,
        sw2Dir: wd(s.swell2Dir),
        sw2Period: wv(s.swell2Period),
        seaHs: valid(wwH) ? wwH : valid(hs) ? Math.sqrt(Math.max(0, hs * hs - (sw1 ?? 0) ** 2 - (sw2 ?? 0) ** 2)) : null,
        ...(valid(wwH) ? { seaDir: wd(s.windWaveDir), seaPeriod: wv(s.windWavePeriod) } : {}),
        ...(valid(visM) ? { visNm: visM / 1852 } : {}),
        rhPct: valueAt(s.ts, s.rh, t, 'lin'),
        ...wavePower(wv(s.wavesPower), hs, wv(s.wavesPeriod)),
        airTempC: valid(temp) ? (temp > 150 ? temp - 273.15 : temp) : null,
        seaTempC: valid(s.sstC) ? s.sstC : null,
    };
}

/**
 * Wave power in kW/m: Windy's value if sent, else the deep-water formula
 * P = ρ g² H² T / (64 π) ≈ 0.49 × H² × T (H = SWH in m, T = wave period in s; the energy period is
 * strictly needed, the mean period given is used instead, so this is an estimate).
 */
export function wavePower(fromWindy: number | null, hs: number | null, period: number | null): { powerKw: number | null; powerCalc: boolean } {
    if (valid(fromWindy)) return { powerKw: fromWindy, powerCalc: false };
    if (valid(hs) && valid(period)) return { powerKw: 0.49 * hs * hs * period, powerCalc: true };
    return { powerKw: null, powerCalc: false };
}

/** Wind speed in knots to Beaufort force. */
export function beaufort(kn: number | null): number | null {
    if (!valid(kn)) return null;
    const limits = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
    const i = limits.findIndex(l => kn < l);
    return i === -1 ? 12 : i;
}

// ---------- Limits by direction sector ----------

export type Sector = 'head' | 'bow' | 'beam' | 'quarter' | 'stern';
export const SECTORS: Sector[] = ['head', 'bow', 'beam', 'quarter', 'stern'];
export const SECTOR_LABEL: Record<Sector, string> = { head: 'Head', bow: 'Bow', beam: 'Beam', quarter: 'Quarter', stern: 'Stern' };

export interface SectorLimits {
    seas: number | null;
    swell: number | null;
    wind: number | null;
}

export interface Thresholds {
    hsAlert: number | null;
    hsLimit: number | null;
    alert: Record<Sector, SectorLimits>;
    limit: Record<Sector, SectorLimits>;
    /** Upper edges (deg off the bow) of head, bow, beam, quarter; stern is the rest */
    sectorEdges: [number, number, number, number];
    resonance: ResonanceSettings;
    /** Cold and ice: air / sea temperature and spray icing (owner, 2026-10-29) */
    cold?: ColdLimits;
}

const sectors = (seas: number, swell: number, wind: number): Record<Sector, SectorLimits> =>
    Object.fromEntries(SECTORS.map(s => [s, { seas, swell, wind }])) as Record<Sector, SectorLimits>;

/** Defaults taken from the owner's current routing tool (screenshots 2026-10-11). */
export const defaultThresholds = (): Thresholds => ({
    hsAlert: 4,
    hsLimit: 4,
    alert: sectors(4, 4, 25),
    limit: sectors(4, 4, 25),
    sectorEdges: [22.5, 67.5, 112.5, 157.5],
    resonance: { parametric: 4, synchronous: 4, highWaves: 5, broaching: 5, tolerancePct: 15 },
    cold: defaultCold(),
});

/** Angle off the bow, 0–180, of something coming FROM `fromDir` for a ship heading `heading`. */
export const relFrom = (fromDir: number, heading: number): number => Math.abs(norm180(fromDir - heading));

export function sectorOf(rel: number, edges: Thresholds['sectorEdges']): Sector {
    if (rel < edges[0]) return 'head';
    if (rel < edges[1]) return 'bow';
    if (rel < edges[2]) return 'beam';
    if (rel < edges[3]) return 'quarter';
    return 'stern';
}

/** 0 = fine, 1 = alert (amber), 2 = limit (red) */
export type Level = 0 | 1 | 2;

export interface LimitHit {
    what: string;
    level: Level;
    detail: string;
}

function grade(value: number | null, alert: number | null, limit: number | null): Level {
    if (!valid(value)) return 0;
    if (valid(limit) && value >= limit) return 2;
    if (valid(alert) && value >= alert) return 1;
    return 0;
}

export function checkLimits(wx: WxPoint, heading: number, th: Thresholds): LimitHit[] {
    const hits: LimitHit[] = [];
    const add = (what: string, level: Level, detail: string) => level && hits.push({ what, level, detail });
    add('SWH', grade(wx.hs, th.hsAlert, th.hsLimit), `SWH ${wx.hs?.toFixed(1)} m`);
    if (valid(wx.windDir)) {
        const s = sectorOf(relFrom(wx.windDir, heading), th.sectorEdges);
        add('Wind', grade(wx.windKn, th.alert[s].wind, th.limit[s].wind), `Wind ${wx.windKn?.toFixed(0)} kn on the ${s}`);
    }
    const sd = seaDirOf(wx);
    if (valid(sd)) {
        // sea direction: Windy's wind waves when read, else the wind direction
        const s = sectorOf(relFrom(sd, heading), th.sectorEdges);
        add('Sea', grade(wx.seaHs, th.alert[s].seas, th.limit[s].seas), `Sea ${wx.seaHs?.toFixed(1)} m on the ${s}${wx.seaWindy ? '' : ' (worked out from SWH; sea not read from Windy yet)'}`);
    }
    // Cold and ice: below the limits (lower = worse)
    const c = th.cold ?? defaultCold();
    const below = (v: number | null | undefined, alert: number | null, limit: number | null): Level =>
        !valid(v) ? 0 : valid(limit) && v <= limit ? 2 : valid(alert) && v <= alert ? 1 : 0;
    add('Air temp', below(wx.airTempC, c.airAlertC, c.airLimitC), `Air ${wx.airTempC?.toFixed(0)} °C`);
    add('Sea temp', below(wx.seaTempC, c.seaAlertC, c.seaLimitC), `Sea surface ${wx.seaTempC?.toFixed(1)} °C (ice possible near or below about −1.8 °C; Windy has no sea-ice data)`);
    const ic = sprayIcing(wx.windKn, wx.airTempC, wx.seaTempC);
    if (ic && ic.cls !== 'none') {
        const r = icingRank(ic.cls);
        const lvl: Level = c.icingLimit && r >= icingRank(c.icingLimit) ? 2 : c.icingAlert && r >= icingRank(c.icingAlert) ? 1 : 0;
        add('Icing', lvl, `Spray icing ${ic.cls} (${ICING_RATE[ic.cls]})`);
    }
    for (const [h, d, name] of [
        [wx.sw1, wx.sw1Dir, 'Swell 1'],
        [wx.sw2, wx.sw2Dir, 'Swell 2'],
    ] as const) {
        if (valid(d)) {
            const s = sectorOf(relFrom(d, heading), th.sectorEdges);
            add(name, grade(h, th.alert[s].swell, th.limit[s].swell), `${name} ${h?.toFixed(1)} m on the ${s}`);
        }
    }
    return hits;
}

/** The wave systems Windy gives with a period: total sea, swell 1, swell 2. */
/**
 * Direction the wind sea comes from. The wave model gives one direction for the combined sea state
 * (SWH); wind sea runs with the wind, so its direction is taken from the wind (falls back to the
 * combined direction when there is no wind direction).
 */
export const seaDirOf = (wx: WxPoint): number | null => (valid(wx.seaDir) ? wx.seaDir : valid(wx.windDir) ? wx.windDir : valid(wx.hsDir) ? wx.hsDir : null);

/**
 * The wave systems for the IMO checks and the polar diagram (owner, 2026-10-28): Windy's sea (wind
 * waves), swell 1 and swell 2. Until the sea has been read from Windy's map, SWH stands in for it.
 */
export function waveSystems(wx: WxPoint): WaveSystem[] {
    const out: WaveSystem[] = [];
    if (wx.seaWindy) {
        if (valid(wx.seaHs) && valid(wx.seaDir) && valid(wx.seaPeriod)) out.push({ label: 'Sea', height: wx.seaHs, fromDir: wx.seaDir, period: wx.seaPeriod });
    } else if (valid(wx.hs) && valid(wx.hsDir) && valid(wx.hsPeriod)) out.push({ label: 'SWH', height: wx.hs, fromDir: wx.hsDir, period: wx.hsPeriod });
    if (valid(wx.sw1) && valid(wx.sw1Dir) && valid(wx.sw1Period)) out.push({ label: 'Swell 1', height: wx.sw1, fromDir: wx.sw1Dir, period: wx.sw1Period });
    if (valid(wx.sw2) && valid(wx.sw2Dir) && valid(wx.sw2Period)) out.push({ label: 'Swell 2', height: wx.sw2, fromDir: wx.sw2Dir, period: wx.sw2Period });
    return out;
}

/** The four wave kinds, named the same everywhere (owner, 2026-10-30): SWH, Sea, Swell 1, Swell 2 */
export type WaveId = 'swh' | 'sea' | 'sw1' | 'sw2';
export const WAVE_IDS: WaveId[] = ['swh', 'sea', 'sw1', 'sw2'];
export const WAVE_LABEL: Record<WaveId, string> = { swh: 'SWH', sea: 'Sea', sw1: 'Swell 1', sw2: 'Swell 2' };

export interface WaveShown {
    id: WaveId;
    label: string;
    /** Height m, direction it comes FROM °T, period s (null = not known) */
    h: number | null;
    dir: number | null;
    period: number | null;
    /** Sea worked out from SWH and the swells (not read from Windy yet) */
    estimated: boolean;
}

/** The four wave kinds of a forecast point, in the order SWH, Sea, Swell 1, Swell 2 */
export function wavesOf(wx: WxPoint): WaveShown[] {
    return [
        { id: 'swh', label: 'SWH', h: wx.hs ?? null, dir: wx.hsDir ?? null, period: wx.hsPeriod ?? null, estimated: false },
        { id: 'sea', label: 'Sea', h: wx.seaHs ?? null, dir: seaDirOf(wx), period: wx.seaWindy ? (wx.seaPeriod ?? null) : null, estimated: !wx.seaWindy },
        { id: 'sw1', label: 'Swell 1', h: wx.sw1 ?? null, dir: wx.sw1Dir ?? null, period: wx.sw1Period ?? null, estimated: false },
        { id: 'sw2', label: 'Swell 2', h: wx.sw2 ?? null, dir: wx.sw2Dir ?? null, period: wx.sw2Period ?? null, estimated: false },
    ];
}

/**
 * Encounter period (s) of a wave system for the ship's heading and speed through the water (IMO
 * MSC.1/Circ.1228 para 1.6). Null when the period or direction is not known; Infinity when the ship
 * runs with the waves at their speed (they never pass).
 */
export function encounterOf(period: number | null | undefined, fromDir: number | null | undefined, headingDeg: number, speedKn: number): number | null {
    if (!valid(period) || !valid(fromDir) || !(period > 0)) return null;
    return encounterPeriod(period, Math.max(0, speedKn), encounterAngle(fromDir, headingDeg));
}

/** Encounter period as text: "9.4 s", "∞" when the waves never pass, "—" when not known */
export const fmtTe = (te: number | null): string => (te == null ? '—' : !isFinite(te) || te > 999 ? '∞' : `${te.toFixed(1)} s`);

export interface RollPeriodInfo {
    value: number | null;
    estimated: boolean;
}

export function rollPeriodFor(v: Vessel): RollPeriodInfo {
    if (v.rollPeriod && v.rollPeriod > 0) {
        return { value: v.rollPeriod, estimated: false };
    }
    const d = v.draftFwd != null && v.draftAft != null ? (v.draftFwd + v.draftAft) / 2 : (v.draftFwd ?? v.draftAft);
    const est = v.breadth && d && v.lbp && v.gm ? estimateRollPeriod(v.breadth, d, v.lbp, v.gm) : null;
    return { value: est, estimated: est != null };
}

// ---------- Table rows ----------

export interface WxRow {
    time: number;
    pos: ShipPosition;
    /** Speed used for the checks (planned speed through water) */
    speedKn: number;
    /** True when the row is at a waypoint ETA */
    atWaypoint: number | null;
    wx: WxPoint | null;
    /** True when the time is past the end of the forecast */
    beyond: boolean;
    series: WxSeries | null;
    limits: LimitHit[];
    resonance: ResonanceHit[];
    level: Level;
    /** Planned stop at a waypoint at this time */
    stopped: boolean;
    /** Drift while stopped (speed kn, direction TOWARDS °T) */
    drift: { kn: number; toward: number } | null;
    /** Speed over ground at this time (from the stepped track if available), kn */
    sog: number | null;
    /** Speed in calm water used at this time, kn (the user's planned speed, or what a fixed ETA needs) */
    sicw: number | null;
    /** Weather speed loss used, kn */
    lossKn: number | null;
    /** Current component along the track used for the SOG, kn (+ = helping) */
    curAlong: number | null;
    /** Where this row's weather comes from when it is not Windy's latest run: an earlier Windy run kept in
     *  this browser (past times) or Open-Meteo (free; past, or beyond the user's Windy plan) */
    src?: SeriesPart | null;
}

/** The part of a series in effect at time t, if it is not Windy's latest run */
export function otherSourceAt(s: WxSeries | null | undefined, t: number): SeriesPart | null {
    const p = s?.parts?.find(x => x.group === 'air' && t >= x.from - 1 && t <= x.to + 1) ?? s?.parts?.find(x => x.group === 'waves' && t >= x.from - 1 && t <= x.to + 1);
    return p && p.kind !== 'windy' ? p : null;
}

/** Windy's sea (wind waves) read from the map, nearest in time, put into the weather (owner, 2026-10-28) */
export function withWindySea(wx: WxPoint, sweep: Map<number, Partial<WxPoint>> | undefined, t: number): WxPoint {
    const s = nearestSweep(sweep, t, 'seaWindy');
    return s && s.seaWindy ? { ...wx, seaHs: s.seaHs ?? wx.seaHs, seaDir: s.seaDir ?? null, seaPeriod: s.seaPeriod ?? null, seaWindy: true } : wx;
}

/** Map-layer reading nearest in time to t (within `maxH` hours), or null. */
export function nearestSweep(sweep: Map<number, Partial<WxPoint>> | undefined, t: number, key: keyof WxPoint, maxH = 3): Partial<WxPoint> | null {
    if (!sweep) return null;
    let best: Partial<WxPoint> | null = null;
    let bd = maxH * HOUR + 1;
    for (const [ts, v] of sweep) {
        if (v[key] != null && Math.abs(ts - t) < bd) {
            bd = Math.abs(ts - t);
            best = v;
        }
    }
    return best;
}

const HOUR = 3600_000;

/** Track point in effect at time t (the last one at or before t). */
function trackAt(plan: PlanCalc, t: number) {
    const tr = plan.track;
    if (!tr || !tr.length) return null;
    let lo = 0;
    let hi = tr.length - 1;
    if (t < tr[0].t) return tr[0];
    while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (tr[m].t <= t) lo = m;
        else hi = m;
    }
    return tr[hi].t <= t ? tr[hi] : tr[lo];
}

/** Times for the table: from ETD every `stepH` hours, plus each waypoint ETA. */
export function rowTimes(plan: PlanCalc, stepH: number, max = 1500): { t: number; wp: number | null }[] {
    if (plan.etd == null || plan.eta == null) return [];
    const out: { t: number; wp: number | null }[] = [{ t: plan.etd, wp: 0 }];
    for (let t = plan.etd + stepH * HOUR; t < plan.eta - 60_000 && out.length < max; t += stepH * HOUR) {
        out.push({ t, wp: null });
    }
    plan.legs.forEach(l => l.arriveMs != null && out.push({ t: l.arriveMs, wp: l.index }));
    out.sort((a, b) => a.t - b.t || (a.wp == null ? 1 : -1));
    return out.filter((r, i) => i === 0 || Math.abs(r.t - out[i - 1].t) > 60_000 || r.wp != null);
}

/**
 * Where to fetch point forecasts: positions along the route every `spacingH` hours of sailing
 * (and the start and end), within the forecast window. Kept to at most `maxPoints`.
 */
export function fetchPlan(route: Route, plan: PlanCalc, spacingH: number, forecastEnd: number, maxPoints = 80): ShipPosition[] {
    if (plan.etd == null || plan.eta == null) return [];
    const end = Math.min(plan.eta, forecastEnd);
    let spacing = spacingH;
    while ((end - plan.etd) / (spacing * HOUR) > maxPoints) spacing *= 1.5;
    const pts: ShipPosition[] = [];
    for (let t = plan.etd; t <= end; t += spacing * HOUR) {
        const p = positionAt(route, plan, t);
        if (p) pts.push(p);
    }
    const last = positionAt(route, plan, end);
    if (last && (!pts.length || last.time - pts[pts.length - 1].time > 0.25 * spacing * HOUR)) pts.push(last);
    return pts;
}

/**
 * Where to fetch point forecasts: evenly along the whole route by distance (start and end
 * included), at least `minSpacingNm` apart and at most `maxPoints`. Each point forecast covers
 * the whole forecast period, so these stay valid whatever the times.
 */
export function routePoints(plan: PlanCalc, maxPoints = 80, minSpacingNm = 30): { lat: number; lon: number }[] {
    if (!plan.legs.length) return [];
    const spacing = Math.max(minSpacingNm, plan.totalNm / Math.max(1, maxPoints - 1));
    const n = Math.max(1, Math.round(plan.totalNm / spacing));
    const out: { lat: number; lon: number }[] = [];
    let li = 0;
    for (let i = 0; i <= n; i++) {
        const d = (plan.totalNm * i) / n;
        while (li < plan.legs.length - 1 && plan.legs[li].cumNm < d) li++;
        const leg = plan.legs[li];
        const p = leg.geom.pointAt(Math.max(0, Math.min(leg.distNm, d - (leg.cumNm - leg.distNm))));
        out.push({ lat: p.lat, lon: p.lon });
    }
    return out;
}

/** Build the weather table. `seriesFor(pos)` returns the fetched series nearest in time to the row. */
export function buildRows(
    route: Route,
    plan: PlanCalc,
    vessel: Vessel,
    th: Thresholds,
    stepH: number,
    series: WxSeries[],
    sweep?: Map<number, Partial<WxPoint>>,
): WxRow[] {
    const tr = rollPeriodFor(vessel);
    // series[] are in route order with the time they were fetched for in `fetchTimes`
    return rowTimes(plan, stepH).map(({ t, wp }) => {
        const pos = positionAt(route, plan, t) as ShipPosition;
        const leg = plan.legs[Math.max(0, pos.legIdx)];
        const tp = trackAt(plan, t);
        const stopped = !!pos.stopped;
        const speedKn = stopped ? 0 : tp && !tp.stopped && tp.stw > 0 ? tp.stw : leg ? leg.stw : 0;
        const s = nearestSeries(series, pos);
        let wx = s ? sampleSeries(s, t) : null;
        if (wx && sweep?.has(t)) wx = { ...wx, ...sweep.get(t) };
        if (wx && wx.currentKn == null) {
            const c = nearestSweep(sweep, t, 'currentKn');
            if (c) wx = { ...wx, currentKn: c.currentKn, currentSet: c.currentSet };
        }
        if (wx && wx.visNm == null) {
            const v = nearestSweep(sweep, t, 'visNm');
            if (v) wx = { ...wx, visNm: v.visNm };
        }
        if (wx && !wx.seaWindy) wx = withWindySea(wx, sweep, t);
        const beyond = !!s && !wx;
        const limits = wx ? checkLimits(wx, pos.course, th) : [];
        const resonance = wx
            ? waveSystems(wx).flatMap(ws =>
                  checkWaveSystem(ws, { headingDeg: pos.course, speedKn, lbp: vessel.lbp, rollPeriod: tr.value }, th.resonance),
              )
            : [];
        const level = Math.max(0, ...limits.map(l => l.level), resonance.length ? 2 : 0) as Level;
        return {
            time: t,
            pos,
            speedKn,
            atWaypoint: wp,
            wx,
            beyond,
            series: s,
            limits,
            resonance,
            level,
            stopped,
            drift: stopped ? (tp?.drift ?? null) : null,
            sog: stopped ? 0 : tp && tp.sog > 0 ? tp.sog : leg ? leg.sog : null,
            sicw: stopped ? null : tp && !tp.stopped && tp.sicw > 0 ? tp.sicw : leg ? leg.calmSpeed : null,
            lossKn: stopped ? null : tp && !tp.stopped ? tp.lossKn : leg ? leg.allowance : null,
            curAlong: stopped ? null : tp && !tp.stopped ? tp.curAlong : 0,
            src: wx ? otherSourceAt(s, t) : null,
        };
    });
}

/** Forecast points further than this from the ship are not used for it. */
const MAX_SERIES_NM = 150;

function nearestSeries(series: WxSeries[], pos: { lat: number; lon: number }): WxSeries | null {
    let best: WxSeries | null = null;
    let bestD = Infinity;
    for (const s of series) {
        const dLat = s.lat - pos.lat;
        const dLon = norm180(s.lon - pos.lon) * Math.cos((pos.lat * Math.PI) / 180);
        const d = dLat * dLat + dLon * dLon;
        if (d < bestD) {
            bestD = d;
            best = s;
        }
    }
    return best && Math.sqrt(bestD) * 60 <= MAX_SERIES_NM ? best : null;
}

/** Weather at a time and place from the fetched forecast points (null if none close enough or beyond the forecast). */
export function weatherAt(series: WxSeries[], pos: { lat: number; lon: number }, t: number): WxPoint | null {
    const s = nearestSeries(series, pos);
    return s ? sampleSeries(s, t) : null;
}
