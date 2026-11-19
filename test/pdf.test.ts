import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Pdf, textWidth, wrapText } from '../src/lib/pdf';

test('pdf: a valid file with two pages, text with ° and brackets, lines, rectangles, arrows', () => {
    const p = new Pdf(true);
    p.text(40, 50, 'Port weather (Le Havre) 49°29.0\'N 000°06.0\'E – wind 270° 25 kn', { size: 14, bold: true });
    p.rect(40, 60, 200, 20, [230, 240, 250], [0, 0, 0]);
    p.line(40, 90, 300, 90, 1, [200, 0, 0], [2, 2]);
    p.polyline([[40, 120], [80, 100], [120, 130]], 1.5, [0, 90, 200]);
    p.arrow(200, 120, 45, 12);
    p.addPage();
    p.text(40, 50, 'Page 2 \\ back-slash', { align: 'left' });
    const bytes = p.output();
    const s = Buffer.from(bytes).toString('latin1');
    assert.ok(s.startsWith('%PDF-1.4'));
    assert.ok(s.trimEnd().endsWith('%%EOF'));
    assert.match(s, /\/Count 2/);
    // xref offsets point at the objects
    const xref = Number(s.match(/startxref\n(\d+)/)![1]);
    assert.ok(s.slice(xref).startsWith('xref'));
    const offs = [...s.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
    offs.forEach((o, i) => assert.ok(s.slice(o).startsWith(`${i + 1} 0 obj`), `object ${i + 1} at ${o}`));
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
});

test('pdf: text width (Helvetica metrics) and wrapping', () => {
    assert.ok(Math.abs(textWidth('0123456789', 10) - 55.6) < 0.01);
    const lines = wrapText('Tides are from a model: relative to mean sea level, not chart datum. Use official tide tables.', 150, 9);
    assert.ok(lines.length >= 3 && lines.every(l => textWidth(l, 9) <= 150));
});
