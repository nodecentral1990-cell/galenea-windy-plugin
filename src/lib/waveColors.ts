// The user's own colours for Windy's wave, wind-sea and swell layers (owner, 2026-10-28): white
// below a minimum height, then solid bands every 0.5 or 1 m from lightest (lowest) to darkest
// (highest), like a printed wave chart. Turned into the gradient format Windy's colour scales use:
// a list of [value, [r, g, b, a]] stops, values in metres.

export type WaveLayer = 'hs' | 'sea' | 'swell';
export type RGBA = [number, number, number, number];

export interface Palette {
    id: string;
    label: string;
    /** Light → dark */
    colors: string[];
}

export const PALETTES: Palette[] = [
    { id: 'multi', label: 'Multicolour, light → dark', colors: ['#d9f4ff', '#9fdcf7', '#5fb8ec', '#3d8fd6', '#45b36b', '#a8cf38', '#ffd23f', '#ff9f2e', '#f2552c', '#c4185a', '#7b1fa2', '#3d0b5c'] },
    { id: 'blue', label: 'Blues', colors: ['#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#1e88e5', '#1565c0', '#0d47a1', '#082c66'] },
    { id: 'green', label: 'Greens to purples', colors: ['#e8f5e9', '#b9e4bb', '#81c784', '#4caf8e', '#26a69a', '#2b7bb9', '#3f51b5', '#5e35b1', '#4a148c'] },
    { id: 'grey', label: 'Greys', colors: ['#f2f2f2', '#d6d6d6', '#bababa', '#9e9e9e', '#828282', '#666666', '#4a4a4a', '#2e2e2e', '#141414'] },
];

export interface WaveColorSettings {
    /** Use these colours for Windy's layers (off = Windy's own colours) */
    on: boolean;
    palette: string;
    /** Band width, m */
    step: 0.5 | 1;
    /** Below these heights the sea is white, m */
    min: Record<WaveLayer, number>;
    /** Lines of equal height on the map, switched on / off for each wave type */
    lines: Record<WaveLine, boolean>;
}

/** Wave types that can have lines of equal height (Windy's map layers) */
export type WaveLine = 'hs' | 'sea' | 'swell1' | 'swell2';
export const WAVE_LINES: { id: WaveLine; label: string; overlay: string; color: string; minOf: WaveLayer }[] = [
    { id: 'hs', label: 'SWH (waves)', overlay: 'waves', color: '#111111', minOf: 'hs' },
    { id: 'sea', label: 'Sea (wind waves)', overlay: 'wwaves', color: '#0d47a1', minOf: 'sea' },
    { id: 'swell1', label: 'Swell 1', overlay: 'swell1', color: '#1b5e20', minOf: 'swell' },
    { id: 'swell2', label: 'Swell 2', overlay: 'swell2', color: '#6d4c41', minOf: 'swell' },
];
export const lineOfOverlay = (overlay: string): WaveLine | null => WAVE_LINES.find(l => l.overlay === overlay)?.id ?? null;

export const defaultWaveColors = (): WaveColorSettings => ({
    on: true,
    palette: 'multi',
    step: 1,
    min: { hs: 2, sea: 1.5, swell: 2 },
    lines: { hs: true, sea: false, swell1: false, swell2: false },
});

/** Settings saved by an older version (lines was one on / off) brought up to date */
export function migrateWaveColors(s: Partial<WaveColorSettings> & { lines?: unknown }): WaveColorSettings {
    const d = defaultWaveColors();
    const lines = typeof s.lines === 'boolean' ? { ...d.lines, hs: s.lines } : { ...d.lines, ...((s.lines as Partial<Record<WaveLine, boolean>>) ?? {}) };
    return { ...d, ...s, min: { ...d.min, ...(s.min ?? {}) }, lines };
}

/**
 * How to get the wave height from Windy's map-layer reading (its interpolator gives three numbers).
 * Windy's type files do not say; the plugin works it out by comparing with a point forecast:
 * 'hypot' = length of the first two (a direction vector scaled by the height), or one of the three.
 */
export type WaveDecode = 'hypot' | 0 | 1 | 2;
export function decodeWave(raw: unknown, how: WaveDecode): number {
    const v = Array.isArray(raw) ? (raw as number[]) : null;
    if (!v) return NaN;
    const x = how === 'hypot' ? Math.hypot(v[0], v[1]) : v[how];
    return Number.isFinite(x) && x >= 0 && x < 40 ? x : NaN;
}
/** The reading that best matches known heights (within 25 %), or null */
export function calibrateDecode(samples: { raw: unknown; height: number }[]): WaveDecode | null {
    let best: { how: WaveDecode; err: number } | null = null;
    for (const how of ['hypot', 0, 1, 2] as WaveDecode[]) {
        const errs = samples.filter(s => s.height > 0.2).map(s => Math.abs(decodeWave(s.raw, how) - s.height) / s.height);
        if (!errs.length || errs.some(e => !Number.isFinite(e))) continue;
        const err = errs.reduce((a, b) => a + b, 0) / errs.length;
        if (err < 0.25 && (!best || err < best.err)) best = { how, err };
    }
    return best?.how ?? null;
}

const hex = (h: string): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

/** Colour of band `i` of `n` (0 = lowest) along the palette, light → dark */
export function bandColor(p: Palette, i: number, n: number): RGBA {
    const f = n <= 1 ? 0 : Math.min(1, i / (n - 1));
    const x = f * (p.colors.length - 1);
    const j = Math.min(p.colors.length - 2, Math.floor(x));
    const a = hex(p.colors[j]);
    const b = hex(p.colors[j + 1]);
    const t = x - j;
    return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * t)).concat(255) as RGBA;
}

/** Highest band start used for each layer, m (anything above is the darkest colour) */
export const TOP: Record<WaveLayer, number> = { hs: 12, sea: 10, swell: 10 };

/**
 * Gradient for Windy's colour scale: white from 0 to just under `min`, then flat bands every `step`
 * (two stops per band, so Windy does not blend inside a band), darkest from TOP upwards.
 */
export function waveGradient(layer: WaveLayer, s: WaveColorSettings): [number, RGBA][] {
    const p = PALETTES.find(x => x.id === s.palette) ?? PALETTES[0];
    const min = Math.max(0, s.min[layer]);
    const top = Math.max(min + s.step, TOP[layer]);
    const n = Math.max(1, Math.round((top - min) / s.step));
    const white: RGBA = [255, 255, 255, 255];
    const out: [number, RGBA][] = [];
    if (min > 0) out.push([0, white], [Math.max(0, min - 0.001), white]);
    for (let i = 0; i < n; i++) {
        const c = bandColor(p, i, n);
        out.push([min + i * s.step, c], [min + (i + 1) * s.step - 0.001, c]);
    }
    out.push([top, bandColor(p, n - 1, n)], [30, bandColor(p, n - 1, n)]);
    return out;
}

/** Which of the three a Windy layer (overlay) shows, or null for other layers */
export function layerOfOverlay(overlay: string): WaveLayer | null {
    if (overlay === 'waves') return 'hs';
    if (overlay === 'wwaves') return 'sea';
    if (overlay.startsWith('swell')) return 'swell';
    return null;
}
