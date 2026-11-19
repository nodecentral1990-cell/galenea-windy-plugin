// A small PDF writer (owner, 2026-11-13: "should be able to export in pdf"). Writes PDF 1.4 with the standard
// Helvetica fonts (nothing embedded, no outside library): text, lines, rectangles, polylines, arrows, several
// pages. Coordinates in points from the TOP-LEFT of the page (converted to PDF's bottom-left). Text is WinAnsi:
// Latin letters, digits, ° and the usual punctuation; anything else is replaced by "?". Arrows and symbols are
// drawn as shapes.

import { HELV_B_W, HELV_W, WINANSI_EXTRA } from './pdfFontWidths';

export type RGB = [number, number, number];
export interface TextOpts {
    size?: number;
    bold?: boolean;
    color?: RGB;
    align?: 'left' | 'center' | 'right';
}

const A4 = { w: 595.28, h: 841.89 };

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const col = (c: RGB) => c.map(x => n(Math.max(0, Math.min(255, x)) / 255)).join(' ');

/** Bytes (WinAnsi) of a string */
function encode(s: string): number[] {
    const out: number[] = [];
    for (const ch of s) {
        const c = ch.codePointAt(0) as number;
        if (WINANSI_EXTRA[ch] != null) out.push(WINANSI_EXTRA[ch]);
        else if ((c >= 32 && c < 127) || (c >= 0xa0 && c <= 0xff)) out.push(c);
        else if (c === 9) out.push(32);
        else out.push(63); // ?
    }
    return out;
}

/** Width of a string in points */
export function textWidth(s: string, size: number, bold = false): number {
    const w = bold ? HELV_B_W : HELV_W;
    return (encode(s).reduce((a, c) => a + (w[c - 32] ?? 556), 0) * size) / 1000;
}

/** Cut a string to fit a width (adds "…") */
export function fitText(s: string, width: number, size: number, bold = false): string {
    if (textWidth(s, size, bold) <= width) return s;
    let t = s;
    while (t.length > 1 && textWidth(t + '…', size, bold) > width) t = t.slice(0, -1);
    return t + '…';
}

/** Split a string into lines that fit a width */
export function wrapText(s: string, width: number, size: number, bold = false): string[] {
    const lines: string[] = [];
    for (const para of s.split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/)) {
            if (!word) continue;
            const tryL = line ? `${line} ${word}` : word;
            if (textWidth(tryL, size, bold) <= width || !line) line = tryL;
            else {
                lines.push(line);
                line = word;
            }
        }
        lines.push(line);
    }
    return lines;
}

export class Pdf {
    readonly w: number;
    readonly h: number;
    private pages: string[][] = [];
    private cur: string[] = [];

    constructor(landscape = false) {
        this.w = landscape ? A4.h : A4.w;
        this.h = landscape ? A4.w : A4.h;
        this.addPage();
    }

    addPage(): void {
        this.cur = [];
        this.pages.push(this.cur);
    }

    get pageCount(): number {
        return this.pages.length;
    }

    /** Switch to page i (0-based), e.g. to write "page 2 of 3" at the end */
    setPage(i: number): void {
        this.cur = this.pages[i];
    }

    private y(v: number): number {
        return this.h - v;
    }

    /** Text with its baseline at y */
    text(x: number, y: number, s: string, o: TextOpts = {}): void {
        const size = o.size ?? 9;
        const bold = !!o.bold;
        const wid = textWidth(s, size, bold);
        const x0 = o.align === 'right' ? x - wid : o.align === 'center' ? x - wid / 2 : x;
        const bytes = encode(s);
        let lit = '';
        for (const b of bytes) {
            if (b === 40 || b === 41 || b === 92) lit += '\\' + String.fromCharCode(b);
            else if (b >= 32 && b < 127) lit += String.fromCharCode(b);
            else lit += '\\' + b.toString(8).padStart(3, '0');
        }
        this.cur.push(`BT ${col(o.color ?? [0, 0, 0])} rg /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(x0)} ${n(this.y(y))} Td (${lit}) Tj ET`);
    }

    line(x1: number, y1: number, x2: number, y2: number, width = 0.5, color: RGB = [0, 0, 0], dash?: number[]): void {
        this.cur.push(`q ${n(width)} w ${col(color)} RG ${dash ? `[${dash.map(n).join(' ')}] 0 d` : ''} ${n(x1)} ${n(this.y(y1))} m ${n(x2)} ${n(this.y(y2))} l S Q`);
    }

    rect(x: number, y: number, w: number, h: number, fill?: RGB, stroke?: RGB, width = 0.5): void {
        const op = fill && stroke ? 'B' : fill ? 'f' : 'S';
        this.cur.push(`q ${fill ? `${col(fill)} rg` : ''} ${stroke ? `${col(stroke)} RG ${n(width)} w` : ''} ${n(x)} ${n(this.y(y + h))} ${n(w)} ${n(h)} re ${op} Q`);
    }

    polyline(pts: [number, number][], width = 1, color: RGB = [0, 0, 0], close = false, fill?: RGB): void {
        if (pts.length < 2) return;
        const path = pts.map((p, i) => `${n(p[0])} ${n(this.y(p[1]))} ${i ? 'l' : 'm'}`).join(' ');
        const op = fill ? (close ? 'b' : 'f') : close ? 's' : 'S';
        this.cur.push(`q ${n(width)} w 1 j 1 J ${col(color)} RG ${fill ? `${col(fill)} rg` : ''} ${path} ${op} Q`);
    }

    /**
     * An arrow centred at (x, y), `len` long, pointing towards bearing `deg` (0 = up / north, clockwise),
     * as on a chart.
     */
    arrow(x: number, y: number, deg: number, len = 9, color: RGB = [0, 0, 0], width = 1): void {
        const r = (deg * Math.PI) / 180;
        const dx = Math.sin(r);
        const dy = -Math.cos(r);
        const hx = x + (dx * len) / 2;
        const hy = y + (dy * len) / 2;
        const tx = x - (dx * len) / 2;
        const ty = y - (dy * len) / 2;
        this.line(tx, ty, hx, hy, width, color);
        const head = len * 0.38;
        const a1 = r + Math.PI * 0.82;
        const a2 = r - Math.PI * 0.82;
        this.polyline(
            [
                [hx + Math.sin(a1) * head, hy - Math.cos(a1) * head],
                [hx, hy],
                [hx + Math.sin(a2) * head, hy - Math.cos(a2) * head],
            ],
            width,
            color,
            true,
            color,
        );
    }

    /** The finished file */
    output(): Uint8Array {
        const objs: string[] = [];
        const add = (s: string) => {
            objs.push(s);
            return objs.length;
        };
        const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
        const pagesId = objs.length + 1 + this.pages.length * 2;
        const kids: number[] = [];
        for (const p of this.pages) {
            const stream = p.join('\n');
            const c = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
            kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(this.w)} ${n(this.h)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
        }
        add(`<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
        const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
        const info = add(`<< /Producer (Galenea Windy plugin) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z) >>`);
        let out = '%PDF-1.4\n%âãÏÓ\n';
        const offs: number[] = [];
        objs.forEach((o, i) => {
            offs.push(out.length);
            out += `${i + 1} 0 obj\n${o}\nendobj\n`;
        });
        const xref = out.length;
        out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
        out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        // every character is one byte (text was escaped to octal above)
        const bytes = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
        return bytes;
    }
}
