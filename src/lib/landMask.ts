// Coarse land / water lookup for the route optimiser: Natural Earth 1:10m land at 0.1° (about 6 nm)
// squares, built by windy/tools/make-land-mask.cjs. Small islands, narrow straits, harbours and
// anything under a square's size are not resolved: an aid for keeping a route off land in open
// water, never a replacement for checking the route on ECDIS.

import { LAND_H, LAND_RES, LAND_RUNS, LAND_W } from './landMaskData';

let bits: Uint8Array | null = null;

function decode(): Uint8Array {
    const raw = Uint8Array.from(atob(LAND_RUNS), c => c.charCodeAt(0));
    const out = new Uint8Array(Math.ceil((LAND_W * LAND_H) / 8));
    let p = 0;
    const next = () => {
        let n = 0;
        let shift = 0;
        for (;;) {
            const b = raw[p++];
            n |= (b & 127) << shift;
            if (b < 128) return n;
            shift += 7;
        }
    };
    for (let r = 0; r < LAND_H; r++) {
        let c = 0;
        let land = false;
        while (c < LAND_W) {
            const run = next();
            if (land) for (let i = c; i < c + run; i++) out[(r * LAND_W + i) >> 3] |= 1 << ((r * LAND_W + i) & 7);
            c += run;
            land = !land;
        }
    }
    return out;
}

/** True when the 0.1° square holding the position is land on the Natural Earth outline. */
export function isLand(lat: number, lon: number): boolean {
    if (!bits) bits = decode();
    const r = Math.min(LAND_H - 1, Math.max(0, Math.floor((lat + 90) / LAND_RES)));
    const c = Math.min(LAND_W - 1, Math.max(0, Math.floor((((((lon + 180) % 360) + 360) % 360)) / LAND_RES)));
    const i = r * LAND_W + c;
    return (bits[i >> 3] & (1 << (i & 7))) !== 0;
}

/**
 * Water check for the optimiser. Squares within `freeNm` of the given end points (the waypoints the
 * optimised stretch starts and ends at, usually near a coast) are always taken as water, so a
 * start or end close to land is not refused.
 */
export function makeIsWater(free: { lat: number; lon: number }[] = [], freeNm = 8): (lat: number, lon: number) => boolean {
    return (lat, lon) => {
        for (const f of free) {
            const dLat = (lat - f.lat) * 60;
            const dLon = (((lon - f.lon + 540) % 360) - 180) * 60 * Math.cos((f.lat * Math.PI) / 180);
            if (dLat * dLat + dLon * dLon <= freeNm * freeNm) return true;
        }
        return !isLand(lat, lon);
    };
}
