// One entry point for opening and saving route files.

import { IS_APP } from '../appMode';
import type { PlanCalc, Route } from '../model';

import { isBvs, parseBvs, writeBvs, type BvsWriteContext } from './bvs';

import { parseGpx, writeGpx } from './gpx';
import { parseRt3, writeRt3 } from './rt3';
import { parseRtz, writeRtz } from './rtz';
import { parseCsv, parseText, routeFromRows, rowsForExport, writeCsv, writeText } from './table';
import { readXlsx, writeXlsx } from './xlsx';
import { isJrc, isNmea, isZip, parseJrc, parseKml, parseNmea, parseRtzp, writeFurunoRtz, writeJrc, writeKml, writeNmea, writeRtz11, writeRtzp } from './more';

export type ExportFormat = 'rtz' | 'rtz11' | 'rtzp' | 'furuno' | 'jrc' | 'rt3' | 'bvs' | 'gpx' | 'kml' | 'nmea' | 'csv' | 'xlsx' | 'txt';

export const EXPORT_FORMATS: { id: ExportFormat; label: string; note?: string }[] = [
    { id: 'rtz', label: 'RTZ (ECDIS)' },
    { id: 'rtz11', label: 'RTZ 1.1 (ECDIS)' },
    { id: 'rtzp', label: 'RTZ container .rtzp (ECDIS)' },
    { id: 'furuno', label: 'Furuno RTZ 1.0 (FMD, beta)', note: 'Not yet tested on a Furuno ECDIS' },
    { id: 'jrc', label: 'JRC route sheet (beta)', note: 'Not yet tested on a JRC ECDIS' },
    { id: 'rt3', label: 'RT3 (Transas, beta)', note: 'Not yet tested on Navi-Sailor' },
    { id: 'bvs', label: 'BVS (weather routing, beta)', note: 'Layout copied from your BVS files; not yet tested in BVS itself' },
    { id: 'gpx', label: 'GPX' },
    { id: 'kml', label: 'KML (Google Earth)' },
    { id: 'nmea', label: 'NMEA 0183 (WPL + RTE)' },
    { id: 'xlsx', label: 'Excel' },
    { id: 'csv', label: 'CSV' },
    { id: 'txt', label: 'Text (Notepad)' },
];

// In the Galenea app no filter: Android's file picker knows no file type for .rtz / .rt3 / .bvs and would grey them out
// (importRoute below recognises the file by its name and contents).
export const IMPORT_ACCEPT = IS_APP ? '' : '.rtz,.rtzp,.rt3,.bvs,.gpx,.kml,.csv,.txt,.nmea,.xlsx,.xml';

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
    if (ext === 'rtzp' || (ext !== 'xlsx' && isZip(data))) {
        return parseRtzp(data, fileName);
    }
    if (ext === 'xlsx') {
        return routeFromRows(readXlsx(data), fileName, 'Excel');
    }
    if (ext === 'kmz') {
        throw new Error('KMZ (zipped KML) is not read yet: in Google Earth save the route as .kml.');
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
    if (ext === 'kml' || /<kml[\s>]/.test(text.slice(0, 2000))) {
        return parseKml(text, fileName);
    }
    if (isJrc(text)) {
        return parseJrc(text, fileName);
    }
    if (ext === 'nmea' || isNmea(text)) {
        return parseNmea(text, fileName);
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
        case 'rtz11':
            return { name: `${base}.rtz`, mime: 'application/xml', data: writeRtz11(route, plan) };
        case 'rtzp':
            return { name: `${base}.rtzp`, mime: 'application/zip', data: writeRtzp(`${base}.rtz`, writeRtz(route, { sog: [null, ...plan.legs.map(l => l.sog)], etd: plan.etd, eta: plan.eta })) };
        case 'furuno':
            return { name: `${base}_furuno.rtz`, mime: 'application/xml', data: writeFurunoRtz(route) };
        case 'jrc':
            return { name: `${base}_jrc.csv`, mime: 'text/csv', data: writeJrc(route) };
        case 'kml':
            return { name: `${base}.kml`, mime: 'application/vnd.google-earth.kml+xml', data: writeKml(route) };
        case 'nmea':
            return { name: `${base}.nmea`, mime: 'text/plain', data: writeNmea(route) };
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
