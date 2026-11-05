// Route import/export as tables: CSV, plain text and (via xlsx.ts) Excel.
// Import finds the columns by their headings (lat, lon, name, leg, speed, ...).
// Without headings, each line is searched for a position.

import { findPosition, fmtLat, fmtLon, fmtTime, parseCoord } from '../format';
import { wrapLon, type LegType } from '../geo';
import { newRoute, newWaypoint, type PlanCalc, type Route } from '../model';

export type Rows = string[][];

/** Split CSV text into rows. Detects comma, semicolon or tab; handles quotes. */
export function parseCsv(text: string): Rows {
    const firstLine = text.split(/\r?\n/).find(l => l.trim()) ?? '';
    const counts = [',', ';', '\t'].map(d => [d, firstLine.split(d).length - 1] as const);
    const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ',';
    const rows: Rows = [];
    let row: string[] = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (c === '"') {
                q = false;
            } else {
                cell += c;
            }
        } else if (c === '"') {
            q = true;
        } else if (c === delim) {
            row.push(cell);
            cell = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') {
                i++;
            }
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += c;
        }
    }
    if (cell || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows.filter(r => r.some(c => c.trim() !== ''));
}

const legFrom = (v: string): LegType | null => {
    const s = v.trim().toUpperCase();
    if (/^(GC|G\.C\.|GREAT|ORTHO)/.test(s)) {
        return 'GC';
    }
    if (/^(RL|R\.L\.|RHUMB|LOXO|ML|MERC)/.test(s)) {
        return 'RL';
    }
    return null;
};

const numOrNull = (v: string | undefined): number | null => {
    if (v == null || v.trim() === '') {
        return null;
    }
    const n = Number(v.replace(',', '.'));
    return isFinite(n) ? n : null;
};

interface Columns {
    name?: number;
    lat?: number;
    lon?: number;
    latDeg?: number;
    latMin?: number;
    latHemi?: number;
    lonDeg?: number;
    lonMin?: number;
    lonHemi?: number;
    leg?: number;
    speed?: number;
    rpm?: number;
    radius?: number;
}

function findColumns(header: string[]): Columns | null {
    const cols: Columns = {};
    header.forEach((raw, i) => {
        const h = raw.trim().toLowerCase();
        const set = (k: keyof Columns) => {
            if (cols[k] === undefined) {
                cols[k] = i;
            }
        };
        if (/lat/.test(h)) {
            if (/deg/.test(h)) set('latDeg');
            else if (/min/.test(h)) set('latMin');
            else if (/n\/s|hemi|sign/.test(h)) set('latHemi');
            else set('lat');
        } else if (/lon|long/.test(h)) {
            if (/deg/.test(h)) set('lonDeg');
            else if (/min/.test(h)) set('lonMin');
            else if (/e\/w|hemi|sign/.test(h)) set('lonHemi');
            else set('lon');
        } else if (/^n\/s$/.test(h)) {
            set('latHemi');
        } else if (/^e\/w$/.test(h)) {
            set('lonHemi');
        } else if (/name|remark|description|comment/.test(h)) {
            set('name');
        } else if (/leg|sail|method|track type|^type$|gc\/rl|rl\/gc/.test(h)) {
            set('leg');
        } else if (/speed|sog|stw|knots|^kn$/.test(h)) {
            set('speed');
        } else if (/rpm|revs/.test(h)) {
            set('rpm');
        } else if (/radius|turn/.test(h)) {
            set('radius');
        }
    });
    const hasLat = cols.lat !== undefined || cols.latDeg !== undefined;
    const hasLon = cols.lon !== undefined || cols.lonDeg !== undefined;
    return hasLat && hasLon ? cols : null;
}

function coordFrom(row: string[], whole?: number, deg?: number, min?: number, hemi?: number, kind: 'lat' | 'lon' = 'lat'): number | null {
    if (whole !== undefined) {
        const extra = hemi !== undefined ? ' ' + (row[hemi] ?? '') : '';
        return parseCoord((row[whole] ?? '') + extra, kind);
    }
    if (deg !== undefined) {
        const s = `${row[deg] ?? ''} ${min !== undefined ? row[min] ?? '' : ''} ${hemi !== undefined ? row[hemi] ?? '' : ''}`;
        return parseCoord(s, kind);
    }
    return null;
}

