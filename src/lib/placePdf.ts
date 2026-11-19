// PDF exports (owner, 2026-11-13): "Port weather" and "Tides" for a place, A4 landscape, all times UTC, with
// where the data come from, when they were fetched, and the planning-aid / tide-datum warnings on every page.

import { fmtLat, fmtLon } from './format';
import { Pdf, fitText, wrapText, type RGB } from './pdf';
import { placeWaves, type PlaceDay, type PlaceHour } from './placeWx';
import type { TideTurn } from './tides';

export interface PlacePdfData {
    point: { lat: number; lon: number; name: string; nearest: { name: string; nm: number } | null };
    startDay: number;
    hours: PlaceHour[];
    days: PlaceDay[];
    turns: TideTurn[];
    tide: { ts: number[]; h: (number | null)[] } | null;
    /** Lines saying where the data come from and when they were fetched */
    sources: string[];
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');
const hm = (t: number | null) => (t == null ? '—' : `${p2(new Date(t).getUTCHours())}:${p2(new Date(t).getUTCMinutes())}`);
const dayTxt = (t: number) => `${DOW[new Date(t).getUTCDay()]} ${p2(new Date(t).getUTCDate())} ${MON[new Date(t).getUTCMonth()]} ${new Date(t).getUTCFullYear()}`;
const f0 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v.toFixed(0));
const f1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v.toFixed(1));
const d3 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '' : `${p2(Math.round(v) % 360).padStart(3, '0')}°`);

const GREY: RGB = [110, 110, 110];
const LINE: RGB = [190, 196, 204];
const HEAD: RGB = [232, 238, 246];
const BLUE: RGB = [30, 110, 200];
const WARN: RGB = [170, 70, 0];

const WARNING = 'Planning aid only: does not replace ECDIS, official charts, official tide tables or official weather routing. Forecasts are less certain further ahead.';
const TIDE_NOTE = "Tide: Open-Meteo marine model sea level (Météo-France, about 8 km grid), relative to MEAN SEA LEVEL, not chart datum. Open-Meteo: \"not suitable for coastal navigation and does not replace your nautical almanac\". Use official tide tables.";

function placeTitle(d: PlacePdfData): string {
    return d.point.name || (d.point.nearest ? `Position near ${d.point.nearest.name}` : 'Position');
}

/** Title block; returns the y below it */
function header(pdf: Pdf, d: PlacePdfData, what: string): number {
    const M = 32;
    pdf.text(M, 38, `${what}: ${placeTitle(d)}`, { size: 16, bold: true });
    const pos = `${fmtLat(d.point.lat, 1)}  ${fmtLon(d.point.lon, 1)}`;
    const near = d.point.nearest ? `  ·  ${d.point.nearest.nm.toFixed(0)} nm from ${d.point.nearest.name}` : '';
    pdf.text(M, 54, `${pos}${near}  ·  all times UTC  ·  made ${dayTxt(Date.now())} ${hm(Date.now())} UTC`, { size: 9, color: GREY });
    let y = 68;
    for (const s of d.sources) {
        for (const l of wrapText(s, pdf.w - 2 * M, 8)) {
            pdf.text(M, y, l, { size: 8, color: GREY });
            y += 10;
        }
    }
    for (const l of wrapText(WARNING, pdf.w - 2 * M, 8)) {
        pdf.text(M, y, l, { size: 8, color: WARN, bold: true });
        y += 10;
    }
    return y + 4;
}

function footer(pdf: Pdf, title: string): void {
    const n = pdf.pageCount;
    for (let i = 0; i < n; i++) {
        pdf.setPage(i);
        pdf.line(32, pdf.h - 26, pdf.w - 32, pdf.h - 26, 0.4, LINE);
        pdf.text(32, pdf.h - 15, `${title} · Galenea Windy plugin · planning aid only`, { size: 7.5, color: GREY });
        pdf.text(pdf.w - 32, pdf.h - 15, `page ${i + 1} of ${n}`, { size: 7.5, color: GREY, align: 'right' });
    }
}

