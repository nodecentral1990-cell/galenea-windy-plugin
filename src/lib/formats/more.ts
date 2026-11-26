// More route formats (owner, 2026-11-26: "add all the route formats"): KML (Google Earth), JRC route sheet (CSV),
// Furuno RTZ 1.0 (FMD-3200 / 3300, with Furuno's extensions), RTZ 1.1, RTZ container (.rtzp: zip holding the .rtz) and
// NMEA 0183 waypoint / route sentences (WPL + RTE). Layouts from the public descriptions of these formats and the open
// "Port to port" plugin (MIT, floten.app); NOT yet tested on a JRC or Furuno ECDIS: marked beta on screen.
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

import { wrapLon } from '../geo';
import { newRoute, newWaypoint, type PlanCalc, type Route } from '../model';
import { parseRtz, writeRtz } from './rtz';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const legSpeed = (route: Route, i: number) => route.waypoints[i]?.speed ?? route.defaultSpeed ?? 12;

// ---------- KML ----------

export function writeKml(route: Route): string {
    const ll = route.waypoints.map(w => `${wrapLon(w.lon).toFixed(6)},${w.lat.toFixed(6)},0`);
    const marks = route.waypoints
        .map((w, i) => `    <Placemark><name>${esc(w.name || 'WP' + (i + 1))}</name><Point><coordinates>${ll[i]}</coordinates></Point></Placemark>`)
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>${esc(route.name)}</name>
  <description>Galenea (Windy plugin): planning aid only, not for navigation.</description>
  <Style id="route"><LineStyle><color>ff2ec8d8</color><width>3</width></LineStyle></Style>
  <Placemark><name>${esc(route.name)}</name><styleUrl>#route</styleUrl>
    <LineString><tessellate>1</tessellate><coordinates>
      ${ll.join('\n      ')}
    </coordinates></LineString></Placemark>
${marks}
</Document></kml>
`;
}

/** A KML route: the first line (LineString) with point names where a named point sits on it, else the points */
export function parseKml(text: string, fileName = 'route.kml'): Route {
    const pts: { lat: number; lon: number; name: string }[] = [];
    const named: { lat: number; lon: number; name: string }[] = [];
    const coords = (s: string) =>
        s
            .trim()
            .split(/\s+/)
            .map(t => t.split(',').map(Number))
            .filter(c => c.length >= 2 && isFinite(c[0]) && isFinite(c[1]) && Math.abs(c[1]) <= 90)
            .map(c => ({ lat: c[1], lon: c[0], name: '' }));
    const line = text.match(/<LineString[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i);
    for (const m of text.matchAll(/<Placemark[\s\S]*?<\/Placemark>/gi)) {
        const p = m[0];
        if (!/<Point[\s>]/i.test(p)) continue;
        const c = p.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
        const n = p.match(/<name>([\s\S]*?)<\/name>/i);
        const cc = c ? coords(c[1])[0] : null;
        if (cc) named.push({ ...cc, name: (n?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim() });
    }
    if (line) {
        pts.push(...coords(line[1]));
        for (const p of pts) p.name = named.find(n => Math.abs(n.lat - p.lat) < 1e-5 && Math.abs(n.lon - p.lon) < 1e-5)?.name ?? '';
    } else pts.push(...named);
    if (pts.length < 2) throw new Error('The KML file has no route line and fewer than two points.');
    const name = text.match(/<Document>[\s\S]*?<name>([\s\S]*?)<\/name>/i)?.[1]?.trim();
    const r = newRoute(name || fileName.replace(/\.[^.]+$/, ''));
    r.source = { format: 'KML', fileName };
    r.waypoints = pts.map(p => newWaypoint(p.lat, p.lon, r.defaultLegType, p.name));
    return r;
}

// ---------- JRC route sheet (CSV) ----------

const dm = (v: number, pos: string, neg: string, degW: number) => {
    const a = Math.abs(v);
    let d = Math.floor(a);
    let m = Number(((a - d) * 60).toFixed(3));
    if (m >= 60) {
        d += 1;
        m = 0;
    }
    return `${String(d).padStart(degW, '0')},${m.toFixed(3).padStart(6, '0')},${v >= 0 ? pos : neg}`;
};

/** JRC ECDIS route sheet: WPT No., LAT (deg, min, N/S), LON (deg, min, E/W), XTD port / stbd, arrival radius, speed,
 *  sailing RL / GC, rate of turn, turn radius, time zone, name. Rate of turn worked out from speed and turn radius. */
export function writeJrc(route: Route): string {
    const title = route.name.replace(/[\r\n,]/g, ' ').slice(0, 64);
    const lines = [
        '// ROUTE SHEET exported by JRC ECDIS.',
        '// <<NOTE>>This strings // indicate comment column/cells. You can edit freely.',
        `// ${title},<Normal>,`,
        '// WPT No.,LAT,,,LON,,,PORT[NM],STBD[NM],Arr. Rad[NM],Speed[kn],Sail(RL/GC),ROT[deg/min],Turn Rad[NM],Time Zone,,Name',
    ];
    route.waypoints.forEach((w, i) => {
        const pos = `${dm(w.lat, 'N', 'S', 2)},${dm(wrapLon(w.lon), 'E', 'W', 3)}`;
        const name = (w.name || '').replace(/[\r\n,]/g, ' ');
        if (i === 0) {
            lines.push(`${String(i).padStart(3, '0')},${pos},***,***,***,***,***,***,***,00:00,E,${name}`);
            return;
        }
        const r = w.turnRadius ?? 0.5;
        const v = legSpeed(route, i);
        const rot = r > 0 ? (v / r) * (180 / Math.PI) / 60 : 0;
        const n = (x: number | null | undefined, d = 0.5) => (x ?? d).toFixed(2);
        lines.push(`${String(i).padStart(3, '0')},${pos},${n(w.xtdPort)},${n(w.xtdStbd)},${r.toFixed(2)},${v.toFixed(1).padStart(5, '0')},${w.legType === 'GC' ? 'GC' : 'RL'},${rot.toFixed(2)},${r.toFixed(2)},00:00,E,${name}`);
    });
    return lines.join('\r\n') + '\r\n';
}

