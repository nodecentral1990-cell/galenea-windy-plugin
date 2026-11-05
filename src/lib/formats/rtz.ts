// RTZ (IEC 61174 route exchange format) import and export.
// Reads versions 1.0, 1.1 and 1.2 without caring about the namespace version.
// Writes version 1.0 by default (widest ECDIS acceptance).
// Unknown data (manufacturer extensions, extra leg attributes) is kept and written
// back unchanged, as the RTZ specification requires.
// Furuno writes the schedule tag as "sheduleElement" (sic); both spellings are read.

import { XMLBuilder, XMLParser } from 'fast-xml-parser';

import { wrapLon } from '../geo';
import { newRoute, newUid, type Route, type Waypoint } from '../model';

type XmlObj = Record<string, unknown>;

const ARRAYS = ['waypoint', 'scheduleElement', 'sheduleElement', 'schedule', 'extension'];

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseAttributeValue: false,
    parseTagValue: false,
    isArray: name => ARRAYS.includes(name),
});

const num = (v: unknown): number | undefined => {
    if (v == null || v === '') {
        return undefined;
    }
    const n = Number(v);
    return isFinite(n) ? n : undefined;
};

const attrs = (o: unknown): XmlObj => {
    const out: XmlObj = {};
    if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o as XmlObj)) {
            if (k.startsWith('@_')) {
                out[k] = v;
            }
        }
    }
    return out;
};

export function parseRtz(text: string, fileName?: string): Route {
    const doc = parser.parse(text) as XmlObj;
    const r = doc.route as XmlObj | undefined;
    if (!r) {
        throw new Error('Not an RTZ file: no <route> element found.');
    }
    const version = String((r['@_version'] as string) ?? '1.0');
    const info = (r.routeInfo ?? {}) as XmlObj;
    const wpsNode = (r.waypoints ?? {}) as XmlObj;
    const rawWps = (wpsNode.waypoint ?? []) as XmlObj[];
    if (rawWps.length === 0) {
        throw new Error('The RTZ file has no waypoints.');
    }
    const defLeg = ((wpsNode.defaultWaypoint as XmlObj | undefined)?.leg ?? {}) as XmlObj;

    const route = newRoute(String(info['@_routeName'] ?? fileName ?? 'Imported route'));
    route.source = {
        format: 'RTZ',
        fileName,
        raw: { rtzVersion: version, routeInfo: info, defaultWaypoint: wpsNode.defaultWaypoint },
    };

    // Schedule: "calculated" wins over "manual" (RTZ rule). Take the first schedule.
    const schedules = ((r.schedules as XmlObj | undefined)?.schedule ?? []) as XmlObj[];
    const sched = schedules[0];
    let elements: XmlObj[] = [];
    let scheduleTag = 'sheduleElement';
    if (sched) {
        const block = (sched.calculated ?? sched.manual) as XmlObj | undefined;
        if (block) {
            if (block.scheduleElement) {
                elements = block.scheduleElement as XmlObj[];
                scheduleTag = 'scheduleElement';
            } else if (block.sheduleElement) {
                elements = block.sheduleElement as XmlObj[];
                scheduleTag = 'sheduleElement';
            }
        }
    }
    (route.source.raw as XmlObj).scheduleTag = scheduleTag;
    const byId = new Map<string, XmlObj>();
    for (const el of elements) {
        byId.set(String(el['@_waypointId']), el);
    }

    route.waypoints = rawWps.map((w, i): Waypoint => {
        const pos = (w.position ?? {}) as XmlObj;
        const lat = num(pos['@_lat']);
        const lon = num(pos['@_lon']);
        if (lat == null || lon == null) {
            throw new Error(`Waypoint ${i + 1} has no valid position.`);
        }
        const leg = { ...attrs(defLeg), ...attrs(w.leg) };
        const geometry = String(leg['@_geometryType'] ?? 'Loxodrome');
        const el = byId.get(String(w['@_id']));
        const exts = (w.extensions as XmlObj | undefined)?.extension as XmlObj[] | undefined;
        let zoneMin: number | null = null;
        for (const e of exts ?? []) {
            const prop = e.property as XmlObj | undefined;
            const lt = num(prop?.['@_localtime']);
            if (e['@_manufacturer'] === 'Furuno' && lt != null) {
                zoneMin = lt;
            }
        }
        const wpAttrs = attrs(w);
        delete wpAttrs['@_id'];
        delete wpAttrs['@_name'];
        return {
            uid: newUid(),
            name: String(w['@_name'] ?? ''),
            lat,
            lon,
            legType: geometry === 'Orthodrome' ? 'GC' : 'RL',
            speed: num(el?.['@_speed']) ?? null,
            allowance: 0,
            rpm: null,
            engineSpeed: null,
            turnRadius: num(w['@_radius']),
            xtdPort: num(leg['@_portsideXTD']),
            xtdStbd: num(leg['@_starboardXTD']),
            zoneMin,
            raw: { rtzWaypoint: wpAttrs, rtzLeg: attrs(w.leg), rtzExtensions: w.extensions },
        };
    });

    const etd = el0Time(byId.get(String(rawWps[0]['@_id'])), '@_etd');
    const eta = el0Time(byId.get(String(rawWps[rawWps.length - 1]['@_id'])), '@_eta');
    if (etd != null) {
        route.etd = etd;
    }
    if (eta != null) {
        route.eta = eta;
    }
    const speeds = route.waypoints.slice(1).map(w => w.speed);
    const common = speeds.find(s => s != null);
    if (common != null) {
        route.defaultSpeed = common;
    }
    if (route.waypoints.slice(1).every(w => w.legType === 'GC')) {
        route.defaultLegType = 'GC';
    }
    return route;
}

