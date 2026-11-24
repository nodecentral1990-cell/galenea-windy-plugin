// All the ways to draw the weather on a ship symbol on the map (owner, 2026-11-23: "have all the options available for
// the user to select"). They are the ten designs of windy/screens/ship-symbol-options.pdf (drawn by
// windy/tools/ship-symbol-options/options.cjs) plus today's rings; the user picks one in Settings → Map display →
// "Drawn as" (default: one ring, the owner's choice). Everything shows where it comes FROM; heights as plain numbers,
// periods as "7s"; red = a limit broken, amber = an alert (same as before); one colour per wave kind (the user's).

import { barbSvg, fullFlagColors, GLYPH_COLORS, GLYPH_SIZE, glyphRingSvg, glyphSvg, lighterColor, levelColor, textOn, type FlagColors, type ShipGlyph } from './shipGlyph';
import type { Level } from './weather';

export type GlyphStyle = 'rings' | 'ring' | 'flags' | 'rose' | 'card' | 'biggest' | 'fronts' | 'station' | 'bars' | 'quiet' | 'darts';

/** The choices, in the order of the PDF (0 = the rings before 0.29, 1 = one ring …) */
export const GLYPH_STYLES: { id: GlyphStyle; no: number; name: string }[] = [
    { id: 'ring', no: 1, name: 'One ring: arrow heads, height / period outside, barb on the ship' },
    { id: 'rings', no: 0, name: 'Rings: a flag per wave in its own ring, barb outside (before 0.29)' },
    { id: 'flags', no: 2, name: 'Flags side by side, barb on the ship' },
    { id: 'rose', no: 3, name: 'Wave rose: small compass card, petal per wave' },
    { id: 'card', no: 4, name: 'Data card beside the ship' },
    { id: 'biggest', no: 5, name: 'Biggest wave big, the rest small' },
    { id: 'fronts', no: 6, name: 'Wave fronts (crest lines)' },
    { id: 'station', no: 7, name: 'Station plot (numbers at fixed corners)' },
    { id: 'bars', no: 8, name: 'Bars beside the ship' },
    { id: 'quiet', no: 9, name: 'Quiet: arrow heads only, numbers when you point at the ship' },
    { id: 'darts', no: 10, name: 'Darts: length shows the height' },
];

type Kind = 'swh' | 'sea' | 'sw1' | 'sw2';
const KINDS: Kind[] = ['swh', 'sea', 'sw1', 'sw2'];
const NAME: Record<Kind, string> = { swh: 'SWH', sea: 'Sea', sw1: 'Swell 1', sw2: 'Swell 2' };
type W = { k: Kind; h: number; t: number | null; dir: number; level: Level };
type P = { x: number; y: number };
type Wx = { waves: W[]; by: Partial<Record<Kind, W>>; wind: { dir: number; kn: number; level: Level } | null };

