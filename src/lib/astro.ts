// Sunrise / sunset and moonrise / moonset for a place and a UTC day (owner, 2026-11-13: port weather).
// Standard low-precision formulas (astronomical almanac style: mean anomaly, equation of centre, obliquity,
// sidereal time; moon from its main periodic terms), accurate to about a minute or two for the sun and a few
// minutes for the moon. Times in UTC (owner: UTC only). A guide, not the Nautical Almanac.

const RAD = Math.PI / 180;
const DAY = 86400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const E = RAD * 23.4397; // obliquity of the ecliptic

const toJulian = (ms: number) => ms / DAY - 0.5 + J1970;
const fromJulian = (j: number) => (j + 0.5 - J1970) * DAY;
const toDays = (ms: number) => toJulian(ms) - J2000;

const rightAscension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const declination = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
const altitude = (H: number, phi: number, dec: number) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;
const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M: number): number {
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)); // equation of centre
    const P = RAD * 102.9372; // perihelion of the Earth
    return M + C + P + Math.PI;
}
function astroRefraction(h: number): number {
    if (h < 0) h = 0;
    return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}

export interface RiseSet {
    /** UTC ms, or null when it does not happen that day */
    rise: number | null;
    set: number | null;
    /** Up all day (midnight sun) / down all day (polar night) */
    alwaysUp?: boolean;
    alwaysDown?: boolean;
}

/** Sunrise and sunset (upper limb on the horizon with refraction, −0.833°) for the UTC day containing `dayMs`. */
export function sunTimes(dayMs: number, lat: number, lon: number): RiseSet {
    const d0 = Math.floor(dayMs / DAY) * DAY;
    // solve for the day's solar noon near this longitude, then the hour angle of −0.833°
    const lw = RAD * -lon;
    const phi = RAD * lat;
    const J0 = 0.0009;
    const d = toDays(d0 + DAY / 2);
    const n = Math.round(d - J0 - lw / (2 * Math.PI));
    const ds = J0 + lw / (2 * Math.PI) + n;
    const M = solarMeanAnomaly(ds);
    const L = eclipticLongitude(M);
    const dec = declination(L, 0);
    const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const h0 = RAD * -0.833;
    const cosW = (Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cosW < -1) return { rise: null, set: null, alwaysUp: true };
    if (cosW > 1) return { rise: null, set: null, alwaysDown: true };
    const w = Math.acos(cosW);
    const Jset = J2000 + J0 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const Jrise = Jnoon - (Jset - Jnoon);
    const inDay = (ms: number) => (ms >= d0 && ms < d0 + DAY ? ms : null);
    return { rise: inDay(fromJulian(Jrise)), set: inDay(fromJulian(Jset)) };
}

/** The moon's position (radians: right ascension, declination; distance km) */
function moonCoords(d: number) {
    const L = RAD * (218.316 + 13.176396 * d); // ecliptic longitude
    const M = RAD * (134.963 + 13.064993 * d); // mean anomaly
    const F = RAD * (93.272 + 13.22935 * d); // mean distance
    const l = L + RAD * 6.289 * Math.sin(M);
    const b = RAD * 5.128 * Math.sin(F);
    const dist = 385001 - 20905 * Math.cos(M);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist };
}

/** Moon's altitude above the horizon (radians, with refraction) */
export function moonAltitude(ms: number, lat: number, lon: number): number {
    const lw = RAD * -lon;
    const phi = RAD * lat;
    const d = toDays(ms);
    const c = moonCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    const h = altitude(H, phi, c.dec);
    return h + astroRefraction(h);
}

/** Moonrise and moonset in the UTC day containing `dayMs` (searched hour by hour, refined by a parabola). */
export function moonTimes(dayMs: number, lat: number, lon: number): RiseSet {
    const t0 = Math.floor(dayMs / DAY) * DAY;
    const H = 3600_000;
    const hc = 0.133 * RAD; // moon's apparent radius + parallax correction to the horizon
    let h0 = moonAltitude(t0, lat, lon) - hc;
    let rise: number | null = null;
    let set: number | null = null;
    let ye = 0;
    for (let i = 1; i <= 24; i += 2) {
        const h1 = moonAltitude(t0 + i * H, lat, lon) - hc;
        const h2 = moonAltitude(t0 + (i + 1) * H, lat, lon) - hc;
        const a = (h0 + h2) / 2 - h1;
        const b = (h2 - h0) / 2;
        const xe = -b / (2 * a);
        ye = (a * xe + b) * xe + h1;
        const disc = b * b - 4 * a * h1;
        let roots = 0;
        let x1 = 0;
        let x2 = 0;
        if (disc >= 0) {
            const dx = Math.sqrt(disc) / (Math.abs(a) * 2);
            x1 = xe - dx;
            x2 = xe + dx;
            if (Math.abs(x1) <= 1) roots++;
            if (Math.abs(x2) <= 1) roots++;
            if (x1 < -1) x1 = x2;
        }
        if (roots === 1) {
            if (h0 < 0) rise = t0 + (i + x1) * H;
            else set = t0 + (i + x1) * H;
        } else if (roots === 2) {
            rise = t0 + (i + (ye < 0 ? x2 : x1)) * H;
            set = t0 + (i + (ye < 0 ? x1 : x2)) * H;
        }
        if (rise != null && set != null) break;
        h0 = h2;
    }
    const out: RiseSet = { rise, set };
    if (rise == null && set == null) {
        if (ye > 0) out.alwaysUp = true;
        else out.alwaysDown = true;
    }
    return out;
}

/** Moon illumination 0–1 and phase (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter) */
export function moonPhase(ms: number): { fraction: number; phase: number; name: string } {
    const d = toDays(ms);
    const M = solarMeanAnomaly(d);
    const L = eclipticLongitude(M);
    const sDec = declination(L, 0);
    const sRa = rightAscension(L, 0);
    const m = moonCoords(d);
    const sdist = 149598000;
    const phi = Math.acos(Math.sin(sDec) * Math.sin(m.dec) + Math.cos(sDec) * Math.cos(m.dec) * Math.cos(sRa - m.ra));
    const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
    const angle = Math.atan2(Math.cos(sDec) * Math.sin(sRa - m.ra), Math.sin(sDec) * Math.cos(m.dec) - Math.cos(sDec) * Math.sin(m.dec) * Math.cos(sRa - m.ra));
    const fraction = (1 + Math.cos(inc)) / 2;
    const phase = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;
    const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
    const name = names[Math.round(phase * 8) % 8];
    return { fraction, phase, name };
}
