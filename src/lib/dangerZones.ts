// Danger sectors for the polar diagram (owner, 2026-10-28: "must be flawless"): for each ship
// heading and speed, which IMO MSC.1/Circ.1228 warnings apply with the waves now (any wave
// system), as runs of speed per heading so they can be drawn as smooth sectors. ONE colour per
// warning type (the same as the chips in the weather table), stripes where two apply at once.
// By default only real warnings are drawn (waves at or above the user's warning heights);
// optionally, pale zones show where higher waves would warn.
// The wind sea has no period of its own in the forecast, so it gives no zone (its flag is shown).

import { checkWaveSystem, type Phenomenon, type ResonanceSettings } from './circ1228';
import { waveSystems, type WxPoint } from './weather';

export interface ZoneRun {
    /** Heading, °T (centre of a stepDeg wide wedge) */
    h: number;
    /** Speed range, kn */
    v0: number;
    v1: number;
    /** Warnings in this cell, in the fixed order of PHENOMENA */
    kinds: Phenomenon[];
    /** True where the waves are at or above the warning height (a real warning); false = pale "would warn with higher waves" */
    strong: boolean;
    /** True in the middle of the band (closer than half-way to the exact condition) */
    core: boolean;
}

export interface PolarZones {
    runs: ZoneRun[];
    /** For each warning drawn: the wave systems causing it (label, height, period) */
    causes: Partial<Record<Phenomenon, { label: string; height: number; period: number; strong: boolean }[]>>;
}

/** Drawing order and legend order */
export const PHENOMENA: Phenomenon[] = ['parametric', 'synchronous', 'highWaves', 'surf'];

/** One clear colour per warning type, matching the weather table chips */
export const ZONE_COLORS: Record<Phenomenon, string> = { parametric: '#e53935', synchronous: '#9c27b0', highWaves: '#1e9e4a', surf: '#3949ab' };

export const ZONE_LABEL: Record<Phenomenon, string> = {
    parametric: 'Parametric roll',
    synchronous: 'Synchronous roll',
    highWaves: 'Successive high waves',
    surf: 'Surf-riding / broaching',
};

/** Fill opacity: real warnings strong (darker in the middle of the band), "higher waves" zones pale */
export const zoneOpacity = (strong: boolean, core: boolean): number => (strong ? (core ? 0.9 : 0.6) : core ? 0.22 : 0.12);

export function dangerZones(
    wx: WxPoint,
    lbp: number | null,
    rollPeriod: number | null,
    settings: ResonanceSettings,
    opts: { stepDeg?: number; stepKn?: number; vmax?: number; show?: Partial<Record<Phenomenon, boolean>>; pale?: boolean } = {},
): PolarZones {
    const stepDeg = opts.stepDeg ?? 1;
    const stepKn = opts.stepKn ?? 0.5;
    const vmax = opts.vmax ?? 25;
    const systems = waveSystems(wx);
    const shown = (p: Phenomenon) => opts.show?.[p] !== false;
    const runs: ZoneRun[] = [];
    const causes: PolarZones['causes'] = {};
    const addCause = (p: Phenomenon, ws: { label: string; height: number; period: number }, strong: boolean) => {
        const list = (causes[p] ??= []);
        const have = list.find(c => c.label === ws.label);
        if (!have) list.push({ label: ws.label, height: ws.height, period: ws.period, strong });
        else have.strong ||= strong;
    };
    /** What applies at one heading and speed */
    const cell = (h: number, v: number): { kinds: Phenomenon[]; strong: boolean; core: boolean; key: string } => {
        const ship = { headingDeg: h, speedKn: v, lbp, rollPeriod };
        const strongKinds = new Set<Phenomenon>();
        const paleKinds = new Set<Phenomenon>();
        let core = false;
        for (const ws of systems) {
            const real = new Set(checkWaveSystem(ws, ship, settings).map(x => x.phenomenon));
            for (const hit of checkWaveSystem(ws, ship, settings, true)) {
                if (!shown(hit.phenomenon)) continue;
                const strong = real.has(hit.phenomenon);
                if (!strong && !opts.pale) continue;
                (strong ? strongKinds : paleKinds).add(hit.phenomenon);
                if ((hit.closeness ?? 1) >= 0.5) core = true;
                addCause(hit.phenomenon, ws, strong);
            }
        }
        // a cell with a real warning shows only the real warnings
        const strong = strongKinds.size > 0;
        const kinds = PHENOMENA.filter(p => (strong ? strongKinds : paleKinds).has(p));
        return { kinds, strong, core, key: kinds.length ? `${kinds.join('+')}|${strong}|${core}` : '' };
    };
    // Per heading: sample the speeds every stepKn, then find each change exactly (bisection to
    // about 0.01 kn), so the sector edges are smooth curves rather than steps.
    for (let h = 0; h < 360; h += stepDeg) {
        let prevV = 0;
        let prev = cell(h, 0);
        let runStart = 0;
        const close = (vEnd: number, c: typeof prev) => {
            if (c.key && vEnd > runStart + 1e-6) runs.push({ h, v0: runStart, v1: vEnd, kinds: c.kinds, strong: c.strong, core: c.core });
        };
        for (let v = stepKn; v <= vmax + 1e-9; v += stepKn) {
            const cur = cell(h, Math.min(v, vmax));
            if (cur.key !== prev.key) {
                let lo = prevV;
                let hi = v;
                for (let i = 0; i < 6; i++) {
                    const mid = (lo + hi) / 2;
                    if (cell(h, mid).key === prev.key) lo = mid;
                    else hi = mid;
                }
                const edge = (lo + hi) / 2;
                close(edge, prev);
                runStart = edge;
            }
            prev = cur;
            prevV = v;
        }
        close(vmax, prev);
    }
    return { runs, causes };
}