const f = (n: number) => (Math.round(n * 10) / 10).toString();
const at = (c: P, b: number, r: number, s = 0): [number, number] => {
    const a = (b * Math.PI) / 180;
    return [c.x + r * Math.sin(a) + s * Math.cos(a), c.y - r * Math.cos(a) + s * Math.sin(a)];
};
const pts = (a: [number, number][]) => a.map(q => `${f(q[0])},${f(q[1])}`).join(' ');
const poly = (a: [number, number][], fill: string, stroke = 'rgba(0,0,0,0.85)', sw = 1) => `<polygon points="${pts(a)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const tw = (s: string, font: number) => [...s].reduce((n, ch) => n + (/[./ :°]/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.7 : /[a-z]/.test(ch) ? 0.56 : 0.58), 0) * font;
const label = (w: W) => `${w.h.toFixed(1)}${w.t != null && isFinite(w.t) ? `/${Math.round(w.t)}s` : ''}`;
const per = (w: W) => (w.t != null && isFinite(w.t) ? `${Math.round(w.t)}s` : '');
type TxtOpt = { anchor?: string; size?: number; weight?: string; fill?: string; halo?: boolean; haloW?: number; rot?: number };
const txt = (x: number, y: number, s: string, o: TxtOpt = {}) =>
    `<text x="${f(x)}" y="${f(y)}" text-anchor="${o.anchor || 'middle'}" dominant-baseline="central" font-size="${o.size || 10}" font-weight="${o.weight || 'bold'}" font-family="Arial, Helvetica, sans-serif" fill="${o.fill || '#fff'}"${o.halo === false ? '' : ` paint-order="stroke" stroke="#0b1622" stroke-width="${o.haloW || 3}" stroke-linejoin="round"`}${o.rot != null ? ` transform="rotate(${f(o.rot)} ${f(x)} ${f(y)})"` : ''}>${s}</text>`;
const pillSize = (s: string, font = 10) => ({ w: tw(s, font) + 9, h: font + 4 });
const pill = (x: number, y: number, s: string, fill: string, font = 10) => {
    const { w, h } = pillSize(s, font);
    return `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="3.5" fill="${fill}" stroke="rgba(0,0,0,0.85)" stroke-width="1"/>` + txt(x, y + 0.5, s, { size: font, fill: textOn(fill), halo: false });
};
const dial = (x: number, y: number, dir: number, fill: string, r = 6) => {
    const c = { x, y };
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.8)" stroke-width="0.9"/>` + poly([at(c, dir, -r * 0.35), at(c, dir, r + 1, -r * 0.6), at(c, dir, r + 1, r * 0.6)], fill, 'rgba(0,0,0,0.85)', 0.7);
};
const head = (c: P, dir: number, r0: number, r1: number, half: number, fill: string, shift = 0) =>
    poly([at(c, dir, r0, shift), at(c, dir, r1, -half + shift), at(c, dir, r1 - (r1 - r0) * 0.25, shift), at(c, dir, r1, half + shift)], fill);
const leader = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="rgba(255,255,255,0.55)" stroke-width="1" stroke-dasharray="2 2"/>`;

function flag(c: P, dir: number, r0: number, rEnd: number, half: number, fill: string, text: string, font: number, shift = 0): string {
    const p = (r: number, s: number) => at(c, dir, r, s + shift);
    let out = poly([p(r0, 0), p(r0 + half * 1.3, -half), p(rEnd, -half), p(rEnd, half), p(r0 + half * 1.3, half)], fill);
    if (text) {
        const [tx, ty] = p((r0 + half * 1.3 + rEnd) / 2, 0);
        const d = ((dir % 360) + 360) % 360;
        out += txt(tx, ty, text, { size: font, fill: textOn(fill), halo: false, rot: d < 180 ? d - 90 : d + 90 });
    }
    return out;
}

function spread(dirs: number[], need: number, rs: number): number[] {
    const order = dirs.map((dir, i) => ({ i, dir })).sort((a, b) => a.dir - b.dir);
    const shift = dirs.map(() => 0);
    if (!order.length) return shift;
    let group = [order[0]];
    const flush = () => {
        const o = [0];
        for (let j = 1; j < group.length; j++) {
            const natural = 2 * rs * Math.sin((angDiff(group[j].dir, group[j - 1].dir) * Math.PI) / 360);
            o.push(o[j - 1] + Math.max(0, need - natural));
        }
        const mean = o.reduce((a, b) => a + b, 0) / o.length;
        group.forEach((g, j) => (shift[g.i] = o[j] - mean));
    };
    for (let j = 1; j < order.length; j++) {
        if (order[j].dir - order[j - 1].dir < 40) group.push(order[j]);
        else {
            flush();
            group = [order[j]];
        }
    }
    flush();
    return shift;
}

function labelsAround(c: P, size: number, items: { dir: number; text: string; fill: string; r?: number }[], r: number, font = 10): string {
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const hit = (a: (typeof placed)[0], b: (typeof placed)[0]) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 2;
    let out = '';
    let boxes = '';
    for (const it of items) {
        const { w, h } = pillSize(it.text, font);
        let best: { box: (typeof placed)[0]; moved: boolean } | null = null;
        search: for (const dr of [0, 13, 26, 39])
            for (const da of [0, -9, 9, -18, 18, -27, 27]) {
                const d = it.dir + da;
                const a = (d * Math.PI) / 180;
                const rr = (it.r ?? r) + dr + (Math.abs(Math.sin(a)) * w) / 2 + (Math.abs(Math.cos(a)) * h) / 2;
                const [x, y] = at(c, d, rr);
                const box = { x, y, w, h };
                if (x - w / 2 < 2 || x + w / 2 > size - 2 || y - h / 2 < 2 || y + h / 2 > size - 2) continue;
                if (!placed.some(p => hit(p, box))) {
                    best = { box, moved: !!(dr || da) };
                    break search;
                }
            }
        if (!best) {
            const [x, y] = at(c, it.dir, (it.r ?? r) + 10);
            best = { box: { x, y, w, h }, moved: false };
        }
        placed.push(best.box);
        if (best.moved) {
            const [ax, ay] = at(c, it.dir, (it.r ?? r) - 1);
            out += `<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(best.box.x)}" y2="${f(best.box.y)}" stroke="${it.fill}" stroke-width="1.2"/>`;
        }
        boxes += pill(best.box.x, best.box.y, it.text, it.fill, font);
    }
    return out + boxes;
}

