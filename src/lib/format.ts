// Formatting and parsing of positions and times in mariner style.

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

function degMin(value: number, degWidth: number, decimals: number): [string, string] {
    const abs = Math.abs(value);
    let deg = Math.floor(abs);
    let min = Number(((abs - deg) * 60).toFixed(decimals));
    if (min >= 60) {
        deg += 1;
        min = 0;
    }
    return [pad(deg, degWidth), min.toFixed(decimals).padStart(decimals + 3, '0')];
}

/** 16°13.842'N */
export const fmtLat = (lat: number, decimals = 3): string => {
    const [d, m] = degMin(lat, 2, decimals);
    return `${d}°${m}'${lat < 0 ? 'S' : 'N'}`;
};

/** 061°32.553'W */
export const fmtLon = (lon: number, decimals = 3): string => {
    const l = ((((lon + 180) % 360) + 360) % 360) - 180;
    const [d, m] = degMin(l, 3, decimals);
    return `${d}°${m}'${l < 0 ? 'W' : 'E'}`;
};

export const fmtPos = (lat: number, lon: number): string => `${fmtLat(lat)} ${fmtLon(lon)}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "11 Oct 14:30" in the given offset from UTC (minutes, east positive). */
export function fmtTime(ms: number | null, offsetMin = 0): string {
    if (ms == null || !isFinite(ms)) {
        return '—';
    }
    const d = new Date(ms + offsetMin * 60_000);
    return `${pad(d.getUTCDate(), 2)} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}`;
}

/** "UTC+2", "UTC−4", "UTC+5:30" */
export function fmtZone(offsetMin: number): string {
    if (!offsetMin) {
        return 'UTC';
    }
    const sign = offsetMin > 0 ? '+' : '−';
    const a = Math.abs(offsetMin);
    const h = Math.floor(a / 60);
    const m = a % 60;
    return `UTC${sign}${h}${m ? ':' + pad(m, 2) : ''}`;
}

/** "2d 05h 30m" */
export function fmtDuration(hours: number): string {
    if (!isFinite(hours)) {
        return '—';
    }
    const totalMin = Math.round(hours * 60);
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    return `${d ? d + 'd ' : ''}${pad(h, 2)}h ${pad(m, 2)}m`;
}

/** Value for an <input type="datetime-local"> showing UTC. */
export function toUtcInput(ms: number | null): string {
    if (ms == null) {
        return '';
    }
    return new Date(ms).toISOString().slice(0, 16);
}

/** Parse an <input type="datetime-local"> value as UTC. */
export function fromUtcInput(value: string): number | null {
    if (!value) {
        return null;
    }
    const ms = Date.parse(value + (value.length === 16 ? ':00Z' : 'Z'));
    return isNaN(ms) ? null : ms;
}

/**
 * Parse one coordinate written in a common style:
 * "16.2307", "-61.54", "16°13.842'N", "16 13.842 N", "16-13.842N", "N16 13.842",
 * "1613.842N" (DDMM.mmm), "06132.553W", "16°13'50.5\"N".
 */
export function parseCoord(input: string, kind: 'lat' | 'lon'): number | null {
    let s = String(input).trim().toUpperCase().replace(',', '.');
    if (!s) {
        return null;
    }
    let sign = 1;
    const hemi = s.match(/[NSEW]/);
    if (hemi) {
        if (kind === 'lat' && !'NS'.includes(hemi[0])) {
            return null;
        }
        if (kind === 'lon' && !'EW'.includes(hemi[0])) {
            return null;
        }
        if (hemi[0] === 'S' || hemi[0] === 'W') {
            sign = -1;
        }
        s = s.replace(/[NSEW]/g, ' ');
    }
    if (/^\s*-/.test(s)) {
        sign = -sign;
        s = s.replace('-', ' ');
    }
    const nums = s
        .replace(/[°º'′"″:\-]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(Number);
    if (nums.length === 0 || nums.some(n => isNaN(n))) {
        return null;
    }
    let value: number;
    if (nums.length === 1) {
        value = nums[0];
        const limit = kind === 'lat' ? 90 : 180;
        if (value > limit && hemi) {
            // Compact DDMM.mmm / DDDMM.mmm
            const deg = Math.floor(value / 100);
            value = deg + (value - deg * 100) / 60;
        }
    } else {
        const [d, m = 0, sec = 0] = nums;
        if (m >= 60 || sec >= 60) {
            return null;
        }
        value = d + m / 60 + sec / 3600;
    }
    value *= sign;
    if (kind === 'lat' && Math.abs(value) > 90) {
        return null;
    }
    if (kind === 'lon' && Math.abs(value) > 360) {
        return null;
    }
    return value;
}

const LAT_SUFFIX = /(\d{1,2}(?:[°º\s:-]+\d{1,2}(?:[.,]\d+)?(?:['′\s:-]+\d{1,2}(?:[.,]\d+)?)?)?\s*['′"″]*|\d{4}[.,]\d+)\s*([NS])(?![A-Z])/i;
const LON_SUFFIX = /(\d{1,3}(?:[°º\s:-]+\d{1,2}(?:[.,]\d+)?(?:['′\s:-]+\d{1,2}(?:[.,]\d+)?)?)?\s*['′"″]*|\d{5}[.,]\d+)\s*([EW])(?![A-Z])/i;
const LAT_PREFIX = /(?<![A-Z])([NS])\s*(\d{1,2}(?:[°º\s:-]+\d{1,2}(?:[.,]\d+)?(?:['′\s:-]+\d{1,2}(?:[.,]\d+)?)?)?)/i;
const LON_PREFIX = /(?<![A-Z])([EW])\s*(\d{1,3}(?:[°º\s:-]+\d{1,2}(?:[.,]\d+)?(?:['′\s:-]+\d{1,2}(?:[.,]\d+)?)?)?)/i;

/** Find a latitude and a longitude anywhere in a line of free text. */
export function findPosition(line: string): { lat: number; lon: number; rest: string; before: string } | null {
    let m1 = line.match(LAT_SUFFIX);
    let m2 = line.match(LON_SUFFIX);
    if (m1 && m2) {
        const lat = parseCoord(m1[1] + m1[2], 'lat');
        const lon = parseCoord(m2[1] + m2[2], 'lon');
        if (lat != null && lon != null) {
            return { lat, lon, rest: line.replace(m1[0], ' ').replace(m2[0], ' '), before: line.slice(0, Math.min(m1.index ?? 0, m2.index ?? 0)) };
        }
    }
    m1 = line.match(LAT_PREFIX);
    m2 = line.match(LON_PREFIX);
    if (m1 && m2) {
        const lat = parseCoord(m1[2] + m1[1], 'lat');
        const lon = parseCoord(m2[2] + m2[1], 'lon');
        if (lat != null && lon != null) {
            return { lat, lon, rest: line.replace(m1[0], ' ').replace(m2[0], ' '), before: line.slice(0, Math.min(m1.index ?? 0, m2.index ?? 0)) };
        }
    }
    const dec = line.match(/(-?\d{1,2}\.\d+)[\s,;]+(-?\d{1,3}\.\d+)/);
    if (dec) {
        const lat = Number(dec[1]);
        const lon = Number(dec[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat, lon, rest: line.replace(dec[0], ' '), before: line.slice(0, dec.index ?? 0) };
        }
    }
    return null;
}