export const isJrc = (text: string) => /ROUTE SHEET|WPT No\.,LAT/i.test(text.slice(0, 600));

export function parseJrc(text: string, fileName = 'route.csv'): Route {
    const title = text.match(/^\/\/\s*([^,\r\n]+),<\w+>/m)?.[1]?.trim();
    const r = newRoute(title || fileName.replace(/\.[^.]+$/, ''));
    r.source = { format: 'JRC route sheet', fileName };
    for (const raw of text.split(/\r?\n/)) {
        const l = raw.trim();
        if (!l || l.startsWith('//')) continue;
        const c = l.split(',').map(s => s.trim());
        if (c.length < 7) continue;
        const lat = (Number(c[1]) + Number(c[2]) / 60) * (/^s/i.test(c[3]) ? -1 : 1);
        const lon = (Number(c[4]) + Number(c[5]) / 60) * (/^w/i.test(c[6]) ? -1 : 1);
        if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90) continue;
        const num = (s: string | undefined) => (s != null && s !== '' && s !== '***' && isFinite(Number(s)) ? Number(s) : null);
        const w = newWaypoint(lat, lon, /GC/i.test(c[11] ?? '') ? 'GC' : 'RL', c[16] ?? '');
        if (r.waypoints.length) {
            w.xtdPort = num(c[7]) ?? undefined;
            w.xtdStbd = num(c[8]) ?? undefined;
            const s = num(c[10]);
            if (s != null && s > 0) w.speed = s;
            w.turnRadius = num(c[13]) ?? num(c[9]) ?? undefined;
        }
        r.waypoints.push(w);
    }
    if (r.waypoints.length < 2) throw new Error('No waypoints found in the JRC route sheet.');
    return r;
}

// ---------- Furuno RTZ 1.0 ----------

