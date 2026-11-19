// The voyage strip under the header (UI reimagine, owner 2026-11-13; windy/notes/ui-reimagine-2026-11.md §2.2):
// the worst weather ahead in the forecast already fetched, and how old that forecast is. No new calculation:
// it only reads the weather-table rows. Plain functions (unit-tested).

interface RowLike {
    time: number;
    wx: { hs?: number | null } | null;
    limits: { level: number }[];
    resonance: unknown[];
}

export interface WorstAhead {
    /** Largest significant wave height (SWH) in the rows from now on, m */
    hs: number;
    /** Time of that row (UTC ms) */
    time: number;
    /** Rows ahead with an IMO MSC.1/Circ.1228 warning */
    imoRows: number;
    /** Rows ahead with one of the user's red limits broken */
    limitRows: number;
    /** Rows ahead with an amber alert only */
    alertRows: number;
    /** 2 = a red limit ahead, 1 = an amber alert ahead, 0 = none */
    level: 0 | 1 | 2;
}

/** The worst of the weather-table rows at or after `fromMs` (null when no row ahead has wave data) */
export function worstAhead(rows: RowLike[], fromMs: number): WorstAhead | null {
    let best: WorstAhead | null = null;
    let imoRows = 0;
    let limitRows = 0;
    let alertRows = 0;
    for (const r of rows) {
        if (r.time < fromMs) continue;
        const top = r.limits.reduce((m, l) => Math.max(m, l.level), 0);
        if (r.resonance.length) imoRows++;
        if (top >= 2) limitRows++;
        else if (top === 1) alertRows++;
        const hs = r.wx?.hs;
        if (hs != null && isFinite(hs) && (!best || hs > best.hs)) best = { hs, time: r.time, imoRows: 0, limitRows: 0, alertRows: 0, level: 0 };
    }
    if (!best) return null;
    return { ...best, imoRows, limitRows, alertRows, level: limitRows ? 2 : alertRows ? 1 : 0 };
}

/** Hours after fetching at which the forecast is called "getting old" (owner's decision, 2026-11-13) */
export const FORECAST_OLD_H = 12;

/** How long ago the forecast was fetched, in words, and whether it is getting old */
export function forecastAge(fetchedAt: number | null | undefined, nowMs: number): { text: string; old: boolean; hours: number } {
    if (fetchedAt == null || !isFinite(fetchedAt)) return { text: '', old: false, hours: 0 };
    const h = Math.max(0, (nowMs - fetchedAt) / 3600e3);
    const text = h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.floor(h)} h ago` : `${Math.floor(h / 24)} days ago`;
    return { text, old: h >= FORECAST_OLD_H, hours: h };
}
