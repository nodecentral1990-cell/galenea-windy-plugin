// Weather for a place, hour by hour (owner, 2026-11-13: "port weather"): wind, gust, waves (SWH, sea, swell 1,
// swell 2), wave power, air temperature and feels-like, sea temperature, current, rain, weather in words, tide;
// per day: sunrise / sunset, moonrise / moonset, high and low water. Pure logic: the data come in (tests run it
// without Windy). Times UTC.

import { moonPhase, moonTimes, sunTimes, type RiseSet } from './astro';
import { tideAt, tideTurns, type TideTurn } from './tides';
import { beaufort, sampleSeries, wavesOf, type WxPoint, type WxSeries } from './weather';

const DAY = 86400_000;
const HOUR = 3600_000;
const KMH_PER_KN = 1.852;

/** Open-Meteo marine data for the place (hourly): sea level (tide), current, sea temperature, wind sea */
export interface Marine {
    ts: number[];
    seaLevel: (number | null)[];
    /** knots */
    curKn: (number | null)[];
    /** where the current flows TOWARDS, ° true */
    curDir: (number | null)[];
    sstC: (number | null)[];
    seaHs: (number | null)[];
    seaPer: (number | null)[];
    /** wind sea comes FROM, ° true */
    seaDir: (number | null)[];
}

/** Read Open-Meteo's marine answer (any speed / length unit it says it used) */
export function marineFromJson(j: unknown): Marine | null {
    const o = j as { hourly?: Record<string, (number | null)[]>; hourly_units?: Record<string, string> };
    const h = o?.hourly;
    if (!h || !Array.isArray(h.time)) return null;
    const ts = (h.time as number[]).map(x => (x > 1e11 ? x : x * 1000));
    const u = o.hourly_units ?? {};
    const toKn = (v: number | null) => {
        if (v == null || !isFinite(v)) return null;
        const unit = (u.ocean_current_velocity ?? 'km/h').toLowerCase();
        return unit.includes('kn') ? v : unit.includes('m/s') ? (v * 3.6) / KMH_PER_KN : unit.includes('mph') ? (v * 1.609344) / KMH_PER_KN : v / KMH_PER_KN;
    };
    const toM = (v: number | null, key: string) => (v == null || !isFinite(v) ? null : (u[key] ?? 'm').toLowerCase().startsWith('ft') ? v * 0.3048 : v);
    const arr = (k: string) => (Array.isArray(h[k]) ? (h[k] as (number | null)[]) : ts.map(() => null));
    return {
        ts,
        seaLevel: arr('sea_level_height_msl').map(v => toM(v, 'sea_level_height_msl')),
        curKn: arr('ocean_current_velocity').map(toKn),
        curDir: arr('ocean_current_direction'),
        sstC: arr('sea_surface_temperature'),
        seaHs: arr('wind_wave_height').map(v => toM(v, 'wind_wave_height')),
        seaPer: arr('wind_wave_period'),
        seaDir: arr('wind_wave_direction'),
    };
}

/** The Open-Meteo marine request for a place (hourly, `days` ahead, from the start of yesterday) */
export function marineUrl(lat: number, lon: number, days: number): string {
    const vars = 'sea_level_height_msl,ocean_current_velocity,ocean_current_direction,sea_surface_temperature,wind_wave_height,wind_wave_period,wind_wave_direction';
    return `https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=${vars}&timeformat=unixtime&timezone=GMT&past_days=1&forecast_days=${Math.min(8, days + 1)}`;
}

const near = (m: Marine | null, t: number): number => {
    if (!m || !m.ts.length) return -1;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < m.ts.length; i++) {
        const d = Math.abs(m.ts[i] - t);
        if (d < bd) {
            bd = d;
            best = i;
        }
        if (m.ts[i] > t) break;
    }
    return bd <= 1.5 * HOUR ? best : -1;
};

/** Feels-like temperature: wind chill (≤ 10 °C, wind over 3 km/h) or heat index (≥ 27 °C, humidity ≥ 40 %), else the air temperature */
export function feelsLikeC(tC: number | null | undefined, windKn: number | null | undefined, rhPct: number | null | undefined): { c: number | null; how: 'wind chill' | 'heat index' | 'air' } {
    if (tC == null || !isFinite(tC)) return { c: null, how: 'air' };
    const v = (windKn ?? 0) * KMH_PER_KN;
    if (tC <= 10 && v > 4.8) {
        const p = Math.pow(v, 0.16);
        return { c: 13.12 + 0.6215 * tC - 11.37 * p + 0.3965 * tC * p, how: 'wind chill' };
    }
    if (tC >= 27 && rhPct != null && rhPct >= 40) {
        const T = tC * 1.8 + 32;
        const R = rhPct;
        const hi = -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 0.00683783 * T * T - 0.05481717 * R * R + 0.00122874 * T * T * R + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
        return { c: (hi - 32) / 1.8, how: 'heat index' };
    }
    return { c: tC, how: 'air' };
}