/** Build a route from table rows. Throws a plain-language error if no positions are found. */
export function routeFromRows(rows: Rows, fileName: string, format: string): Route {
    const route = newRoute(fileName.replace(/\.[^.]+$/, ''));
    route.source = { format, fileName };
    let cols: Columns | null = null;
    let start = 0;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
        cols = findColumns(rows[i]);
        if (cols) {
            start = i + 1;
            break;
        }
    }
    const skipped: number[] = [];
    for (let i = start; i < rows.length; i++) {
        const row = rows[i];
        let lat: number | null;
        let lon: number | null;
        let name = '';
        if (cols) {
            lat = coordFrom(row, cols.lat, cols.latDeg, cols.latMin, cols.latHemi, 'lat');
            lon = coordFrom(row, cols.lon, cols.lonDeg, cols.lonMin, cols.lonHemi, 'lon');
            name = cols.name !== undefined ? (row[cols.name] ?? '').trim() : '';
        } else {
            const found = findPosition(row.join(' '));
            lat = found?.lat ?? null;
            lon = found?.lon ?? null;
            name = (found?.before ?? '').replace(/^\s*\d+\s*[.)]?\s*/, '').replace(/\s+/g, ' ').trim();
        }
        if (lat == null || lon == null) {
            skipped.push(i + 1);
            continue;
        }
        const wp = newWaypoint(lat, lon, route.defaultLegType, name);
        if (cols?.leg !== undefined) {
            wp.legType = legFrom(row[cols.leg] ?? '') ?? route.defaultLegType;
        }
        if (cols?.speed !== undefined) {
            wp.speed = numOrNull(row[cols.speed]);
        }
        if (cols?.rpm !== undefined) {
            wp.rpm = numOrNull(row[cols.rpm]);
        }
        if (cols?.radius !== undefined) {
            wp.turnRadius = numOrNull(row[cols.radius]) ?? undefined;
        }
        route.waypoints.push(wp);
    }
    if (route.waypoints.length === 0) {
        throw new Error(
            'No positions found. Use columns headed "Lat" and "Lon" (e.g. 16°13.842\'N, 061°32.553\'W), or one waypoint per line.',
        );
    }
    if (route.waypoints.length > 0 && route.waypoints[0].speed != null && route.waypoints.length > 1) {
        // A speed on the first row belongs to no leg; keep it as the route default.
        route.defaultSpeed = route.waypoints[0].speed;
    }
    (route.source as { skippedRows?: number[] }).skippedRows = skipped;
    return route;
}

export const HEADER = ['WP', 'Name', 'Lat', 'Lon', 'Lat (deg)', 'Lon (deg)', 'Leg', 'Course (°T)', 'Dist (nm)', 'Total (nm)', 'Speed (kn)', 'ETA (UTC)'];

/** Rows for export (header first). Numbers are kept as numbers for Excel. */
export function rowsForExport(route: Route, plan: PlanCalc): (string | number)[][] {
    const out: (string | number)[][] = [HEADER];
    route.waypoints.forEach((w, i) => {
        const leg = i > 0 ? plan.legs[i - 1] : undefined;
        out.push([
            i + 1,
            w.name,
            fmtLat(w.lat),
            fmtLon(w.lon),
            Number(w.lat.toFixed(6)),
            Number(wrapLon(w.lon).toFixed(6)),
            i > 0 ? w.legType : '',
            leg ? Number(leg.course.toFixed(1)) : '',
            leg ? Number(leg.distNm.toFixed(2)) : '',
            leg ? Number(leg.cumNm.toFixed(2)) : 0,
            leg ? Number(leg.sog.toFixed(2)) : '',
            i === 0 ? fmtTime(plan.etd) : fmtTime(leg?.arriveMs ?? null),
        ]);
    });
    return out;
}

export function writeCsv(rows: (string | number)[][]): string {
    const esc = (v: string | number) => {
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

/** Readable fixed-width text for Notepad. */
export function writeText(route: Route, plan: PlanCalc): string {
    const rows = rowsForExport(route, plan).map(r => [r[0], r[1], r[2], r[3], r[6], r[7], r[8], r[9], r[10], r[11]].map(String));
    const widths = rows[0].map((_, c) => Math.max(...rows.map(r => r[c].length)));
    const lines = rows.map(r => r.map((v, c) => v.padEnd(widths[c])).join('  ').trimEnd());
    return [
        `Route: ${route.name}`,
        `Total ${plan.totalNm.toFixed(1)} nm. Planning aid only, not for navigation; check on ECDIS.`,
        '',
        ...lines,
        '',
    ].join('\r\n');
}

export function parseText(text: string, fileName: string): Route {
    const rows = parseCsv(text);
    return routeFromRows(rows, fileName, 'Text');
}
