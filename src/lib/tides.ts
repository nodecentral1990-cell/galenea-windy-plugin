// Tides from a sea-level series (owner, 2026-11-13): high and low waters found in hourly heights, their time and
// height refined with a parabola through the three hours around each turn. Heights are what the model gives
// (Open-Meteo marine "sea_level_height_msl": relative to MEAN SEA LEVEL, not chart datum). A guide only:
// official tide tables (Admiralty / national hydrographic office) for navigation.

export interface TideTurn {
    kind: 'high' | 'low';
    /** UTC ms */
    t: number;
    /** metres (model, relative to mean sea level) */
    h: number;
}

/** High and low waters in a series (`ts` UTC ms, `h` metres, nulls allowed). */
export function tideTurns(ts: number[], h: (number | null)[]): TideTurn[] {
    const out: TideTurn[] = [];
    for (let i = 1; i < ts.length - 1; i++) {
        const a = h[i - 1];
        const b = h[i];
        const c = h[i + 1];
        if (a == null || b == null || c == null) continue;
        const isHigh = b > a && b >= c;
        const isLow = b < a && b <= c;
        if (!isHigh && !isLow) continue;
        // parabola through (−1,a) (0,b) (1,c): vertex at x = (a − c) / (2(a − 2b + c))
        const den = a - 2 * b + c;
        let x = den !== 0 ? (a - c) / (2 * den) : 0;
        x = Math.max(-1, Math.min(1, x));
        const step = (ts[i + 1] - ts[i - 1]) / 2;
        const hv = b - ((a - c) * x) / 4;
        const turn: TideTurn = { kind: isHigh ? 'high' : 'low', t: Math.round(ts[i] + x * step), h: hv };
        // a flat top over two hours is one turn, not two
        const last = out[out.length - 1];
        if (last && last.kind === turn.kind && turn.t - last.t < 2.5 * 3600e3) {
            if ((turn.kind === 'high' && turn.h > last.h) || (turn.kind === 'low' && turn.h < last.h)) out[out.length - 1] = turn;
            continue;
        }
        out.push(turn);
    }
    return out;
}

/** Highest and lowest water in a time window, from the turns (falls back to the series ends) */
export function rangeIn(turns: TideTurn[], from: number, to: number): { high: TideTurn | null; low: TideTurn | null } {
    const inW = turns.filter(x => x.t >= from && x.t < to);
    const highs = inW.filter(x => x.kind === 'high');
    const lows = inW.filter(x => x.kind === 'low');
    return {
        high: highs.length ? highs.reduce((a, b) => (b.h > a.h ? b : a)) : null,
        low: lows.length ? lows.reduce((a, b) => (b.h < a.h ? b : a)) : null,
    };
}

/** Height at a time (straight line between hours) */
export function tideAt(ts: number[], h: (number | null)[], t: number): number | null {
    if (!ts.length || t < ts[0] || t > ts[ts.length - 1]) return null;
    const i = ts.findIndex(x => x >= t);
    if (i <= 0) return h[0];
    const a = h[i - 1];
    const b = h[i];
    if (a == null || b == null) return a ?? b ?? null;
    return a + ((b - a) * (t - ts[i - 1])) / (ts[i] - ts[i - 1]);
}

/** Rising or falling at a time, and the rate (m/h) */
export function tideTrend(ts: number[], h: (number | null)[], t: number): { rising: boolean; rate: number } | null {
    const a = tideAt(ts, h, t - 1800e3);
    const b = tideAt(ts, h, t + 1800e3);
    if (a == null || b == null) return null;
    return { rising: b > a, rate: b - a };
}