/** Windy's weather symbol code (node-forecast WeatherConditionIcon) → words and a picture */
export type WxKind = 'clear' | 'fewclouds' | 'partly' | 'cloudy' | 'rain' | 'showers' | 'snow' | 'sleet' | 'thunder' | 'fog';
const ICONS: Record<number, [string, WxKind]> = {
    1: ['Clear', 'clear'],
    2: ['Mostly clear', 'fewclouds'],
    3: ['Partly cloudy', 'partly'],
    4: ['Cloudy', 'cloudy'],
    5: ['Light rain', 'rain'],
    6: ['Rain', 'rain'],
    7: ['Rain', 'rain'],
    8: ['Light snow', 'snow'],
    9: ['Snow', 'snow'],
    10: ['Snow', 'snow'],
    11: ['Rain and snow', 'sleet'],
    12: ['Rain and snow', 'sleet'],
    13: ['Rain and snow', 'sleet'],
    14: ['Thunderstorm', 'thunder'],
    15: ['Thunder, snow', 'thunder'],
    16: ['Thunder, rain and snow', 'thunder'],
    17: ['Fog', 'fog'],
    18: ['Showers', 'showers'],
    19: ['Showers', 'showers'],
    20: ['Showers', 'showers'],
    21: ['Thunder showers', 'thunder'],
    22: ['Fog patches', 'fog'],
    23: ['Thunderstorm', 'thunder'],
    24: ['Thunderstorm', 'thunder'],
};
/** "windy" from Beaufort 6, "gale" from 8, "storm" from 10 */
export function windWord(windKn: number | null | undefined): string {
    const bf = windKn != null ? beaufort(windKn) : null;
    return bf == null ? '' : bf >= 10 ? 'storm' : bf >= 8 ? 'gale' : bf >= 6 ? 'windy' : '';
}
export function weatherWords(icon: number | null | undefined, windKn: number | null | undefined, precipMm: number | null | undefined): { words: string; kind: WxKind } {
    const base = icon != null && ICONS[icon] ? ICONS[icon] : precipMm != null && precipMm >= 0.2 ? (['Rain', 'rain'] as [string, WxKind]) : null;
    const wind = windWord(windKn);
    if (!base) return { words: wind ? wind[0].toUpperCase() + wind.slice(1) : '—', kind: 'partly' };
    return { words: base[0] + (wind ? `, ${wind}` : ''), kind: base[1] };
}

export interface PlaceHour {
    t: number;
    wx: WxPoint | null;
    words: string;
    kind: WxKind;
    feelsC: number | null;
    feelsHow: string;
    /** Sea (wind waves): Windy's when it has one, else Open-Meteo's */
    sea: { h: number | null; period: number | null; dir: number | null; src: 'windy' | 'openmeteo' | 'derived' | null };
    /** Rain in this hour, mm (a 3-hour total is shared out over its 3 hours) */
    rainMm: number | null;
    curKn: number | null;
    curSet: number | null;
    sstC: number | null;
    tideM: number | null;
    /** A high / low water in this hour */
    turn: TideTurn | null;
    /** Which forecast the weather came from (Windy run, Open-Meteo fill) */
    src: string;
}

export interface PlaceDay {
    day: number;
    sun: RiseSet;
    moon: RiseSet;
    moonName: string;
    moonPct: number;
    turns: TideTurn[];
    windMax: number | null;
    gustMax: number | null;
    swhMax: number | null;
    rainMm: number | null;
    tMin: number | null;
    tMax: number | null;
    words: string;
    kind: WxKind;
}