/** Colours: fill per wave kind (the user's), red / amber over a limit; lighter shade for text straight on the map */
function painter(colors: Partial<FlagColors>) {
    const col = fullFlagColors(colors);
    const base: Record<Kind, string> = { swh: col.swh, sea: col.sea, sw1: col.swell, sw2: col.swell2 };
    const fill = (w: W) => levelColor(base[w.k], w.level);
    const light = (w: W) => (w.level === 2 ? '#ff6b6b' : w.level === 1 ? '#ffd400' : lighterColor(base[w.k]));
    return { fill, light, base };
}

function wxOf(g: ShipGlyph): Wx {
    const by: Partial<Record<Kind, W>> = {};
    const add = (k: Kind, v: ShipGlyph['sea'] | undefined) => {
        if (v) by[k] = { k, h: v.h, t: v.period, dir: v.dir, level: v.level };
    };
    add('swh', g.swh);
    add('sea', g.sea);
    add('sw1', g.swell);
    add('sw2', g.swell2);
    return { by, waves: KINDS.filter(k => by[k]).map(k => by[k] as W), wind: g.wind };
}

const windBarb = (c: P, wx: Wx, base: number, tip: number, k: number, south: boolean) =>
    wx.wind ? barbSvg(c.x, c.y, wx.wind.dir, wx.wind.kn, levelColor(GLYPH_COLORS.wind, wx.wind.level), tip, k, south, base) : '';

/** the small table used by the card styles */
function card(x: number, y: number, wx: Wx, title: string, pt: ReturnType<typeof painter>): string {
    const rowH = 14;
    const w = 116;
    const h = 15 + wx.waves.length * rowH + 4;
    let out = `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${h}" rx="5" fill="rgba(9,16,26,0.86)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>`;
    out += txt(x + 7, y + 9, title, { size: 9, anchor: 'start', fill: '#dfe7ef', halo: false, weight: 'normal' });
    wx.waves.forEach((wv, i) => {
        const cy = y + 15 + i * rowH + rowH / 2;
        const red = wv.level > 0;
        if (red) out += `<rect x="${f(x + 2)}" y="${f(cy - rowH / 2 + 0.5)}" width="${w - 4}" height="${rowH - 1}" rx="3" fill="${pt.fill(wv)}"/>`;
        out += dial(x + 11, cy, wv.dir, red ? '#fff' : pt.base[wv.k], 5);
        out += txt(x + 22, cy + 0.5, NAME[wv.k], { size: 9.5, anchor: 'start', fill: red ? textOn(pt.fill(wv)) : lighterColor(pt.base[wv.k]), halo: false, weight: 'normal' });
        out += txt(x + 84, cy + 0.5, wv.h.toFixed(1), { size: 10.5, anchor: 'end', fill: red ? textOn(pt.fill(wv)) : '#fff', halo: false });
        out += txt(x + 110, cy + 0.5, per(wv), { size: 9.5, anchor: 'end', fill: red ? textOn(pt.fill(wv)) : '#c5d0db', halo: false, weight: 'normal' });
    });
    return out;
}

