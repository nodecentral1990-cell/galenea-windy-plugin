// Transas / Wärtsilä Navi-Sailor RT3 route files: BEST-EFFORT (BETA).
// There is no public RT3 specification. The layout used here comes from one
// open-source exporter (gim4p/cruise_track_tool, rt3_export.py):
//   <TSH_Route RtName=".." RtVersion="3"> <WayPoints> <WayPoint Id WPName LegType Lat Lon
//   PortXTE StbXTE TurnRadius .../> ...
// Lat/Lon are in MINUTES of arc (degrees × 60).
// ASSUMPTION (unverified): LegType "0" = rhumb line, any other value = great circle.
// Export has NOT been tested on a real Navi-Sailor. Check every exported route on ECDIS.

import { wrapLon } from '../geo';
import { newRoute, newWaypoint, type Route } from '../model';

const attr = (tag: string, name: string): string | undefined => {
    const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
    return m ? m[1] : undefined;
};

export function parseRt3(text: string, fileName = 'route.rt3'): Route {
    if (!/<TSH_Route/i.test(text)) {
        throw new Error('Not an RT3 file: no <TSH_Route> element found.');
    }
    const head = text.match(/<TSH_Route[^>]*>/i)?.[0] ?? '';
    const route = newRoute(attr(head, 'RtName') || fileName.replace(/\.[^.]+$/, ''));
    route.source = { format: 'RT3', fileName, raw: { header: head } };
    const tags = text.match(/<WayPoint\b[^>]*>/gi) ?? [];
    for (const tag of tags) {
        const lat = Number(attr(tag, 'Lat'));
        const lon = Number(attr(tag, 'Lon'));
        if (!isFinite(lat) || !isFinite(lon)) {
            continue;
        }
        const legType = attr(tag, 'LegType');
        const wp = newWaypoint(lat / 60, lon / 60, legType && legType !== '0' ? 'GC' : 'RL', attr(tag, 'WPName') ?? '');
        const n = (v: string | undefined) => (v != null && v !== '' && isFinite(Number(v)) ? Number(v) : undefined);
        wp.xtdPort = n(attr(tag, 'PortXTE'));
        wp.xtdStbd = n(attr(tag, 'StbXTE'));
        wp.turnRadius = n(attr(tag, 'TurnRadius'));
        wp.raw = { rt3: tag };
        route.waypoints.push(wp);
    }
    if (route.waypoints.length === 0) {
        throw new Error('The RT3 file has no readable waypoints.');
    }
    return route;
}

const f6 = (n: number | undefined) => (n ?? 0).toFixed(6);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function writeRt3(route: Route): string {
    const wps = route.waypoints
        .map(
            (w, i) =>
                `<WayPoint Id="${i + 1}" WPName="${esc(w.name || String(i + 1).padStart(3, '0'))}" LegType="${
                    i > 0 && w.legType === 'GC' ? 1 : 0
                }" Lat="${f6(w.lat * 60)}" Lon="${f6(wrapLon(w.lon) * 60)}" PortXTE="${f6(w.xtdPort)}" StbXTE="${f6(
                    w.xtdStbd,
                )}" TurnRate="0.000000" TurnRadius="${f6(w.turnRadius)}" SafetyContour="30.000000" SafetyDepth="30.000000" RudderAngle="0.000000" ArrivalC="0.000000" FlowPoint="off"/>`,
        )
        .join('\r\n');
    return `<?xml version="1.0"?>\r\n<TSH_Route RtName="${esc(route.name)}" RtVersion="3">\r\n<WayPoints>\r\n${wps}\r\n</WayPoints>\r\n</TSH_Route>\r\n`;
}
