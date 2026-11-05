// Distances (owner, 2026-11-02, point 8): port-to-port sea distance along the shipping-lane network, next to the
// great-circle and rhumb-line distances, with the canals and straits passed. Approximate: the network is Eurostat's
// SeaRoute / MARNET (built for statistics and pictures, "not for navigation"), merged on a 0.2° grid; the port
// positions are approximate (sea-ports list). Tested in test/seanet.test.ts.

import { legGeometry, type LatLon } from './geo';
import { PORTS_RAW, SEANET_B64, SEANET_NODES } from './seaNetData';

export interface Port {
    code: string;
    name: string;
    /** Two-letter country code (first letters of the UN/LOCODE) */
    country: string;
    lat: number;
    lon: number;
}

/** Canals and main straits / capes (approximate positions; for the picture and the "via" list) */
export interface Passage {
    name: string;
    kind: 'canal' | 'strait' | 'cape';
    /** Ends of a canal, or one point for a strait / cape */
    points: LatLon[];
    /** Length for canals (approximate, from public figures; see windy/notes/data-sources-research.md E) */
    lengthNote?: string;
}

export const PASSAGES: Passage[] = [
    { name: 'Suez Canal', kind: 'canal', points: [{ lat: 31.25, lon: 32.31 }, { lat: 29.93, lon: 32.56 }], lengthNote: 'about 104 nm with the approach channels (193 km)' },
    { name: 'Panama Canal', kind: 'canal', points: [{ lat: 9.36, lon: -79.92 }, { lat: 8.95, lon: -79.57 }], lengthNote: 'about 44 nm deep water to deep water (82 km)' },
    { name: 'Kiel Canal', kind: 'canal', points: [{ lat: 53.89, lon: 9.14 }, { lat: 54.36, lon: 10.14 }], lengthNote: 'about 53 nm (98 km)' },
    { name: 'Strait of Gibraltar', kind: 'strait', points: [{ lat: 35.96, lon: -5.6 }] },
    { name: 'Dover Strait', kind: 'strait', points: [{ lat: 51.0, lon: 1.4 }] },
    { name: 'Singapore Strait', kind: 'strait', points: [{ lat: 1.18, lon: 103.9 }] },
    { name: 'Malacca Strait', kind: 'strait', points: [{ lat: 2.5, lon: 101.3 }] },
    { name: 'Strait of Hormuz', kind: 'strait', points: [{ lat: 26.55, lon: 56.45 }] },
    { name: 'Bab-el-Mandeb', kind: 'strait', points: [{ lat: 12.58, lon: 43.33 }] },
    { name: 'Bosporus', kind: 'strait', points: [{ lat: 41.12, lon: 29.07 }] },
    { name: 'Cape of Good Hope', kind: 'cape', points: [{ lat: -34.6, lon: 18.4 }] },
    { name: 'Cape Horn', kind: 'cape', points: [{ lat: -56.2, lon: -67.3 }] },
];

const D2R = Math.PI / 180;
/** Great-circle distance on a sphere, nm (fast; for the network) */
export function sphereNm(a: LatLon, b: LatLon): number {
    const la1 = a.lat * D2R;
    const la2 = b.lat * D2R;
    const dLa = la2 - la1;
    const dLo = (b.lon - a.lon) * D2R;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
    return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * 3440.065;
}

interface Net {
    lat: Float32Array;
    lon: Float32Array;
    /** CSR adjacency: neighbours of i are nbr[off[i]..off[i+1]) with lengths len[] */
    off: Int32Array;
    nbr: Int32Array;
    len: Float32Array;
    /** 2° cells → node ids, to find the nearest node quickly */
    cells: Map<number, number[]>;
}

let net: Net | null = null;

