// Past and longer weather (owner, 2026-11-02, points 5 and 6; see windy/notes/data-sources-research.md):
// - Windy's point forecast starts at its latest model run, so times before it vanished from the table.
//   Earlier runs fetched by the plugin are now kept in the browser and fill the times before the new run.
// - Users without Windy Premium get fewer days; Windy pads its "extended" view with FAKE promotional days.
//   Those are dropped, and the free Open-Meteo forecast fills the times Windy does not cover.
// Pure logic, no Windy: tested in test/seriesmerge.test.ts.

import { fmtRun, type SeriesPart, type WxSeries } from './weather';

type Arr = (number | null)[];

/** Values on the air times (ts) */
export const AIR_KEYS = ['wind', 'windGust', 'windDir', 'pressure', 'precipAmount', 'icon', 'temp', 'vis', 'rh'] as const;
/** Values on the wave times (wavesTs) */
export const WAVE_KEYS = ['waves', 'wavesDir', 'wavesPeriod', 'wavesPower', 'swell1', 'swell1Dir', 'swell1Period', 'swell2', 'swell2Dir', 'swell2Period', 'windWave', 'windWaveDir', 'windWavePeriod'] as const;
type AirKey = (typeof AIR_KEYS)[number];
type WaveKey = (typeof WAVE_KEYS)[number];

const ok = (v: number | null | undefined): v is number => v != null && isFinite(v);

/**
 * Indices of Windy's fake promotional days ("isFake" in the forecast summary: shown to users without Premium
 * to advertise the extended forecast; not real data). `summary` is Windy's day list (array or object).
 */
export function fakeIndices(summary: unknown, n: number): Set<number> {
    const out = new Set<number>();
    const days = Array.isArray(summary) ? summary : summary && typeof summary === 'object' ? Object.values(summary as object) : [];
    for (const d of days as { isFake?: boolean; index?: number; segments?: number }[]) {
        if (!d || !d.isFake || typeof d.index !== 'number') continue;
        const end = Math.min(n, d.index + (typeof d.segments === 'number' ? d.segments : 0));
        for (let i = Math.max(0, d.index); i < end; i++) out.add(i);
    }
    return out;
}

/** The arrays of a Windy data table without the given indices (ts and every array of the same length) */
export function dropIndices(data: Record<string, unknown>, drop: Set<number>): Record<string, unknown> {
    if (!drop.size || !Array.isArray(data.ts)) return data;
    const n = (data.ts as unknown[]).length;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) out[k] = Array.isArray(v) && v.length === n ? v.filter((_, i) => !drop.has(i)) : v;
    return out;
}

/** First and last time with a real value of `key` (null if none) */
export function validSpan(ts: number[] | undefined, arr: Arr | undefined): { from: number; to: number } | null {
    if (!ts || !arr) return null;
    let from = -1;
    let to = -1;
    for (let i = 0; i < ts.length; i++) {
        if (ok(arr[i])) {
            if (from < 0) from = i;
            to = i;
        }
    }
    return from < 0 ? null : { from: ts[from], to: ts[to] };
}

/** Spacing of the forecast steps (median, ms), e.g. 1 h for Premium, 3 h for free users */
export function stepOf(ts: number[] | undefined): number | null {
    if (!ts || ts.length < 2) return null;
    const d = ts
        .slice(1)
        .map((t, i) => t - ts[i])
        .filter(x => x > 0)
        .sort((a, b) => a - b);
    return d.length ? d[d.length >> 1] : null;
}

type Group<K extends string> = { ts: number[]; arrs: Partial<Record<K, Arr>> };

/** `extra` times before `span.from` and after `span.to`, around `main`'s times inside the span */
function spliceGroup<K extends string>(main: Group<K>, extra: Group<K>, keys: readonly K[], span: { from: number; to: number }): Group<K> {
    const pick: { src: Group<K>; i: number }[] = [];
    extra.ts.forEach((t, i) => t < span.from - 60_000 && pick.push({ src: extra, i }));
    main.ts.forEach((t, i) => t >= span.from && t <= span.to && pick.push({ src: main, i }));
    extra.ts.forEach((t, i) => t > span.to + 60_000 && pick.push({ src: extra, i }));
    const arrs: Partial<Record<K, Arr>> = {};
    for (const k of keys) {
        if (!main.arrs[k] && !extra.arrs[k]) continue;
        arrs[k] = pick.map(p => p.src.arrs[k]?.[p.i] ?? null);
    }
    return { ts: pick.map(p => p.src.ts[p.i]), arrs };
}

