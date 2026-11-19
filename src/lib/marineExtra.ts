// Sea (wind waves), current and visibility as DOWNLOADED point data (owner's report, 2026-11-19: "if i change the tab or
// minimise my browser - the update stops or hangs"). Until 0.25 these came only from reading Windy's drawn map, which
// browsers stop drawing while the tab is hidden or minimised. Now they come from Open-Meteo (free, CC BY 4.0) together
// with the forecast, so a hidden tab no longer stops anything; reading Windy's own map stays as an extra and, when
// done, takes over (it is Windy's data). Pure logic (tested without Windy).

/** Sea, current and visibility for one forecast point, on their own hourly times */
export interface Extra {
    ts: number[];
    /** Wind sea height m, direction FROM ° true, period s (Open-Meteo marine, Météo-France MFWAM) */
    seaH: (number | null)[];
    seaDir: (number | null)[];
    seaPer: (number | null)[];
    /** Current kn and where it flows TOWARDS ° true (Open-Meteo marine, Météo-France SMOC) */
    curKn: (number | null)[];
    curDir: (number | null)[];
    /** Visibility, metres (Open-Meteo forecast) */
    visM: (number | null)[];
    fetchedAt: number;
}

const KMH_PER_KN = 1.852;

export function extraUrls(lat: number, lon: number): { marine: string; vis: string } {
    const ll = `latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`;
    return {
        marine: `https://marine-api.open-meteo.com/v1/marine?${ll}&hourly=wind_wave_height,wind_wave_direction,wind_wave_period,ocean_current_velocity,ocean_current_direction&timeformat=unixtime&timezone=GMT&past_days=2&forecast_days=8`,
        vis: `https://api.open-meteo.com/v1/forecast?${ll}&hourly=visibility&timeformat=unixtime&timezone=GMT&past_days=2&forecast_days=15`,
    };
}

type J = { hourly?: Record<string, (number | null)[]>; hourly_units?: Record<string, string> } | null | undefined;
const times = (j: J) => (Array.isArray(j?.hourly?.time) ? (j!.hourly!.time as number[]).map(x => (x > 1e11 ? x : x * 1000)) : []);
const col = (j: J, k: string, n: number) => (Array.isArray(j?.hourly?.[k]) ? (j!.hourly![k] as (number | null)[]).map(v => (v == null || !isFinite(v) ? null : v)) : Array(n).fill(null));

/** Put the two answers on one hourly time line (the marine one where it exists, else the visibility one) */
export function extraFromJson(marine: J, vis: J, fetchedAt = Date.now()): Extra | null {
    const tm = times(marine);
    const tv = times(vis);
    const ts = [...new Set([...tm, ...tv])].sort((a, b) => a - b);
    if (!ts.length) return null;
    const unit = (marine?.hourly_units?.ocean_current_velocity ?? 'km/h').toLowerCase();
    const toKn = (v: number | null) => (v == null ? null : unit.includes('kn') ? v : unit.includes('m/s') ? (v * 3.6) / KMH_PER_KN : unit.includes('mph') ? (v * 1.609344) / KMH_PER_KN : v / KMH_PER_KN);
    const on = (src: number[], vals: (number | null)[]) => {
        const m = new Map(src.map((t, i) => [t, vals[i]]));
        return ts.map(t => m.get(t) ?? null);
    };
    const visU = (vis?.hourly_units?.visibility ?? 'm').toLowerCase();
    const visM = col(vis, 'visibility', tv.length).map(v => (v == null ? null : visU.startsWith('ft') ? v * 0.3048 : v));
    const out: Extra = {
        ts,
        seaH: on(tm, col(marine, 'wind_wave_height', tm.length)),
        seaDir: on(tm, col(marine, 'wind_wave_direction', tm.length)),
        seaPer: on(tm, col(marine, 'wind_wave_period', tm.length)),
        curKn: on(tm, col(marine, 'ocean_current_velocity', tm.length).map(toKn)),
        curDir: on(tm, col(marine, 'ocean_current_direction', tm.length)),
        visM: on(tv, visM),
        fetchedAt,
    };
    const any = (a: (number | null)[]) => a.some(v => v != null);
    return any(out.seaH) || any(out.curKn) || any(out.visM) ? out : null;
}

/** Value at a time: straight line between the two hours around it (angles the short way), none if more than 1.5 h away */
export function extraAt(e: Extra | undefined | null, key: Exclude<keyof Extra, 'ts' | 'fetchedAt'>, t: number, angle = false): number | null {
    if (!e || !e.ts.length) return null;
    const ts = e.ts;
    const a = e[key] as (number | null)[];
    let j = ts.findIndex(x => x >= t);
    if (j < 0) j = ts.length;
    const i = j - 1;
    const vi = i >= 0 && t - ts[i] <= 1.5 * 3600e3 ? a[i] : null;
    const vj = j < ts.length && ts[j] - t <= 1.5 * 3600e3 ? a[j] : null;
    if (vi != null && vj != null) {
        const f = ts[j] === ts[i] ? 0 : (t - ts[i]) / (ts[j] - ts[i]);
        if (!angle) return vi + (vj - vi) * f;
        const d = ((((vj - vi) % 360) + 540) % 360) - 180;
        return (((vi + d * f) % 360) + 360) % 360;
    }
    return vi ?? vj ?? null;
}
