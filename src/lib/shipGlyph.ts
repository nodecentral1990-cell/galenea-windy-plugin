// Weather drawn on each ship symbol and in the ship window, all showing where things COME FROM
// (owner, 2026-10-26): wind as a barb (staff towards the wind), sea and swell as Windy-style flags
// pointing at the ship from where they come. Each sits in its own ring around the ship
// (owner, 2026-10-27/30): swell 1 innermost, then swell 2, sea, SWH, and the wind barb outermost, so
// nothing can overlap whatever the directions. Coloured by the owner's limits (amber = alert, red = limit or an IMO Circ.1228 warning).

import { checkWaveSystem } from './circ1228';
import type { Vessel } from './model';
import { checkLimits, rollPeriodFor, seaDirOf, waveSystems, type Level, type Thresholds, type WxPoint } from './weather';

export interface ShipGlyph {
    /** SWH (sea and swell together): direction FROM, height m, period s (owner, 2026-10-30) */
    swh?: { dir: number; h: number; period: number | null; level: Level } | null;
    /** Wind sea: direction it comes FROM (°T), height m, period s */
    sea: { dir: number; h: number; period: number | null; level: Level } | null;
    /** Swell 1: direction FROM, height m, period s */
    swell: { dir: number; h: number; period: number | null; level: Level } | null;
    /** Swell 2 (shown from 0.3 m, as in the polar diagram) (owner, 2026-10-28) */
    swell2?: { dir: number; h: number; period: number | null; level: Level } | null;
    /** Wind: direction FROM, speed kn */
    wind: { dir: number; kn: number; level: Level } | null;
    /** True when any IMO MSC.1/Circ.1228 check warns at this position, heading and speed */
    imo: boolean;
}

/** Standard wind barb make-up, speed rounded to the nearest 5 kn: pennant 50, barb 10, half barb 5. */
export function barbParts(kn: number): { pennants: number; full: number; half: number; calm: boolean } {
    const r = Math.round(kn / 5) * 5;
    if (r < 5) return { pennants: 0, full: 0, half: 0, calm: true };
    const pennants = Math.floor(r / 50);
    const rest = r - pennants * 50;
    return { pennants, full: Math.floor(rest / 10), half: rest % 10 >= 5 ? 1 : 0, calm: false };
}

export function glyphFor(wx: WxPoint, heading: number, speedKn: number, vessel: Vessel, th: Thresholds): ShipGlyph {
    const limits = checkLimits(wx, heading, th);
    const lv = (what: string): Level => Math.max(0, ...limits.filter(l => l.what === what).map(l => l.level)) as Level;
    const roll = rollPeriodFor(vessel);
    const hitSystems = new Set(
        waveSystems(wx)
            .flatMap(ws => checkWaveSystem(ws, { headingDeg: heading, speedKn, lbp: vessel.lbp, rollPeriod: roll.value }, th.resonance))
            .map(h => h.system),
    );
    const ok = (v: number | null | undefined): v is number => v != null && isFinite(v);
    return {
        swh:
            ok(wx.hs) && ok(wx.hsDir) && wx.hs > 0.05
                ? { dir: wx.hsDir, h: wx.hs, period: wx.hsPeriod ?? null, level: Math.max(lv('SWH'), hitSystems.has('SWH') ? 2 : 0) as Level }
                : null,
        sea:
            ok(wx.seaHs) && ok(seaDirOf(wx)) && wx.seaHs > 0.05
                ? { dir: seaDirOf(wx) as number, h: wx.seaHs, period: wx.seaPeriod ?? null, level: Math.max(lv('Sea'), hitSystems.has('Sea') ? 2 : 0) as Level }
                : null,
        swell:
            ok(wx.sw1) && ok(wx.sw1Dir)
                ? { dir: wx.sw1Dir, h: wx.sw1, period: wx.sw1Period, level: hitSystems.has('Swell 1') ? 2 : lv('Swell 1') }
                : null,
        swell2:
            ok(wx.sw2) && ok(wx.sw2Dir) && wx.sw2 >= 0.3
                ? { dir: wx.sw2Dir, h: wx.sw2, period: wx.sw2Period, level: hitSystems.has('Swell 2') ? 2 : lv('Swell 2') }
                : null,
        wind: ok(wx.windKn) && ok(wx.windDir) ? { dir: wx.windDir, kn: wx.windKn, level: lv('Wind') } : null,
        imo: hitSystems.size > 0,
    };
}