const airOf = (s: WxSeries): Group<AirKey> => ({ ts: s.ts, arrs: Object.fromEntries(AIR_KEYS.map(k => [k, s[k]])) as Partial<Record<AirKey, Arr>> });
const wavesOfS = (s: WxSeries): Group<WaveKey> => ({ ts: s.wavesTs?.length ? s.wavesTs : s.ts, arrs: Object.fromEntries(WAVE_KEYS.map(k => [k, s[k]])) as Partial<Record<WaveKey, Arr>> });

/** Where the main series' own values run (wind / pressure for the air, SWH / swell for the waves) */
function airSpan(s: WxSeries) {
    return validSpan(s.ts, s.wind) ?? validSpan(s.ts, s.pressure);
}
function waveSpan(s: WxSeries) {
    const wts = s.wavesTs?.length ? s.wavesTs : s.ts;
    return validSpan(wts, s.waves) ?? validSpan(wts, s.swell1);
}

/** The parts of a series (as given, or one part per group from its own times) */
export function partsOf(s: WxSeries, kind: SeriesPart['kind'] = 'windy'): SeriesPart[] {
    if (s.parts?.length) return s.parts;
    const out: SeriesPart[] = [];
    const a = airSpan(s);
    if (a) out.push({ kind, group: 'air', ...a, label: `Windy ${s.model}${s.refTime ? ` run ${fmtRun(s.refTime)}` : ''}` });
    const w = waveSpan(s);
    if (w) out.push({ kind, group: 'waves', ...w, label: `Windy ${s.wavesModel ?? s.model}${s.wavesRefTime ? ` run ${fmtRun(s.wavesRefTime)}` : ''}` });
    return out;
}

/**
 * `main` with `extra`'s values for the times main does not cover (before its first or after its last real value),
 * separately for the air and the waves. `kind` / `label` describe extra in the parts list. main's own values win.
 */
export function spliceSeries(main: WxSeries, extra: WxSeries, kind: SeriesPart['kind'], label: { air: string; waves: string }): WxSeries {
    const aSpan = airSpan(main);
    const wSpan = waveSpan(main);
    const parts = partsOf(main).slice();
    const out: WxSeries = { ...main };
    const addParts = (group: 'air' | 'waves', ts: number[], span: { from: number; to: number } | null, arr: Arr | undefined) => {
        const before = ts.filter((t, i) => ok(arr?.[i]) && (!span || t < span.from - 60_000));
        const after = ts.filter((t, i) => ok(arr?.[i]) && span && t > span.to + 60_000);
        if (before.length) parts.push({ kind, group, from: before[0], to: before[before.length - 1], label: label[group] });
        if (after.length) parts.push({ kind, group, from: after[0], to: after[after.length - 1], label: label[group] });
    };
    {
        const span = aSpan ?? { from: Infinity, to: -Infinity };
        const g = spliceGroup(airOf(main), airOf(extra), AIR_KEYS, span);
        addParts('air', extra.ts, aSpan, extra.wind ?? extra.pressure);
        out.ts = g.ts;
        for (const k of AIR_KEYS) (out as unknown as Record<string, unknown>)[k] = g.arrs[k];
    }
    {
        const span = wSpan ?? { from: Infinity, to: -Infinity };
        const eg = wavesOfS(extra);
        const g = spliceGroup(wavesOfS(main), eg, WAVE_KEYS, span);
        addParts('waves', eg.ts, wSpan, extra.waves ?? extra.swell1);
        out.wavesTs = g.ts;
        for (const k of WAVE_KEYS) (out as unknown as Record<string, unknown>)[k] = g.arrs[k];
    }
    out.parts = parts.sort((a, b) => a.from - b.from);
    if (out.sstC == null) out.sstC = extra.sstC ?? null;
    return out;
}