function el0Time(el: XmlObj | undefined, key: string): number | null {
    const v = el?.[key];
    if (typeof v !== 'string') {
        return null;
    }
    const t = Date.parse(v);
    return isNaN(t) ? null : t;
}

const fx = (n: number, d: number): string => n.toFixed(d);
const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

export interface RtzWriteOptions {
    /** Speed over ground per leg, kn (index = arriving waypoint index). From the plan. */
    sog?: (number | null)[];
    etd?: number | null;
    eta?: number | null;
}

export function writeRtz(route: Route, opts: RtzWriteOptions = {}): string {
    const raw = (route.source?.format === 'RTZ' ? route.source.raw : undefined) as XmlObj | undefined;
    const info: XmlObj = { ...((raw?.routeInfo as XmlObj) ?? {}) };
    info['@_routeName'] = route.name;
    const scheduleTag = (raw?.scheduleTag as string) || 'sheduleElement';

    const waypoint = route.waypoints.map((w, i) => {
        const prev = (w.raw ?? {}) as XmlObj;
        const node: XmlObj = { '@_id': String(i + 1), '@_name': w.name, ...((prev.rtzWaypoint as XmlObj) ?? {}) };
        if (w.turnRadius != null) {
            node['@_radius'] = fx(w.turnRadius, 6);
        }
        node.position = { '@_lat': fx(w.lat, 6), '@_lon': fx(wrapLon(w.lon), 6) };
        if (i > 0) {
            const leg: XmlObj = { ...((prev.rtzLeg as XmlObj) ?? {}) };
            if (w.xtdPort != null) {
                leg['@_portsideXTD'] = fx(w.xtdPort, 6);
            }
            if (w.xtdStbd != null) {
                leg['@_starboardXTD'] = fx(w.xtdStbd, 6);
            }
            leg['@_geometryType'] = w.legType === 'GC' ? 'Orthodrome' : 'Loxodrome';
            node.leg = leg;
        }
        if (prev.rtzExtensions) {
            node.extensions = prev.rtzExtensions;
        }
        return node;
    });

    const elements = route.waypoints.map((_w, i) => {
        const el: XmlObj = { '@_waypointId': String(i + 1) };
        const s = opts.sog?.[i];
        if (i > 0 && s != null && isFinite(s)) {
            el['@_speed'] = fx(s, 6);
        }
        if (i === 0 && opts.etd != null) {
            el['@_etd'] = iso(opts.etd);
        }
        if (i === route.waypoints.length - 1 && opts.eta != null) {
            el['@_eta'] = iso(opts.eta);
        }
        return el;
    });

    const doc = {
        '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
        route: {
            '@_version': '1.0',
            '@_xmlns': 'http://www.cirm.org/RTZ/1/0',
            routeInfo: info,
            waypoints: { waypoint },
            schedules: { schedule: [{ '@_id': '1', manual: { [scheduleTag]: elements } }] },
        },
    };
    const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        format: true,
        indentBy: '  ',
        suppressEmptyNode: true,
    });
    return builder.build(doc) as string;
}