/** Hour-by-hour rows and day summaries for `days` UTC days from `startDay` (00:00 UTC). */
export function buildPlace(series: WxSeries | null, marine: Marine | null, lat: number, lon: number, startDay: number, days: number, iconAt?: (t: number) => number | null, srcAt?: (t: number) => string): { hours: PlaceHour[]; days: PlaceDay[]; turns: TideTurn[] } {
    const turns = marine ? tideTurns(marine.ts, marine.seaLevel) : [];
    const hours: PlaceHour[] = [];
    for (let t = startDay; t < startDay + days * DAY; t += HOUR) {
        const wx = series ? sampleSeries(series, t) : null;
        const i = near(marine, t);
        const icon = iconAt ? iconAt(t) : null;
        const ww = weatherWords(icon, wx?.windKn, wx?.precipMm);
        const fl = feelsLikeC(wx?.airTempC, wx?.windKn, wx?.rhPct);
        const omSea = i >= 0 && marine?.seaHs[i] != null ? { h: marine.seaHs[i], period: marine.seaPer[i], dir: marine.seaDir[i], src: 'openmeteo' as const } : null;
        const sea = wx?.seaWindy ? { h: wx.seaHs, period: wx.seaPeriod ?? null, dir: wx.seaDir ?? null, src: 'windy' as const } : (omSea ?? { h: wx?.seaHs ?? null, period: null, dir: null, src: wx?.seaHs != null ? ('derived' as const) : null });
        hours.push({
            t,
            wx,
            words: ww.words,
            kind: ww.kind,
            feelsC: fl.c,
            feelsHow: fl.how,
            sea,
            rainMm: wx?.precipMm != null && series ? wx.precipMm / stepHoursAt(series, t) : null,
            curKn: i >= 0 ? marine!.curKn[i] : null,
            curSet: i >= 0 ? marine!.curDir[i] : null,
            sstC: wx?.seaTempC ?? (i >= 0 ? marine!.sstC[i] : null),
            tideM: marine ? tideAt(marine.ts, marine.seaLevel, t) : null,
            turn: turns.find(x => x.t >= t - HOUR / 2 && x.t < t + HOUR / 2) ?? null,
            src: srcAt ? srcAt(t) : '',
        });
    }
    const out: PlaceDay[] = [];
    for (let d = 0; d < days; d++) {
        const day = startDay + d * DAY;
        const hs = hours.filter(h => h.t >= day && h.t < day + DAY);
        const nums = (f: (h: PlaceHour) => number | null | undefined) => hs.map(f).filter((v): v is number => v != null && isFinite(v));
        const max = (a: number[]) => (a.length ? Math.max(...a) : null);
        const min = (a: number[]) => (a.length ? Math.min(...a) : null);
        const rain = nums(h => h.rainMm);
        // the most frequent weather picture in daylight (or all day)
        const counts = new Map<string, number>();
        for (const h of hs) counts.set(h.words.split(',')[0], (counts.get(h.words.split(',')[0]) ?? 0) + 1);
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
        const mp = moonPhase(day + DAY / 2);
        const windMax = max(nums(h => h.wx?.windKn));
        out.push({
            day,
            sun: sunTimes(day, lat, lon),
            moon: moonTimes(day, lat, lon),
            moonName: mp.name,
            moonPct: Math.round(mp.fraction * 100),
            turns: turns.filter(x => x.t >= day && x.t < day + DAY),
            windMax,
            gustMax: max(nums(h => h.wx?.gustKn)),
            swhMax: max(nums(h => h.wx?.hs)),
            // 1-hour rows: the forecast's hourly amount (interpolated from 3-hourly totals when the forecast is 3-hourly)
            rainMm: rain.length ? rain.reduce((a, b) => a + b, 0) : null,
            tMin: min(nums(h => h.wx?.airTempC)),
            tMax: max(nums(h => h.wx?.airTempC)),
            words: top + (windWord(windMax) ? `, ${windWord(windMax)}` : ''),
            kind: hs.find(h => h.words.startsWith(top))?.kind ?? 'partly',
        });
    }
    return { hours, days: out, turns };
}

/** Hours covered by the forecast step at a time (1 or 3; a 3-hour rain total is for 3 hours) */
function stepHoursAt(s: WxSeries, t: number): number {
    const ts = s.ts;
    if (ts.length < 2) return 1;
    let i = ts.findIndex(x => x >= t);
    if (i < 0) i = ts.length - 1;
    const gap = i > 0 ? ts[i] - ts[i - 1] : ts[1] - ts[0];
    return Math.max(1, Math.round(gap / HOUR));
}

/** The four waves of an hour in the plugin's names, with the place's sea (owner: "SWH, Sea, Swell 1, Swell 2") */
export function placeWaves(h: PlaceHour) {
    const base = h.wx ? wavesOf(h.wx) : [];
    return base.map(w => (w.id === 'sea' ? { ...w, h: h.sea.h, period: h.sea.period, dir: h.sea.dir, estimated: h.sea.src === 'derived' } : w));
}