/** A tide graph drawn with lines (vector) */
function tideGraph(pdf: Pdf, d: PlacePdfData, x: number, y: number, w: number, h: number, from: number, to: number): void {
    const pts = (d.tide?.ts ?? []).map((t, i) => [t, d.tide!.h[i]] as [number, number | null]).filter((p): p is [number, number] => p[1] != null && p[0] >= from && p[0] <= to);
    pdf.rect(x, y, w, h, [244, 248, 253], LINE);
    if (pts.length < 2) {
        pdf.text(x + 8, y + h / 2, 'No tide data for this place.', { size: 9, color: GREY });
        return;
    }
    const lo = Math.min(...pts.map(p => p[1]));
    const hi = Math.max(...pts.map(p => p[1]));
    const pad = Math.max(0.15, (hi - lo) * 0.2);
    const X = (t: number) => x + ((t - from) / (to - from)) * w;
    const Y = (v: number) => y + h - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * h;
    // height lines every 0.5 / 1 m
    const step = hi - lo > 4 ? 1 : 0.5;
    for (let v = Math.ceil((lo - pad) / step) * step; v <= hi + pad; v += step) {
        pdf.line(x, Y(v), x + w, Y(v), 0.3, [215, 222, 230]);
        pdf.text(x - 3, Y(v) + 2.5, v.toFixed(1), { size: 6.5, color: GREY, align: 'right' });
    }
    for (let t = Math.ceil(from / 86400e3) * 86400e3; t < to; t += 86400e3) {
        pdf.line(X(t), y, X(t), y + h, 0.4, LINE);
        pdf.text(X(t) + 2, y + h + 9, `${DOW[new Date(t).getUTCDay()]} ${new Date(t).getUTCDate()}`, { size: 7, color: GREY });
    }
    pdf.polyline(pts.map(p => [X(p[0]), Y(p[1])] as [number, number]), 1.2, BLUE);
    for (const tt of d.turns.filter(z => z.t >= from && z.t <= to)) {
        const cx = X(tt.t);
        const cy = Y(tt.h);
        pdf.rect(cx - 1.5, cy - 1.5, 3, 3, tt.kind === 'high' ? [0, 130, 190] : [200, 120, 0]);
        pdf.text(cx, tt.kind === 'high' ? cy - 4 : cy + 9, `${hm(tt.t).replace(':', '')} ${tt.h.toFixed(1)}`, { size: 6, align: 'center' });
    }
    pdf.text(x, y - 3, 'Tide, m above mean sea level (model)', { size: 7, color: GREY });
}

interface Col {
    title: string;
    w: number;
    get: (h: PlaceHour) => string;
    /** draw an arrow (bearing it points to) after the text */
    arrow?: (h: PlaceHour) => number | null;
    group?: boolean;
}