export const GLYPH_COLORS = { swh: '#b388ff', sea: '#1e88e5', swell: '#43d16b', swell2: '#9be7b0', wind: '#151515', alert: '#ffd400', limit: '#ff3030' };

/** The user's flag colours for the four wave kinds (⚙ Settings → Map display) */
export interface FlagColors {
    swh: string;
    sea: string;
    /** Swell 1 */
    swell: string;
    swell2: string;
}
export const DEFAULT_FLAG_COLORS: FlagColors = { swh: GLYPH_COLORS.swh, sea: GLYPH_COLORS.sea, swell: GLYPH_COLORS.swell, swell2: GLYPH_COLORS.swell2 };
/** Saved colours (older versions had sea and swell only) with the missing ones filled in */
export const fullFlagColors = (c: Partial<FlagColors> | null | undefined): FlagColors => ({
    ...DEFAULT_FLAG_COLORS,
    ...(c ?? {}),
    ...(c && c.swell && !c.swell2 ? { swell2: lighterColor(c.swell) } : {}),
});
/** Black or white text, whichever reads better on the fill colour */
export function textOn(fill: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(fill);
    if (!m) return '#000';
    const n = parseInt(m[1], 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.55 ? '#000' : '#fff';
}

/**
 * Colours the user may pick for the sea and swell flags. The alert / limit colours (amber, red)
 * are left out on purpose, so a warning never looks like a normal flag.
 */
export const FLAG_PALETTE = ['#1e88e5', '#7fd8ff', '#43d16b', '#9be7b0', '#00bfa5', '#b388ff', '#7e57c2', '#ffffff', '#b0bec5', '#ec407a', '#8d6e63'];

export const levelColor = (base: string, level: Level) => (level === 2 ? GLYPH_COLORS.limit : level === 1 ? GLYPH_COLORS.alert : base);

const f = (n: number) => n.toFixed(1);
const at = (cx: number, cy: number, b: number, r: number, s = 0): [number, number] => {
    const a = (b * Math.PI) / 180;
    return [cx + r * Math.sin(a) + s * Math.cos(a), cy - r * Math.cos(a) + s * Math.sin(a)];
};

/**
 * Windy-style flag: a band from `rEnd` (out on the side the waves come from) to a point at `r0`
 * (next to the ship), with the text written along it.
 */
export function flagSvg(cx: number, cy: number, fromDir: number, r0: number, rEnd: number, half: number, fill: string, text: string, font: number, textR?: number, _auto = true): string {
    const p = (r: number, s: number) => at(cx, cy, fromDir, r, s);
    const pts = [p(r0, 0), p(r0 + half * 1.3, -half), p(rEnd, -half), p(rEnd, half), p(r0 + half * 1.3, half)];
    let out = `<polygon points="${pts.map(q => `${f(q[0])},${f(q[1])}`).join(' ')}" fill="${fill}" stroke="rgba(0,0,0,0.8)" stroke-width="1" stroke-linejoin="round"/>`;
    if (text) {
        const [tx, ty] = p(textR ?? (r0 + half * 1.3 + rEnd) / 2, 0);
        // along the band, never upside down
        const ang = ((fromDir % 360) + 360) % 360 < 180 ? fromDir - 90 : fromDir + 90;
        out += `<text x="${f(tx)}" y="${f(ty)}" transform="rotate(${f(ang)} ${f(tx)} ${f(ty)})" text-anchor="middle" dominant-baseline="central" font-size="${font}" font-weight="bold" font-family="sans-serif" fill="${textOn(fill)}">${text}</text>`;
    }
    return out;
}

/** Wind barb: staff from the ship towards where the wind comes from, feathers at the outer end. */
export function barbSvg(cx: number, cy: number, dir: number, kn: number, color: string, tip = 38, k = 1, south = false, base = 4 * k): string {
    const halo = 'rgba(255,255,255,0.55)';
    const seg = (a: [number, number], b: [number, number], w: number) =>
        `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${halo}" stroke-width="${w + 2}" stroke-linecap="round"/>` +
        `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
    const parts = barbParts(kn);
    if (parts.calm) {
        // calm: a small circle in the wind ring, at the top
        const [x, y] = at(cx, cy, 0, (base + tip) / 2);
        return `<circle cx="${f(x)}" cy="${f(y)}" r="${5 * k}" fill="none" stroke="${halo}" stroke-width="3"/><circle cx="${f(x)}" cy="${f(y)}" r="${5 * k}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
    }
    const side = south ? -1 : 1;
    let out = seg(at(cx, cy, dir, base), at(cx, cy, dir, tip), 1.5 * k);
    let r = tip;
    const end = (r0: number, len: number) => at(cx, cy, dir, r0 + len * 0.42, side * len);
    for (let i = 0; i < parts.pennants; i++) {
        const a = at(cx, cy, dir, r);
        const b = end(r - 6 * k, 11 * k);
        const c = at(cx, cy, dir, r - 6 * k);
        out += `<polygon points="${f(a[0])},${f(a[1])} ${f(b[0])},${f(b[1])} ${f(c[0])},${f(c[1])}" fill="${color}" stroke="${halo}" stroke-width="1"/>`;
        r -= 8 * k;
    }
    for (let i = 0; i < parts.full; i++) {
        out += seg(at(cx, cy, dir, r), end(r, 11 * k), 1.5 * k);
        r -= 4.5 * k;
    }
    if (parts.half) {
        if (parts.full === 0 && parts.pennants === 0) r -= 4.5 * k; // a lone half barb sits off the tip
        out += seg(at(cx, cy, dir, r), end(r, 6 * k), 1.5 * k);
    }
    return out;
}