function decode(): Net {
    const bin = atob(SEANET_B64);
    let p = 0;
    const vu = () => {
        let x = 0;
        let s = 0;
        for (;;) {
            const b = bin.charCodeAt(p++);
            x += (b & 127) * 2 ** s;
            if (b < 128) return x;
            s += 7;
        }
    };
    const vs = () => {
        const u = vu();
        return u % 2 ? -(u + 1) / 2 : u / 2;
    };
    const n = SEANET_NODES;
    const lat = new Float32Array(n);
    const lon = new Float32Array(n);
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
        x += vs();
        y += vs();
        lon[i] = x / 100;
        lat[i] = y / 100;
    }
    const edges: [number, number][] = [];
    for (let i = 0; i < n; i++) {
        const k = vu();
        let j = i;
        for (let m = 0; m < k; m++) {
            j += vu();
            edges.push([i, j]);
        }
    }
    const deg = new Int32Array(n + 1);
    for (const [a, b] of edges) {
        deg[a]++;
        deg[b]++;
    }
    const off = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
    const fill = off.slice(0, n);
    const nbr = new Int32Array(off[n]);
    const len = new Float32Array(off[n]);
    for (const [a, b] of edges) {
        const d = sphereNm({ lat: lat[a], lon: lon[a] }, { lat: lat[b], lon: lon[b] });
        nbr[fill[a]] = b;
        len[fill[a]++] = d;
        nbr[fill[b]] = a;
        len[fill[b]++] = d;
    }
    const cells = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
        const c = cellOf(lat[i], lon[i]);
        const l = cells.get(c);
        if (l) l.push(i);
        else cells.set(c, [i]);
    }
    return { lat, lon, off, nbr, len, cells };
}

const cellOf = (lat: number, lon: number) => Math.floor((lat + 90) / 2) * 1000 + Math.floor((((lon + 180) % 360) + 360) % 360 / 2);

function getNet(): Net {
    if (!net) net = decode();
    return net;
}

/** Nearest network node to a position (searching outwards in 2° cells), with its distance in nm */
export function nearestNode(p: LatLon): { id: number; nm: number } | null {
    const g = getNet();
    const r0 = Math.floor((p.lat + 90) / 2);
    const c0 = Math.floor((((p.lon + 180) % 360) + 360) % 360 / 2);
    let best = -1;
    let bd = Infinity;
    for (let ring = 0; ring <= 12; ring++) {
        for (let dr = -ring; dr <= ring; dr++)
            for (let dc = -ring; dc <= ring; dc++) {
                if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                const r = r0 + dr;
                if (r < 0 || r >= 90) continue;
                const c = (((c0 + dc) % 180) + 180) % 180;
                for (const i of g.cells.get(r * 1000 + c) ?? []) {
                    const d = sphereNm(p, { lat: g.lat[i], lon: g.lon[i] });
                    if (d < bd) {
                        bd = d;
                        best = i;
                    }
                }
            }
        // a cell is at least ~ring × 2° × 60 × cos(lat) nm away: stop when nothing nearer can be found
        if (best >= 0 && bd < ring * 120 * Math.max(0.2, Math.cos(p.lat * D2R))) break;
    }
    return best < 0 ? null : { id: best, nm: bd };
}

export interface SeaRoute {
    /** Total: from the start to the network, along it, and from it to the end */
    distNm: number;
    path: LatLon[];
    via: string[];
    /** How far the start / end were from the lane network, nm */
    offStartNm: number;
    offEndNm: number;
}