type Draw = (wx: Wx, c: P, size: number, south: boolean, pt: ReturnType<typeof painter>, title: string) => string;

const DRAW: Partial<Record<GlyphStyle, Draw>> = {
    flags: (wx, c, _s, south, pt) => {
        let out = windBarb(c, wx, 10, 27, 0.8, south);
        const sh = spread(wx.waves.map(w => w.dir), 15, 42);
        wx.waves.forEach((w, i) => (out += flag(c, w.dir, 31, 72, 6.5, pt.fill(w), label(w), 9, sh[i])));
        return out;
    },
    rose: (wx, c, size, south, pt) => {
        const R = 44;
        let out = `<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${R}" fill="rgba(255,255,255,0.9)" stroke="#0b1622" stroke-width="1.2"/>`;
        for (let d = 0; d < 360; d += 30) {
            const a = at(c, d, R);
            const b = at(c, d, R - (d % 90 ? 3 : 6));
            out += `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="#0b1622" stroke-width="${d % 90 ? 0.8 : 1.4}"/>`;
        }
        out += txt(c.x, c.y - R + 11, 'N', { size: 7.5, fill: '#0b1622', halo: false });
        const len = (h: number) => 15 + 27 * Math.min(1, h / 5);
        [...wx.waves]
            .sort((a, b) => b.h - a.h)
            .forEach(w => {
                const r = len(w.h);
                const a = at(c, w.dir - 10, r);
                const b = at(c, w.dir + 10, r);
                const o = at(c, w.dir, 9);
                out += `<path d="M${f(o[0])} ${f(o[1])} L${f(a[0])} ${f(a[1])} A${f(r)} ${f(r)} 0 0 1 ${f(b[0])} ${f(b[1])} Z" fill="${pt.fill(w)}" fill-opacity="0.92" stroke="rgba(0,0,0,0.85)" stroke-width="1" stroke-linejoin="round"/>`;
            });
        out += windBarb(c, wx, 9, 41, 0.85, south);
        out += labelsAround(c, size, wx.waves.map(w => ({ dir: w.dir, text: label(w), fill: pt.fill(w) })), R + 3);
        return out;
    },
    card: (wx, c, _s, south, pt, title) => {
        let out = windBarb(c, wx, 11, 38, 0.95, south);
        out += leader(c.x + 13, c.y, c.x + 54, c.y) + card(c.x + 54, c.y - 40, wx, title, pt);
        return out;
    },
    biggest: (wx, c, _s, south, pt) => {
        const ws = wx.waves;
        if (!ws.length) return windBarb(c, wx, 10, 27, 0.8, south);
        const big = ws.find(w => w.level === 2) || ws.find(w => w.k === 'swh') || ws[0];
        const rest = ws.filter(w => w !== big);
        let out = windBarb(c, wx, 10, 27, 0.8, south);
        const all = [big, ...rest];
        const sh = spread(all.map(w => w.dir), 17, 40);
        out += flag(c, big.dir, 31, 86, 8.5, pt.fill(big), label(big), 11, sh[0]);
        rest.forEach((w, i) => (out += head(c, w.dir, 32, 44, 5.5, pt.fill(w), sh[i + 1])));
        const obst = [0.3, 0.6, 0.9].map(t => {
            const [x, y] = at(c, big.dir, 31 + 55 * t, sh[0]);
            return { x, y };
        });
        rest.forEach((w, i) => {
            const [x, y] = at(c, w.dir, 53, sh[i + 1] * 1.3);
            const hitBig = obst.some(o => Math.abs(o.x - x) < 17 && Math.abs(o.y - y) < 15);
            const [x2, y2] = hitBig ? at(c, w.dir + (((w.dir - big.dir + 540) % 360) - 180 > 0 ? 14 : -14), 56, sh[i + 1]) : [x, y];
            out += txt(x2, y2, w.h.toFixed(1), { size: 10, fill: pt.light(w) });
        });
        return out;
    },
    fronts: (wx, c, size, south, pt) => {
        const ws = wx.waves.filter(w => w.k !== 'swh');
        let out = '';
        const lab: { dir: number; text: string; fill: string; r: number }[] = [];
        ws.forEach(w => {
            const gap = 4.5 + (w.t ?? 8) * 0.45;
            const half = w.k === 'sea' ? 11 : 17;
            const sw = 1.4 + Math.min(3.2, w.h * 0.75);
            const col = pt.fill(w);
            for (let i = 0; i < 3; i++) {
                const r = 33 + i * gap;
                const a = at(c, w.dir, r, -half);
                const b = at(c, w.dir, r, half);
                const m = at(c, w.dir, r + 3.5);
                const d = `M${f(a[0])} ${f(a[1])} Q${f(m[0])} ${f(m[1])} ${f(b[0])} ${f(b[1])}`;
                const dash = w.k === 'sea' ? ' stroke-dasharray="6 4"' : '';
                out += `<path d="${d}" fill="none" stroke="rgba(0,0,0,0.75)" stroke-width="${f(sw + 1.6)}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${f(sw)}" stroke-linecap="round"${dash}/>`;
            }
            lab.push({ dir: w.dir, text: label(w), fill: col, r: 33 + 2 * gap + 7 });
        });
        out += windBarb(c, wx, 10, 27, 0.8, south);
        out += labelsAround(c, size, lab, 50);
        const s0 = wx.by.swh;
        if (s0) {
            const s = label(s0);
            const col = pt.fill(s0);
            const { w } = pillSize(s, 10);
            out += dial(c.x + 22, c.y + 9, s0.dir, col, 5.5) + pill(c.x + 31 + w / 2, c.y + 9, s, col);
        }
        return out;
    },
    station: (wx, c, _s, south, pt) => {
        let out = windBarb(c, wx, 10, 40, 1, south);
        const slot: Record<Kind, [number, number]> = { swh: [-1, -1], sea: [1, -1], sw1: [-1, 1], sw2: [1, 1] };
        const wd = wx.wind?.dir ?? 0;
        const wq = [wd < 180 ? 1 : -1, wd > 90 && wd < 270 ? 1 : -1];
        for (const k of KINDS) {
            const w = wx.by[k];
            if (!w) continue;
            const [sx, sy] = slot[k];
            const barbHere = sx === wq[0] && sy === wq[1] && (wx.wind?.kn ?? 0) >= 2.5;
            const x0 = c.x + sx * (barbHere ? 40 : 16);
            const y = c.y + sy * (barbHere ? 30 : 24);
            const s = label(w);
            const wid = tw(s, 11);
            if (sx < 0) out += txt(x0, y, s, { size: 11, anchor: 'end', fill: pt.light(w) }) + dial(x0 - wid - 10, y, w.dir, pt.fill(w), 5.5);
            else out += dial(x0 + 6, y, w.dir, pt.fill(w), 5.5) + txt(x0 + 16, y, s, { size: 11, anchor: 'start', fill: pt.light(w) });
        }
        return out;
    },
    bars: (wx, c, _s, south, pt, title) => {
        let out = windBarb(c, wx, 11, 38, 0.95, south);
        const x = c.x + 54;
        const y = c.y - 58;
        const w = 124;
        const h = 116;
        const base = y + 72;
        const pitch = 29;
        out += leader(c.x + 13, c.y, x, c.y);
        out += `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${h}" rx="5" fill="rgba(9,16,26,0.86)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>`;
        out += txt(x + 7, y + 9, title, { size: 9, anchor: 'start', fill: '#dfe7ef', halo: false, weight: 'normal' });
        out += `<line x1="${f(x + 5)}" y1="${f(base)}" x2="${f(x + w - 5)}" y2="${f(base)}" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>`;
        KINDS.forEach((k, i) => {
            const wv = wx.by[k];
            const bx = x + 18 + i * pitch;
            out += txt(bx, base + 9, { swh: 'SWH', sea: 'Sea', sw1: 'Sw 1', sw2: 'Sw 2' }[k], { size: 8, fill: wv ? lighterColor(pt.base[k]) : '#6f7c8a', halo: false, weight: 'normal' });
            if (!wv) return;
            const bh = Math.max(2, Math.min(44, wv.h * 9));
            out += `<rect x="${f(bx - 7)}" y="${f(base - bh)}" width="14" height="${f(bh)}" fill="${pt.fill(wv)}" stroke="rgba(0,0,0,0.85)" stroke-width="1"/>`;
            out += txt(bx, base - bh - 8, wv.h.toFixed(1), { size: 10.5, fill: wv.level ? pt.light(wv) : '#fff', halo: false });
            out += txt(bx, base + 20, per(wv), { size: 9, fill: '#c5d0db', halo: false, weight: 'normal' });
            out += dial(bx, base + 34, wv.dir, pt.fill(wv), 5.5);
        });
        return out;
    },
    quiet: (wx, c, _s, south, pt, title) => {
        let out = windBarb(c, wx, 10, 27, 0.8, south);
        const sh = spread(wx.waves.map(w => w.dir), 12, 37);
        wx.waves.forEach((w, i) => (out += head(c, w.dir, 31, 42, 5.5, pt.fill(w), sh[i])));
        // the numbers when you point at the ship (the browser's own small note)
        const tip = [title, ...wx.waves.map(w => `${NAME[w.k]} ${label(w)} from ${String(Math.round(w.dir)).padStart(3, '0')}°`), wx.wind ? `Wind ${Math.round(wx.wind.kn)} kn from ${String(Math.round(wx.wind.dir)).padStart(3, '0')}°` : '']
            .filter(Boolean)
            .join('\n');
        out += `<circle cx="${f(c.x)}" cy="${f(c.y)}" r="44" fill="rgba(0,0,0,0.001)" style="pointer-events:auto;cursor:help"><title>${tip.replace(/[<&]/g, ch => (ch === '<' ? '&lt;' : '&amp;'))}</title></circle>`;
        return out;
    },
    darts: (wx, c, size, south, pt) => {
        const ws = wx.waves.filter(w => w.k !== 'swh');
        let out = windBarb(c, wx, 10, 27, 0.8, south);
        const sh = spread(ws.map(w => w.dir), 12, 44);
        const lab: { dir: number; text: string; fill: string; r: number }[] = [];
        ws.forEach((w, i) => {
            const L = 10 + Math.min(44, w.h * 9);
            const hw = 3 + Math.min(4, w.h * 0.9);
            out += poly([at(c, w.dir, 31, sh[i]), at(c, w.dir, 31 + L, sh[i] - hw), at(c, w.dir, 31 + L - 3, sh[i]), at(c, w.dir, 31 + L, sh[i] + hw)], pt.fill(w));
            lab.push({ dir: w.dir, text: label(w), fill: pt.fill(w), r: 31 + L + 2 });
        });
        out += labelsAround(c, size, lab, 50);
        const s0 = wx.by.swh;
        if (s0) {
            const s = label(s0);
            const col = pt.fill(s0);
            const { w } = pillSize(s, 10);
            out += dial(c.x + 22, c.y + 9, s0.dir, col, 5.5) + pill(c.x + 31 + w / 2, c.y + 9, s, col);
        }
        return out;
    },
};

/**
 * SVG for a ship symbol's weather in the chosen style (same size and centre as glyphSvg, so it drops into the map
 * marker). `title` = the time label (for the card styles' heading).
 */
export function glyphStyleSvg(style: GlyphStyle, g: ShipGlyph, size = GLYPH_SIZE, south = false, colors: Partial<FlagColors> = {}, title = ''): string {
    if (style === 'rings') return glyphSvg(g, size, south, colors);
    const draw = DRAW[style];
    if (!draw) return glyphRingSvg(g, size, south, colors);
    const c = { x: size / 2, y: size / 2 };
    const body = draw(wxOf(g), c, size, south, painter(colors), title);
    // the card styles reach past the right edge of the drawing: let them show
    return `<svg class="pp-glyph pp-glyph--${style}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
