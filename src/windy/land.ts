// Is a waypoint on land? Uses Windy's ground elevation for the position (@windy/fetch getElevation).
// Elevation above 0 m is reported as "may be on land". The elevation grid is coarse, so berths and
// waypoints very close to the coast can be flagged too: it is a warning only, the waypoint is kept.

import { getElevation } from '@windy/fetch';

const cache = new Map<string, Promise<number | null>>();

export function elevationAt(lat: number, lon: number): Promise<number | null> {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    let p = cache.get(key);
    if (!p) {
        p = (getElevation(lat, lon) as Promise<{ data?: unknown }>)
            .then(r => (typeof r?.data === 'number' && isFinite(r.data) ? r.data : null))
            .catch(() => null);
        cache.set(key, p);
    }
    return p;
}

/** Ids of the waypoints whose position has ground elevation above sea level. */
export async function waypointsOnLand(wps: { uid: string; lat: number; lon: number }[]): Promise<Set<string>> {
    const elev = await Promise.all(wps.map(w => elevationAt(w.lat, w.lon)));
    return new Set(wps.filter((_, i) => (elev[i] ?? 0) > 0).map(w => w.uid));
}
