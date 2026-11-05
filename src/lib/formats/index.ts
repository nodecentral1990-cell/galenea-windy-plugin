// One entry point for opening and saving route files.

import type { PlanCalc, Route } from '../model';

import { isBvs, parseBvs, writeBvs, type BvsWriteContext } from './bvs';

import { parseGpx, writeGpx } from './gpx';
import { parseRt3, writeRt3 } from './rt3';
import { parseRtz, writeRtz } from './rtz';
import { parseCsv, parseText, routeFromRows, rowsForExport, writeCsv, writeText } from './table';
import { readXlsx, writeXlsx } from './xlsx';

export type ExportFormat = 'rtz' | 'rt3' | 'bvs' | 'gpx' | 'csv' | 'xlsx' | 'txt';

export const EXPORT_FORMATS: { id: ExportFormat; label: string; note?: string }[] = [
    { id: 'rtz', label: 'RTZ (ECDIS)' },
    { id: 'rt3', label: 'RT3 (Transas, beta)', note: 'Not yet tested on Navi-Sailor' },
    { id: 'bvs', label: 'BVS (weather routing, beta)', note: 'Layout copied from your BVS files; not yet tested in BVS itself' },
    { id: 'gpx', label: 'GPX' },
    { id: 'xlsx', label: 'Excel' },
    { id: 'csv', label: 'CSV' },
    { id: 'txt', label: 'Text (Notepad)' },
];

export const IMPORT_ACCEPT = '.rtz,.rt3,.bvs,.gpx,.csv,.txt,.xlsx,.xml';

const decode = (data: Uint8Array): string => {
    // UTF-8, falling back to Windows-1252 if the text is not valid UTF-8.
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(data).replace(/^﻿/, '');
    } catch {
        return new TextDecoder('windows-1252').decode(data);
    }
};

/** Open a route file. Throws an Error with a plain-language message if it cannot be read. */
export function importRoute(fileName: string, data: Uint8Array): Route {
    const ext = (fileName.split('.').pop() ?? '').toLowerCase();
    if (ext === 'xlsx') {
        return routeFromRows(readXlsx(data), fileName, 'Excel');
    }
    const text = decode(data);
    if (ext === 'bvs' || isBvs(text.slice(0, 4000))) {
        return parseBvs(text, fileName);
    }
    if (ext === 'rtz' || /<route[\s>]/.test(text.slice(0, 2000))) {
        return parseRtz(text, fileName);
    }
    if (ext === 'rt3' || /<TSH_Route/i.test(text.slice(0, 2000))) {
        return parseRt3(text, fileName);
    }
    if (ext === 'gpx' || /<gpx[\s>]/.test(text.slice(0, 2000))) {
        return parseGpx(text, fileName);
    }
    if (ext === 'csv') {
        return routeFromRows(parseCsv(text), fileName, 'CSV');
    }
    if (ext === 'xls') {
        throw new Error('Old .xls files are not supported. Save it as .xlsx or CSV in Excel first.');
    }
    return parseText(text, fileName);
}

export interface ExportedFile {
    name: string;
    mime: string;
    data: string | Uint8Array;
}

const safeName = (s: string) => s.replace(/[^\w\- .]+/g, '_').trim() || 'route';

export function exportRoute(format: ExportFormat, route: Route, plan: PlanCalc, ctx: BvsWriteContext = {}): ExportedFile {
    const base = safeName(route.name);
    switch (format) {
        case 'rtz':
            return {
                name: `${base}.rtz`,
                mime: 'application/xml',
                data: writeRtz(route, { sog: [null, ...plan.legs.map(l => l.sog)], etd: plan.etd, eta: plan.eta }),
            };
        case 'rt3':
            return { name: `${base}.rt3`, mime: 'application/xml', data: writeRt3(route) };
        case 'bvs':
            return { name: `${base}.bvs`, mime: 'application/xml', data: writeBvs(route, plan, ctx) };
        case 'gpx':
            return { name: `${base}.gpx`, mime: 'application/gpx+xml', data: writeGpx(route) };
        case 'csv':
            return { name: `${base}.csv`, mime: 'text/csv', data: writeCsv(rowsForExport(route, plan)) };
        case 'xlsx':
            return {
                name: `${base}.xlsx`,
                mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                data: writeXlsx(rowsForExport(route, plan)),
            };
        case 'txt':
            return { name: `${base}.txt`, mime: 'text/plain', data: writeText(route, plan) };
    }
}