/** Port weather: day summaries + tide graph, then the hour-by-hour table */
export function portWeatherPdf(d: PlacePdfData): Uint8Array {
    const pdf = new Pdf(true);
    const M = 32;
    let y = header(pdf, d, 'Port weather');
    // day summaries
    const dc: { t: string; w: number; v: (x: PlaceDay) => string }[] = [
        { t: 'Day', w: 74, v: x => dayTxt(x.day).slice(0, 10) },
        { t: 'Weather', w: 92, v: x => x.words },
        { t: 'Wind max / gust kn', w: 76, v: x => `${f0(x.windMax)} / ${f0(x.gustMax)}` },
        { t: 'SWH max m', w: 46, v: x => f1(x.swhMax) },
        { t: 'Rain mm', w: 40, v: x => f1(x.rainMm) },
        { t: 'Air °C', w: 46, v: x => `${f0(x.tMin)} – ${f0(x.tMax)}` },
        { t: 'Sunrise', w: 38, v: x => (x.sun.alwaysUp ? 'up all day' : x.sun.alwaysDown ? 'no sunrise' : hm(x.sun.rise)) },
        { t: 'Sunset', w: 38, v: x => (x.sun.alwaysUp || x.sun.alwaysDown ? '' : hm(x.sun.set)) },
        { t: 'Moonrise', w: 42, v: x => hm(x.moon.rise) },
        { t: 'Moonset', w: 40, v: x => hm(x.moon.set) },
        { t: 'Moon', w: 84, v: x => `${x.moonName} ${x.moonPct}%` },
        { t: 'High water', w: 80, v: x => x.turns.filter(t => t.kind === 'high').map(t => `${hm(t.t)} ${t.h.toFixed(1)}`).join('  ') || '—' },
        { t: 'Low water', w: 80, v: x => x.turns.filter(t => t.kind === 'low').map(t => `${hm(t.t)} ${t.h.toFixed(1)}`).join('  ') || '—' },
    ];
    let x = M;
    pdf.rect(M, y, pdf.w - 2 * M, 14, HEAD);
    for (const c of dc) {
        pdf.text(x + 2, y + 10, c.t, { size: 7, bold: true });
        x += c.w;
    }
    y += 14;
    for (const day of d.days) {
        x = M;
        for (const c of dc) {
            pdf.text(x + 2, y + 10, fitText(c.v(day), c.w - 4, 7.5), { size: 7.5 });
            x += c.w;
        }
        pdf.line(M, y + 14, pdf.w - M, y + 14, 0.3, LINE);
        y += 14;
    }
    y += 22;
    tideGraph(pdf, d, M + 18, y, pdf.w - 2 * M - 18, Math.min(170, pdf.h - y - 60), d.startDay, d.startDay + d.days.length * 86400e3);
    let ty = Math.min(170, pdf.h - y - 60) + y + 20;
    for (const l of wrapText(TIDE_NOTE, pdf.w - 2 * M, 7.5)) {
        pdf.text(M, ty, l, { size: 7.5, color: WARN });
        ty += 9.5;
    }

    // hour by hour
    const wv = (h: PlaceHour, id: string) => placeWaves(h).find(w => w.id === id);
    const wave = (id: string): Col => ({
        title: id === 'swh' ? 'SWH m/s' : id === 'sea' ? 'Sea m/s' : id === 'sw1' ? 'Swell 1 m/s' : 'Swell 2 m/s',
        w: 56,
        get: h => {
            const w = wv(h, id);
            return w?.h != null ? `${w.h.toFixed(1)}${w.estimated ? '*' : ''} / ${w.period != null ? w.period.toFixed(0) : '—'}` : '—';
        },
        arrow: h => {
            const w = wv(h, id);
            return w?.h != null && w.dir != null ? (w.dir + 180) % 360 : null;
        },
        group: id === 'swh',
    });
    const cols: Col[] = [
        { title: 'UTC', w: 30, get: h => hm(h.t) },
        { title: 'Weather', w: 98, get: h => h.words, group: true },
        { title: 'Wind kn', w: 50, get: h => `${f0(h.wx?.windKn)} ${d3(h.wx?.windDir)}`, arrow: h => (h.wx?.windDir != null ? (h.wx.windDir + 180) % 360 : null), group: true },
        { title: 'Gust', w: 26, get: h => f0(h.wx?.gustKn) },
        wave('swh'),
        wave('sea'),
        wave('sw1'),
        wave('sw2'),
        { title: 'kW/m', w: 30, get: h => f0(h.wx?.powerKw), group: true },
        { title: 'Air °C', w: 32, get: h => f0(h.wx?.airTempC), group: true },
        { title: 'Feels', w: 30, get: h => f0(h.feelsC) },
        { title: 'Sea °C', w: 32, get: h => f1(h.sstC) },
        { title: 'Current kn', w: 54, get: h => (h.curKn != null ? `${h.curKn.toFixed(1)} ${d3(h.curSet)}` : '—'), arrow: h => (h.curKn != null && h.curKn >= 0.05 ? h.curSet : null), group: true },
        { title: 'Rain mm', w: 34, get: h => (h.rainMm != null ? (h.rainMm < 0.05 ? '0' : h.rainMm.toFixed(1)) : '—'), group: true },
        { title: 'Tide m', w: 52, get: h => (h.tideM != null ? `${h.tideM.toFixed(2)}${h.turn ? (h.turn.kind === 'high' ? '  HW' : '  LW') : ''}` : '—'), group: true },
    ];
    const tableW = cols.reduce((a, c) => a + c.w, 0);
    const RH = 10.4;
    const head = (yy: number) => {
        pdf.rect(M, yy, tableW, 13, HEAD);
        let xx = M;
        for (const c of cols) {
            pdf.text(xx + 2, yy + 9.5, c.title, { size: 6.8, bold: true });
            xx += c.w;
        }
        return yy + 13;
    };
    pdf.addPage();
    y = head(36);
    let lastDay = -1;
    for (const h of d.hours) {
        const day = Math.floor(h.t / 86400e3);
        if (y > pdf.h - 44 || (day !== lastDay && y > pdf.h - 60)) {
            pdf.addPage();
            y = head(36);
            lastDay = -1;
        }
        if (day !== lastDay) {
            pdf.rect(M, y, tableW, 11, [210, 222, 238]);
            const pd = d.days.find(z => Math.floor(z.day / 86400e3) === day);
            const extra = pd ? `   sunrise ${hm(pd.sun.rise)}  sunset ${hm(pd.sun.set)}  ·  moonrise ${hm(pd.moon.rise)}  moonset ${hm(pd.moon.set)}  ·  ${pd.moonName}` : '';
            pdf.text(M + 3, y + 8.2, `${dayTxt(h.t)}${extra}`, { size: 7, bold: true });
            y += 11;
            lastDay = day;
        }
        if (h.turn) pdf.rect(M, y, tableW, RH, h.turn.kind === 'high' ? [228, 244, 252] : [253, 243, 226]);
        let xx = M;
        for (const c of cols) {
            if (c.group) pdf.line(xx, y, xx, y + RH, 0.3, LINE);
            // arrow first, then the figures (so it is clear which column it belongs to)
            const a = c.arrow?.(h);
            if (a != null) pdf.arrow(xx + 6, y + RH / 2, a, 7, [40, 40, 40], 0.7);
            const txt = fitText(c.get(h), c.w - (c.arrow ? 14 : 4), 6.8);
            pdf.text(xx + (c.arrow ? 12 : 2), y + 7.6, txt, { size: 6.8 });
            xx += c.w;
        }
        pdf.line(M, y + RH, M + tableW, y + RH, 0.2, [225, 228, 232]);
        y += RH;
    }
    pdf.text(M, Math.min(pdf.h - 32, y + 12), 'Arrows: wind and waves point the way they go (directions in figures: where they come FROM); current: where it sets. * = sea worked out from SWH and the swells. HW / LW = high / low water in that hour.', { size: 6.8, color: GREY });
    footer(pdf, `Port weather ${placeTitle(d)}`);
    return pdf.output();
}