/** Furuno FMD-3200 / 3300: RTZ 1.0 with Furuno's leg values (XTD, speed, geometry) and its extension blocks */
export function writeFurunoRtz(route: Route): string {
    const wps = route.waypoints
        .map((w, i) => {
            const leg =
                i === 0
                    ? ''
                    : `      <leg portsideXTD="${(w.xtdPort ?? 0.5).toFixed(6)}" starboardXTD="${(w.xtdStbd ?? 0.5).toFixed(6)}" geometryType="${w.legType === 'GC' ? 'Orthodrome' : 'Loxodrome'}" speedMax="${legSpeed(route, i).toFixed(6)}"/>
      <extensions>
        <extension manufacturer="Furuno" name="AdditionalLegInfo" version="1.0">
          <property margin="40.000000" parallelLine1="0.000000" parallelLine2="0.000000"/>
        </extension>
      </extensions>
`;
            return `    <!--No.${i + 1} waypoint-->
    <waypoint id="${i + 1}" name="${esc(w.name || '')}" radius="${(w.turnRadius ?? 0.5).toFixed(6)}">
      <position lat="${w.lat.toFixed(6)}" lon="${wrapLon(w.lon).toFixed(6)}"/>
${leg}    </waypoint>`;
        })
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!--route node-->
<route version="1.0" xmlns="http://www.cirm.org/RTZ/1/0">
  <routeInfo routeName="${esc(route.name)}" optimizationMethod="MAX speed">
    <extensions>
      <extension manufacturer="Furuno" name="AdditionalRouteInfo" version="1.0">
        <property income="0" channelLimitMode="0"/>
      </extension>
    </extensions>
  </routeInfo>
  <waypoints>
${wps}
  </waypoints>
  <schedules/>
</route>
`;
}

// ---------- RTZ 1.1 and the RTZ container ----------

/** RTZ 1.1 (CIRM): the same route as RTZ 1.0 with the 1.1 version and namespace */
export function writeRtz11(route: Route, plan: PlanCalc): string {
    return writeRtz(route, { sog: [null, ...plan.legs.map(l => l.sog)], etd: plan.etd, eta: plan.eta })
        .replace('version="1.0" xmlns="http://www.cirm.org/RTZ/1/0"', 'version="1.1" xmlns="http://www.cirm.org/RTZ/1/1"')
        .replace(/<route\s+version="1\.0"/, '<route version="1.1"')
        .replace('http://www.cirm.org/RTZ/1/0', 'http://www.cirm.org/RTZ/1/1');
}

/** .rtzp: a zip holding the .rtz (for USB sticks and some ECDIS) */
export function writeRtzp(rtzName: string, rtz: string): Uint8Array {
    return zipSync({ [rtzName]: strToU8(rtz) });
}

export function parseRtzp(data: Uint8Array, fileName = 'route.rtzp'): Route {
    const files = unzipSync(data);
    const name = Object.keys(files).find(n => /\.rtz$/i.test(n)) ?? Object.keys(files).find(n => /\.xml$/i.test(n));
    if (!name) throw new Error('The RTZ container holds no .rtz file.');
    const r = parseRtz(strFromU8(files[name]), fileName);
    return r;
}

export const isZip = (data: Uint8Array) => data.length > 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 3 && data[3] === 4;

// ---------- NMEA 0183 waypoints and route (WPL + RTE) ----------

const nmeaSum = (body: string) => {
    let c = 0;
    for (let i = 0; i < body.length; i++) c ^= body.charCodeAt(i);
    return c.toString(16).toUpperCase().padStart(2, '0');
};
const sentence = (body: string) => `$${body}*${nmeaSum(body)}`;
const nmeaPos = (v: number, degW: number) => {
    const a = Math.abs(v);
    let d = Math.floor(a);
    let m = Number(((a - d) * 60).toFixed(3));
    if (m >= 60) {
        d += 1;
        m = 0;
    }
    return `${String(d).padStart(degW, '0')}${m.toFixed(3).padStart(6, '0')}`;
};

/** NMEA 0183: one $GPWPL per waypoint (ids WP001 …) and $GPRTE sentences listing them in order (82 characters max) */
export function writeNmea(route: Route): string {
    const ids = route.waypoints.map((_, i) => `WP${String(i + 1).padStart(3, '0')}`);
    const out = route.waypoints.map((w, i) => sentence(`GPWPL,${nmeaPos(w.lat, 2)},${w.lat >= 0 ? 'N' : 'S'},${nmeaPos(wrapLon(w.lon), 3)},${wrapLon(w.lon) >= 0 ? 'E' : 'W'},${ids[i]}`));
    const rid = route.name.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 12) || 'ROUTE';
    const groups: string[][] = [];
    let cur: string[] = [];
    for (const id of ids) {
        if (`GPRTE,99,99,c,${rid},${[...cur, id].join(',')}`.length > 74) {
            groups.push(cur);
            cur = [];
        }
        cur.push(id);
    }
    if (cur.length) groups.push(cur);
    groups.forEach((g, k) => out.push(sentence(`GPRTE,${groups.length},${k + 1},c,${rid},${g.join(',')}`)));
    return out.join('\r\n') + '\r\n';
}

export const isNmea = (text: string) => /^\$[A-Z]{2}(WPL|RTE),/m.test(text.slice(0, 2000));

export function parseNmea(text: string, fileName = 'route.nmea'): Route {
    const wpl = new Map<string, { lat: number; lon: number }>();
    const order: string[] = [];
    let name = '';
    const coord = (v: string, h: string, degW: number) => {
        const d = Number(v.slice(0, degW));
        const m = Number(v.slice(degW));
        const x = d + m / 60;
        return /[SW]/i.test(h) ? -x : x;
    };
    for (const raw of text.split(/\r?\n/)) {
        const l = raw.trim().replace(/\*[0-9A-F]{2}$/i, '');
        const c = l.split(',');
        if (/^\$..WPL$/.test(c[0]) && c.length >= 6) {
            const lat = coord(c[1], c[2], 2);
            const lon = coord(c[3], c[4], 3);
            if (isFinite(lat) && isFinite(lon)) {
                wpl.set(c[5], { lat, lon });
                if (!order.includes(c[5])) order.push(c[5]);
            }
        } else if (/^\$..RTE$/.test(c[0]) && c.length >= 6) {
            // $..RTE,total,number,mode,route id,waypoints…: the first sentence starts the order afresh
            if (c[2] === '1') {
                order.length = 0;
                name = c[4] || name;
            }
            for (const id of c.slice(5)) if (id) order.push(id);
        }
    }
    const ids = [...new Set(order)].filter(id => wpl.has(id));
    const r = newRoute(name || fileName.replace(/\.[^.]+$/, ''));
    r.source = { format: 'NMEA 0183', fileName };
    r.waypoints = ids.map(id => newWaypoint(wpl.get(id)!.lat, wpl.get(id)!.lon, r.defaultLegType, id));
    if (r.waypoints.length < 2) throw new Error('Fewer than two waypoints ($..WPL) found in the NMEA file.');
    return r;
}
