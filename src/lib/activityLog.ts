// Activity log (owner, 2026-10-27): what the plugin did and what the user changed, with times in
// UTC, so a saved log file shows the developer what actually happened. Kept in this browser only
// (last entries survive a reload); nothing is sent anywhere. "Save activity log" writes a JSON file.

import { writable } from 'svelte/store';

export interface LogEntry {
    /** Time, ms (written as UTC in the file) */
    t: number;
    /** Kind: open, close, route, ship, limits, weather, layer, voyage, compare, optimise, error, tab, … */
    kind: string;
    msg: string;
    data?: unknown;
}

const KEY = 'windy-plugin-passage-plan:log';
const KEY_ON = 'windy-plugin-passage-plan:log-on';
/** Entries kept in memory / in the browser */
const MAX = 5000;
const MAX_SAVED = 2500;

function load(): LogEntry[] {
    try {
        const s = localStorage.getItem(KEY);
        return s ? (JSON.parse(s) as LogEntry[]) : [];
    } catch {
        return [];
    }
}

let entries: LogEntry[] = load();
/** Number of entries (for the buttons) */
export const logCount = writable(entries.length);

const onSaved = (() => {
    try {
        return localStorage.getItem(KEY_ON) !== '0';
    } catch {
        return true;
    }
})();
/** Recording on / off (⚙ Settings → Activity log and usage) */
export const logEnabled = writable<boolean>(onSaved);
let enabled = onSaved;
logEnabled.subscribe(v => {
    enabled = v;
    try {
        localStorage.setItem(KEY_ON, v ? '1' : '0');
    } catch {
        /* not remembered */
    }
});

let timer: ReturnType<typeof setTimeout> | null = null;
function persistSoon() {
    if (timer) return;
    timer = setTimeout(() => {
        timer = null;
        try {
            localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_SAVED)));
        } catch {
            try {
                // browser storage full: keep the newest part at least
                localStorage.setItem(KEY, JSON.stringify(entries.slice(-500)));
            } catch {
                /* storage blocked: the log is kept until the page closes */
            }
        }
    }, 2000);
}

/** Add an entry (ignored while recording is off). Long texts are cut. */
export function logEvent(kind: string, msg: string, data?: unknown): void {
    if (!enabled) return;
    entries.push({ t: Date.now(), kind, msg: msg.length > 500 ? msg.slice(0, 500) + '…' : msg, ...(data !== undefined ? { data } : {}) });
    if (entries.length > MAX) entries = entries.slice(-MAX);
    logCount.set(entries.length);
    persistSoon();
}

export function logEntries(): readonly LogEntry[] {
    return entries;
}

export function clearLog(): void {
    entries = [];
    logCount.set(0);
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* nothing to clear */
    }
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 19) + 'Z';

/**
 * The log file: a header (version, browser, the settings and route as they are now) and the
 * entries, oldest first. With `hidePositions`, latitudes / longitudes are rounded to whole degrees
 * and names (route, ship, waypoints) are left out.
 */
export function buildLogFile(header: Record<string, unknown>, opts: { hidePositions?: boolean } = {}): string {
    const hide = !!opts.hidePositions;
    const replacer = (k: string, v: unknown) => {
        if (!hide) return v;
        if ((k === 'lat' || k === 'lon') && typeof v === 'number') return Math.round(v);
        if ((k === 'name' || k === 'routeName') && typeof v === 'string' && v) return '(hidden)';
        return v;
    };
    const file = {
        about: "Ship Master's Voyage Planner activity log. Times in UTC. Planning aid only.",
        savedAt: iso(Date.now()),
        positionsHidden: hide,
        ...header,
        entries: entries.map(e => ({ time: iso(e.t), kind: e.kind, msg: e.msg, ...(e.data !== undefined ? { data: e.data } : {}) })),
    };
    return JSON.stringify(file, replacer, 1);
}

/** File name with the UTC date and time, e.g. passage-plan-log-20261027-1405Z.json */
export function logFileName(t = Date.now()): string {
    return `passage-plan-log-${iso(t).slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}Z.json`;
}
