// GPX 1.1 import (route, track or waypoints) and export (as a route).

import { XMLParser } from 'fast-xml-parser';

import { wrapLon } from '../geo';
import { newRoute, newWaypoint, type Route } from '../model';

type X = Record<string, unknown>;

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: name => ['rte', 'rtept', 'trk', 'trkseg', 'trkpt', 'wpt'].includes(name),
});

export function parseGpx(text: string, fileName = 'route.gpx'): Route {
    const doc = parser.parse(text) as X;
    const gpx = doc.gpx as X | undefined;
    if (!gpx) {
        throw new Error('Not a GPX file: no <gpx> element found.');
    }
    let pts: X[] = [];
    let name = '';
    const rte = (gpx.rte as X[] | undefined)?.[0];
    if (rte?.rtept) {
        pts = rte.rtept as X[];
        name = String(rte.name ?? '');
    } else if ((gpx.trk as X[] | undefined)?.[0]) {
        const trk = (gpx.trk as X[])[0];
        name = String(trk.name ?? '');
        pts = ((trk.trkseg as X[] | undefined) ?? []).flatMap(s => (s.trkpt as X[] | undefined) ?? []);
    } else if (gpx.wpt) {
        pts = gpx.wpt as X[];
    }
    const route = newRoute(name || fileName.replace(/\.[^.]+$/, ''));
    route.source = { format: 'GPX', fileName };
    for (const p of pts) {
        const lat = Number(p['@_lat']);
        const lon = Number(p['@_lon']);
        if (isFinite(lat) && isFinite(lon)) {
            route.waypoints.push(newWaypoint(lat, lon, route.defaultLegType, String(p.name ?? '')));
        }
    }
    if (route.waypoints.length === 0) {
        throw new Error('The GPX file has no route, track or waypoint positions.');
    }
    return route;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function writeGpx(route: Route): string {
    const pts = route.waypoints
        .map(
            (w, i) =>
                `    <rtept lat="${w.lat.toFixed(6)}" lon="${wrapLon(w.lon).toFixed(6)}"><name>${esc(w.name || 'WP' + (i + 1))}</name></rtept>`,
        )
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ship Master's Voyage Planner, Windy plugin (aid only)" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>${esc(route.name)}</name>
${pts}
  </rte>
</gpx>
`;
}