/** Shortest way along the shipping-lane network (A*), or null if none */
export function seaRoute(a: LatLon, b: LatLon): SeaRoute | null {
    const g = getNet();
    const s = nearestNode(a);
    const t = nearestNode(b);
    if (!s || !t) return null;
    const n = g.lat.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    const tp = { lat: g.lat[t.id], lon: g.lon[t.id] };
    const h = (i: number) => sphereNm({ lat: g.lat[i], lon: g.lon[i] }, tp);
    // binary heap of [f, node]
    const heapF: number[] = [];
    const heapN: number[] = [];
    const push = (f: number, v: number) => {
        let i = heapF.length;
        heapF.push(f);
        heapN.push(v);
        while (i > 0) {
            const q = (i - 1) >> 1;
            if (heapF[q] <= f) break;
            heapF[i] = heapF[q];
            heapN[i] = heapN[q];
            i = q;
        }
        heapF[i] = f;
        heapN[i] = v;
    };
    const pop = (): number => {
        const top = heapN[0];
        const lf = heapF.pop() as number;
        const ln = heapN.pop() as number;
        if (heapF.length) {
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                if (l >= heapF.length) break;
                const r = l + 1;
                const c = r < heapF.length && heapF[r] < heapF[l] ? r : l;
                if (heapF[c] >= lf) break;
                heapF[i] = heapF[c];
                heapN[i] = heapN[c];
                i = c;
            }
            heapF[i] = lf;
            heapN[i] = ln;
        }
        return top;
    };
    dist[s.id] = 0;
    push(h(s.id), s.id);
    while (heapF.length) {
        const u = pop();
        if (done[u]) continue;
        done[u] = 1;
        if (u === t.id) break;
        for (let k = g.off[u]; k < g.off[u + 1]; k++) {
            const v = g.nbr[k];
            const d = dist[u] + g.len[k];
            if (d < dist[v]) {
                dist[v] = d;
                prev[v] = u;
                push(d + h(v), v);
            }
        }
    }
    if (!isFinite(dist[t.id])) return null;
    const ids: number[] = [];
    for (let v = t.id; v >= 0; v = prev[v]) ids.push(v);
    ids.reverse();
    const path: LatLon[] = [a, ...ids.map(i => ({ lat: g.lat[i], lon: g.lon[i] })), b];
    return { distNm: s.nm + dist[t.id] + t.nm, path, via: passagesOn(path), offStartNm: s.nm, offEndNm: t.nm };
}

/** Canals, straits and capes a path passes (in order) */
export function passagesOn(path: LatLon[]): string[] {
    const hits: { name: string; at: number }[] = [];
    for (const ps of PASSAGES) {
        const lim = ps.kind === 'canal' ? 20 : ps.kind === 'strait' ? 45 : 80;
        const idx = ps.points.map(q => {
            let bi = -1;
            let bd = Infinity;
            path.forEach((p, i) => {
                const d = sphereNm(p, q);
                if (d < bd) {
                    bd = d;
                    bi = i;
                }
            });
            return bd <= lim ? bi : -1;
        });
        if (idx.every(i => i >= 0)) hits.push({ name: ps.name, at: Math.min(...idx) });
    }
    return hits.sort((x, y) => x.at - y.at).map(h => h.name);
}

/** Longitudes made continuous for drawing (no jump at the date line) */
export function unwrapPath(path: LatLon[]): [number, number][] {
    const out: [number, number][] = [];
    let prev: number | null = null;
    for (const p of path) {
        let lon = p.lon;
        if (prev != null) {
            while (lon - prev > 180) lon -= 360;
            while (lon - prev < -180) lon += 360;
        }
        out.push([p.lat, lon]);
        prev = lon;
    }
    return out;
}

let portList: Port[] | null = null;
/** The port list (about 1,600 ports; approximate positions) */
export function ports(): Port[] {
    if (!portList)
        portList = PORTS_RAW.split(';').map(r => {
            const [code, name, lon, lat] = r.split('|');
            return { code, name, country: code.slice(0, 2), lat: Number(lat), lon: Number(lon) };
        });
    return portList;
}

/** Ports matching a search (name or UN/LOCODE), best first */
export function findPorts(q: string, max = 12): Port[] {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out: { p: Port; score: number }[] = [];
    for (const p of ports()) {
        const n = p.name.toLowerCase();
        const c = p.code.toLowerCase();
        const score = c === s ? 0 : n === s ? 1 : n.startsWith(s) ? 2 : c.startsWith(s) ? 3 : n.includes(s) ? 4 : -1;
        if (score >= 0) out.push({ p, score });
    }
    return out
        .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
        .slice(0, max)
        .map(o => o.p);
}

export interface DistanceRow {
    from: string;
    to: string;
    gcNm: number;
    rlNm: number;
    sea: SeaRoute | null;
}

/** Great circle, rhumb line and along the sea lanes between two places */
export function distanceRow(fromName: string, a: LatLon, toName: string, b: LatLon): DistanceRow {
    return { from: fromName, to: toName, gcNm: legGeometry(a, b, 'GC').distNm, rlNm: legGeometry(a, b, 'RL').distNm, sea: seaRoute(a, b) };
}
