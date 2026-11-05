// Minimal Excel (.xlsx) reader and writer: first worksheet only, values only.
// An .xlsx file is a ZIP of XML files; fflate (MIT) handles the ZIP part.

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

import type { Rows } from './table';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: name => ['row', 'c', 'si', 'r', 'sheet', 'Relationship'].includes(name),
});

type X = Record<string, unknown>;

const colIndex = (ref: string): number => {
    const letters = ref.replace(/[0-9]/g, '');
    let n = 0;
    for (const ch of letters) {
        n = n * 26 + (ch.charCodeAt(0) - 64);
    }
    return n - 1;
};

const text = (node: unknown): string => {
    if (node == null) {
        return '';
    }
    if (typeof node === 'string' || typeof node === 'number') {
        return String(node);
    }
    const o = node as X;
    if ('#text' in o) {
        return String(o['#text']);
    }
    if (o.t != null) {
        return text(o.t);
    }
    if (Array.isArray(o.r)) {
        return (o.r as X[]).map(r => text(r.t)).join('');
    }
    return '';
};

export function readXlsx(data: Uint8Array): Rows {
    const files = unzipSync(data);
    const get = (path: string): X | null => (files[path] ? (parser.parse(strFromU8(files[path])) as X) : null);

    // Find the first sheet's file through the workbook relationships.
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = get('xl/workbook.xml');
    const rels = get('xl/_rels/workbook.xml.rels');
    const firstSheet = ((wb?.workbook as X)?.sheets as X)?.sheet as X[] | undefined;
    const rid = firstSheet?.[0]?.['@_id'];
    const relList = ((rels?.Relationships as X)?.Relationship ?? []) as X[];
    const rel = relList.find(r => r['@_Id'] === rid);
    if (rel && typeof rel['@_Target'] === 'string') {
        const t = rel['@_Target'] as string;
        sheetPath = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    }

    const sst = get('xl/sharedStrings.xml');
    const shared = (((sst?.sst as X)?.si ?? []) as X[]).map(si => text(si));

    const sheet = get(sheetPath);
    if (!sheet) {
        throw new Error('Could not find the first worksheet in this Excel file.');
    }
    const rowsNode = (((sheet.worksheet as X)?.sheetData as X)?.row ?? []) as X[];
    const rows: Rows = [];
    for (const r of rowsNode) {
        const row: string[] = [];
        for (const c of (r.c ?? []) as X[]) {
            const idx = colIndex(String(c['@_r'] ?? ''));
            const t = c['@_t'];
            let v: string;
            if (t === 's') {
                v = shared[Number(text(c.v))] ?? '';
            } else if (t === 'inlineStr') {
                v = text(c.is);
            } else {
                v = text(c.v);
            }
            row[idx >= 0 ? idx : row.length] = v;
        }
        rows.push(Array.from(row, x => x ?? ''));
    }
    return rows.filter(r => r.some(c => c.trim() !== ''));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const colName = (i: number): string => {
    let s = '';
    let n = i + 1;
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
};

export function writeXlsx(rows: (string | number)[][], sheetName = 'Route'): Uint8Array {
    const sheetRows = rows
        .map((r, ri) => {
            const cells = r
                .map((v, ci) => {
                    const ref = `${colName(ci)}${ri + 1}`;
                    if (typeof v === 'number' && isFinite(v)) {
                        return `<c r="${ref}"><v>${v}</v></c>`;
                    }
                    return `<c r="${ref}" t="inlineStr"><is><t>${esc(String(v))}</t></is></c>`;
                })
                .join('');
            return `<row r="${ri + 1}">${cells}</row>`;
        })
        .join('');
    const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8(
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        ),
        '_rels/.rels': strToU8(
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        ),
        'xl/workbook.xml': strToU8(
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        ),
        'xl/_rels/workbook.xml.rels': strToU8(
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        ),
        'xl/worksheets/sheet1.xml': strToU8(
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
        ),
    };
    return zipSync(files);
}