/** Tides: graph, high and low waters per day, hourly heights (hours down, days across) */
export function tidePdf(d: PlacePdfData): Uint8Array {
    const pdf = new Pdf(true);
    const M = 32;
    let y = header(pdf, d, 'Tides');
    for (const l of wrapText(TIDE_NOTE, pdf.w - 2 * M, 8)) {
        pdf.text(M, y, l, { size: 8, color: WARN });
        y += 10;
    }
    y += 14;
    const days = d.days.length || 7;
    tideGraph(pdf, d, M + 18, y, pdf.w - 2 * M - 18, 200, d.startDay, d.startDay + days * 86400e3);
    y += 226;
    // high and low waters
    pdf.text(M, y, 'High and low waters (UTC, m above mean sea level)', { size: 10, bold: true });
    y += 8;
    const colW = (pdf.w - 2 * M) / days;
    for (let i = 0; i < days; i++) {
        const day = d.startDay + i * 86400e3;
        const xx = M + i * colW;
        pdf.rect(xx, y, colW - 4, 13, HEAD);
        pdf.text(xx + 3, y + 9.5, dayTxt(day).slice(0, 10), { size: 7.5, bold: true });
        let yy = y + 24;
        for (const t of d.turns.filter(z => z.t >= day && z.t < day + 86400e3)) {
            pdf.text(xx + 3, yy, `${t.kind === 'high' ? 'HW' : 'LW'}  ${hm(t.t)}  ${t.h.toFixed(2)} m`, { size: 8, bold: t.kind === 'high', color: t.kind === 'high' ? [0, 90, 150] : [150, 80, 0] });
            yy += 11;
        }
    }
    // hourly heights: a grid of 24 hours × days
    pdf.addPage();
    y = 40;
    pdf.text(M, y, `Hourly tide heights, m above mean sea level (model) · ${placeTitle(d)} ${fmtLat(d.point.lat, 1)} ${fmtLon(d.point.lon, 1)}`, { size: 10, bold: true });
    y += 10;
    const cw = Math.min(90, (pdf.w - 2 * M - 40) / days);
    pdf.rect(M, y, 40 + cw * days, 13, HEAD);
    pdf.text(M + 3, y + 9.5, 'UTC', { size: 7.5, bold: true });
    for (let i = 0; i < days; i++) pdf.text(M + 40 + i * cw + 3, y + 9.5, dayTxt(d.startDay + i * 86400e3).slice(0, 10), { size: 7.5, bold: true });
    y += 13;
    for (let hr = 0; hr < 24; hr++) {
        pdf.text(M + 3, y + 8.5, `${p2(hr)}:00`, { size: 7.5 });
        for (let i = 0; i < days; i++) {
            const t = d.startDay + i * 86400e3 + hr * 3600e3;
            const row = d.hours.find(z => z.t === t);
            const v = row?.tideM;
            if (row?.turn) pdf.rect(M + 40 + i * cw, y, cw, 12, row.turn.kind === 'high' ? [228, 244, 252] : [253, 243, 226]);
            pdf.text(M + 40 + i * cw + 3, y + 8.5, v != null ? `${v.toFixed(2)}${row?.turn ? (row.turn.kind === 'high' ? '  HW' : '  LW') : ''}` : '—', { size: 7.5 });
        }
        pdf.line(M, y + 12, M + 40 + cw * days, y + 12, 0.2, LINE);
        y += 12;
    }
    footer(pdf, `Tides ${placeTitle(d)}`);
    return pdf.output();
}