/** Times with no real value from `start` to `end` (ms): before the series starts and after it ends */
export function gaps(s: WxSeries, start: number, end: number): { before: boolean; after: boolean } {
    const a = airSpan(s);
    const w = waveSpan(s);
    const from = Math.max(a?.from ?? Infinity, w?.from ?? -Infinity);
    const to = Math.min(a?.to ?? -Infinity, w?.to ?? Infinity);
    return { before: start < from - 3600e3, after: end > to + 3600e3 };
}

/** The source in effect at time t for the air values ('windy' if not known) */
export function sourceAt(s: WxSeries | null | undefined, t: number, group: 'air' | 'waves' = 'air'): SeriesPart | null {
    if (!s?.parts) return null;
    return s.parts.find(p => p.group === group && t >= p.from - 1 && t <= p.to + 1) ?? null;
}

// ---------- Open-Meteo (free, CC BY 4.0; see data-sources-research.md B) ----------

/** Open-Meteo weather model used for wind, gusts, pressure, temperature, rain (ECMWF IFS 0.25°, 15 days) */
export const OM_AIR_MODEL = 'ecmwf_ifs025';
/** Open-Meteo wave model: GFS Wave 0.25° (worldwide, 16 days, the only one with sea / swell 1 / swell 2 split) */
export const OM_WAVE_MODEL = 'ncep_gfswave025';
export const OM_AIR_VARS = ['wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'pressure_msl', 'temperature_2m', 'precipitation', 'weather_code', 'visibility', 'relative_humidity_2m'];
export const OM_WAVE_VARS = [
    'wave_height',
    'wave_direction',
    'wave_period',
    'wind_wave_height',
    'wind_wave_direction',
    'wind_wave_period',
    'swell_wave_height',
    'swell_wave_direction',
    'swell_wave_period',
    'secondary_swell_wave_height',
    'secondary_swell_wave_direction',
    'secondary_swell_wave_period',
];

/** Open-Meteo request URLs for one position. `pastDays` 0–92, `days` of forecast ahead. */
export function omUrls(lat: number, lon: number, pastDays: number, days: { air: number; waves: number }): { air: string; waves: string } {
    const p = Math.max(0, Math.min(92, Math.ceil(pastDays)));
    const common = `latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&past_days=${p}&timeformat=unixtime&timezone=GMT`;
    return {
        air: `https://api.open-meteo.com/v1/forecast?${common}&hourly=${OM_AIR_VARS.join(',')}&models=${OM_AIR_MODEL}&forecast_days=${days.air}&wind_speed_unit=ms`,
        waves: `https://marine-api.open-meteo.com/v1/marine?${common}&hourly=${OM_WAVE_VARS.join(',')}&models=${OM_WAVE_MODEL}&forecast_days=${days.waves}`,
    };
}

type OmJson = { hourly?: Record<string, unknown>; error?: boolean; reason?: string } | null;

// WMO weather codes → Windy weather symbols used by the plugin (fog 17, thunderstorm 14)
const wmoIcon = (c: number | null): number | null => (c == null ? null : c === 45 || c === 48 ? 17 : c >= 95 ? 14 : null);

/**
 * Open-Meteo's answers turned into the plugin's forecast series (same units as Windy: wind m/s, pressure Pa,
 * temperature °C, waves m / ° / s). Either answer may be missing.
 */
export function omToSeries(lat: number, lon: number, air: OmJson, waves: OmJson, fetchedAt = Date.now()): WxSeries | null {
    const ha = air?.hourly;
    const hw = waves?.hourly;
    const num = (h: Record<string, unknown> | undefined, k: string): Arr | undefined => (Array.isArray(h?.[k]) ? (h?.[k] as unknown[]).map(v => (typeof v === 'number' && isFinite(v) ? v : null)) : undefined);
    const tsOf = (h: Record<string, unknown> | undefined) => (Array.isArray(h?.time) ? (h?.time as number[]).map(t => (t < 1e11 ? t * 1000 : t)) : []);
    const ts = tsOf(ha);
    const wts = tsOf(hw);
    if (!ts.length && !wts.length) return null;
    const press = num(ha, 'pressure_msl');
    return {
        lat,
        lon,
        ts: ts.length ? ts : wts,
        model: 'Open-Meteo ECMWF IFS 0.25°',
        fetchedAt,
        wind: num(ha, 'wind_speed_10m'),
        windGust: num(ha, 'wind_gusts_10m'),
        windDir: num(ha, 'wind_direction_10m'),
        pressure: press?.map(v => (v == null ? null : v * 100)),
        precipAmount: num(ha, 'precipitation'),
        icon: num(ha, 'weather_code')?.map(wmoIcon),
        temp: num(ha, 'temperature_2m'),
        vis: num(ha, 'visibility'),
        rh: num(ha, 'relative_humidity_2m'),
        wavesTs: wts,
        waves: num(hw, 'wave_height'),
        wavesDir: num(hw, 'wave_direction'),
        wavesPeriod: num(hw, 'wave_period'),
        swell1: num(hw, 'swell_wave_height'),
        swell1Dir: num(hw, 'swell_wave_direction'),
        swell1Period: num(hw, 'swell_wave_period'),
        swell2: num(hw, 'secondary_swell_wave_height'),
        swell2Dir: num(hw, 'secondary_swell_wave_direction'),
        swell2Period: num(hw, 'secondary_swell_wave_period'),
        windWave: num(hw, 'wind_wave_height'),
        windWaveDir: num(hw, 'wind_wave_direction'),
        windWavePeriod: num(hw, 'wind_wave_period'),
        wavesModel: wts.length ? 'Open-Meteo GFS Wave 0.25°' : undefined,
    };
}

/** Kept series older than this are forgotten (past weather memory) */
export const HISTORY_KEEP_MS = 45 * 86400e3;

/** A newly fetched Windy series with the earlier times from a kept older one (earlier run) put in front */
export function withHistory(fresh: WxSeries, kept: WxSeries | null | undefined, runLabel: (s: WxSeries) => { air: string; waves: string }): WxSeries {
    if (!kept || !kept.ts?.length) return fresh;
    const a = airSpan(fresh);
    const w = waveSpan(fresh);
    // only the part of the kept series before the new run; anything after comes from the new run
    const keptPast: WxSeries = { ...kept, parts: undefined };
    const merged = spliceSeries(fresh, trimAfter(keptPast, a?.from ?? Infinity, w?.from ?? Infinity), 'kept', runLabel(kept));
    // the kept series' own earlier history (its parts that were 'kept' or 'windy' before its run)
    const old = (kept.parts ?? []).filter(p => p.kind !== 'openmeteo');
    if (old.length) {
        merged.parts = (merged.parts ?? []).flatMap(p => {
            if (p.kind !== 'kept') return [p];
            const inside = old.filter(o => o.group === p.group && o.to >= p.from && o.from <= p.to);
            return inside.length ? inside.map(o => ({ ...o, kind: 'kept' as const, from: Math.max(o.from, p.from), to: Math.min(o.to, p.to) })) : [p];
        });
    }
    return merged;
}

/** A series with its air values after `airTo` and wave values after `waveTo` removed */
function trimAfter(s: WxSeries, airTo: number, waveTo: number): WxSeries {
    const out: WxSeries = { ...s };
    const keepA = s.ts.map(t => t < airTo - 60_000);
    out.ts = s.ts.filter((_, i) => keepA[i]);
    for (const k of AIR_KEYS) if (s[k]) (out as unknown as Record<string, unknown>)[k] = (s[k] as Arr).filter((_, i) => keepA[i]);
    const wts = s.wavesTs?.length ? s.wavesTs : s.ts;
    const keepW = wts.map(t => t < waveTo - 60_000);
    out.wavesTs = wts.filter((_, i) => keepW[i]);
    for (const k of WAVE_KEYS) if (s[k]) (out as unknown as Record<string, unknown>)[k] = (s[k] as Arr).filter((_, i) => keepW[i]);
    return out;
}