/** Rings (radius from the ship centre, px) on the map symbols: swell 1 inside, then swell 2, sea, SWH, wind outside */
export const MAP_RINGS = { swell: [13, 33], swell2: [35, 55], sea: [57, 77], swh: [79, 99], wind: [101, 124] } as const;
/** Size of the map symbol drawing (px), room for all the rings */
export const GLYPH_SIZE = 252;

/** Lighter shade of a #rrggbb colour (swell 2 next to swell 1) */
export const lighterColor = (hex: string): string =>
    /^#[0-9a-f]{6}$/i.test(hex)
        ? '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.55 + 255 * 0.45).toString(16).padStart(2, '0')).join('')
        : hex;

/**
 * SVG (size × size, ship at the centre, north up) for a ship symbol on the map: swell flag in the
 * inner ring, sea flag in the middle ring, wind barb in the outer ring; heights as plain numbers
 * inside the flags (no "m"). `south` puts the barb feathers on the southern-hemisphere side.
 */
export function glyphSvg(g: ShipGlyph, size = GLYPH_SIZE, south = false, colors: Partial<FlagColors> = {}): string {
    const c = size / 2;
    const R = MAP_RINGS;
    const col = fullFlagColors(colors);
    let out = '';
    if (g.swell) out += flagSvg(c, c, g.swell.dir, R.swell[0], R.swell[1], 6.5, levelColor(col.swell, g.swell.level), g.swell.h.toFixed(1), 9);
    if (g.swell2) out += flagSvg(c, c, g.swell2.dir, R.swell2[0], R.swell2[1], 6.5, levelColor(col.swell2, g.swell2.level), g.swell2.h.toFixed(1), 9);
    if (g.sea) out += flagSvg(c, c, g.sea.dir, R.sea[0], R.sea[1], 6.5, levelColor(col.sea, g.sea.level), g.sea.h.toFixed(1), 9);
    if (g.swh) out += flagSvg(c, c, g.swh.dir, R.swh[0], R.swh[1], 6.5, levelColor(col.swh, g.swh.level), g.swh.h.toFixed(1), 9);
    if (g.wind) out += barbSvg(c, c, g.wind.dir, g.wind.kn, levelColor(GLYPH_COLORS.wind, g.wind.level), R.wind[1], 1, south, R.wind[0]);
    return `<svg class="pp-glyph" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
}

/**
 * Heading / speed arrow as ONE outlined shape (shaft and head together, so nothing pokes out):
 * from `r0` out along `bearing`; the TIP is exactly at `len` (the speed on the diagram's rings).
 * `w` = half the shaft width, `hl` = head length, `hw` = half the head width (px).
 */
export function arrowPoints(cx: number, cy: number, bearing: number, r0: number, len: number, w: number, hl: number, hw: number): [number, number][] {
    const head = Math.min(hl, Math.max(0, len - r0));
    const base = len - head;
    const local: [number, number][] =
        base > r0 + 0.5
            ? [[r0, -w], [base, -w], [base, -hw], [len, 0], [base, hw], [base, w], [r0, w]]
            : [[base, -hw], [len, 0], [base, hw]];
    return local.map(([r, s]) => at(cx, cy, bearing, r, s));
}
