// Feeds the activity log and the usage statistics from the plugin's state while it is open:
// route / ship / limits changes (summarised, a few seconds after the last change), the map time,
// voyage events and errors. Weather jobs and the optimiser log their own steps.

import bcast from '@windy/broadcast';
import store from '@windy/store';
import { get, writable, type Readable } from 'svelte/store';

import config from './pluginConfig';
import { logEvent, logEntries } from './lib/activityLog';
import { addUsedTime, recordSailed, recordVoyageStart, startSession, usage } from './lib/usage';
import { forecastInfo } from './lib/weather';
import { lastSweepReport } from './windy/forecast';
import { mapProduct, plan, route, sim, thresholds, timelineTs, vessel, wxSeries, wxSweepValid } from './state';

const iso = (t: number | null | undefined) => (t == null ? null : new Date(t).toISOString().replace(':00.000Z', 'Z'));
const r1 = (n: number | null | undefined) => (n == null || !isFinite(n) ? null : Math.round(n * 10) / 10);

function debounced<T>(store: Readable<T>, ms: number, fn: (v: T) => void): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let first = true;
    const off = store.subscribe(v => {
        if (first) {
            first = false;
            return;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(v), ms);
    });
    return () => {
        if (timer) clearTimeout(timer);
        off();
    };
}

/** Route and timing as plain numbers (for the log) */
export function routeSummary() {
    const r = get(route);
    const p = get(plan);
    const s = get(sim);
    return {
        name: r.name,
        waypoints: r.waypoints.map(w => ({ lat: w.lat, lon: w.lon, leg: w.legType, ...(w.fixedEta != null ? { fixedEta: iso(w.fixedEta) } : {}) })),
        mode: r.mode,
        etd: iso(p.etd),
        eta: iso(p.eta),
        totalNm: r1(p.totalNm),
        legs: p.legs.map(l => ({ to: l.index + 1, type: l.type, nm: r1(l.distNm), crs: Math.round(l.course), stw: r1(l.stw), sog: r1(l.sog), arrive: iso(l.arriveMs) })),
        fuelT: r1(s.totalFuelT),
        notes: s.notes,
        problems: p.problems,
        voyage: r.voyage ? { startedAt: iso(r.voyage.startedAt), fix: r.voyage.fix ? { lat: r.voyage.fix.lat, lon: r.voyage.fix.lon, t: iso(r.voyage.fix.t) } : null } : null,
    };
}

/** Header of a saved log file: the plugin, browser and the settings / route as they are now */
export function logHeader(): Record<string, unknown> {
    const series = get(wxSeries);
    const u = get(usage);
    return {
        plugin: { title: config.title, version: config.version },
        browser: { userAgent: navigator.userAgent, screen: `${screen.width}×${screen.height}`, window: `${innerWidth}×${innerHeight}`, language: navigator.language },
        windyModelOnMap: get(mapProduct),
        mapTime: iso(get(timelineTs)),
        forecast: { points: series.length, runs: forecastInfo(series), mapLayerReadings: get(wxSweepValid).size, lastLayerReport: lastSweepReport },
        route: routeSummary(),
        ship: get(vessel),
        limits: get(thresholds),
        usage: { sessions: u.sessions, hoursUsed: r1(u.usedMs / 3600e3), routes: Object.keys(u.routes).length, plannedNm: Math.round(u.plannedNm), voyages: u.voyages, sailedNm: Math.round(u.sailedNm) },
        entriesInLog: logEntries().length,
    };
}

/** Another copy of the plugin still running in this page (e.g. after installing an update over it): its version */
export const otherCopy = writable<string | null>(null);
const INSTANCE = `${config.version}-${Math.random().toString(36).slice(2, 8)}`;
type Running = { __ppRunning?: { id: string; version: string; since: number } };

/** Where in the plugin an element is (for the log) */
function areaOf(el: Element): string | null {
    if (el.closest('.gp')) return 'graph window';
    if (el.closest('.sb')) return 'ship window';
    if (el.closest('.pp-menu')) return 'map menu';
    if (el.closest('.pp-overlay')) return 'full-size table';
    if (el.closest('.pp')) return 'panel';
    return null;
}
const short = (s: string | null | undefined, n = 60) => {
    const t = (s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
};
function sizes() {
    const panel = document.querySelector('section.plugin__content.pp');
    const r = panel?.getBoundingClientRect();
    return { window: `${innerWidth}×${innerHeight}`, panel: r ? `${Math.round(r.width)}×${Math.round(r.height)} at x ${Math.round(r.left)}` : 'not found' };
}

/**
 * "Record everything" (owner, 2026-10-30): every button / link pressed and every setting changed in the
 * plugin's own windows, Windy panes opening and closing, layer / model changes, the tab being hidden,
 * the window and panel size, and errors. Nothing typed in a text box is recorded beyond its new value.
 */
function startDetailedLog(): () => void {
    const onClick = (e: MouseEvent) => {
        const t = e.target as Element | null;
        const el = t?.closest?.('button, a, summary, [role="button"]');
        if (!el) return;
        const area = areaOf(el);
        if (!area) return;
        const what = short(el.textContent) || short(el.getAttribute('title')) || el.tagName.toLowerCase();
        logEvent('click', `${area}: ${what}`);
    };
    const onChange = (e: Event) => {
        const el = e.target as HTMLInputElement | HTMLSelectElement | null;
        if (!el || !('value' in el)) return;
        const area = areaOf(el);
        if (!area) return;
        const label = short(el.closest('label')?.textContent, 70) || short(el.getAttribute('title')) || short(el.getAttribute('placeholder')) || el.getAttribute('name') || el.tagName.toLowerCase();
        let value: string;
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) value = el.checked ? 'on' : 'off';
        else if (el instanceof HTMLInputElement && el.type === 'file') value = short([...(el.files ?? [])].map(f => f.name).join(', '));
        else if (el instanceof HTMLSelectElement) value = short(el.selectedOptions[0]?.textContent ?? el.value);
        else value = short(el.value, 40);
        logEvent('change', `${area}: ${label} → ${value}`);
    };
    const onVis = () => logEvent('visibility', document.hidden ? 'Windy tab hidden / minimised' : 'Windy tab visible again');
    let rTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
        if (rTimer) clearTimeout(rTimer);
        rTimer = setTimeout(() => logEvent('screen', 'Window resized', sizes()), 1500);
    };
    const onOpened = (id: unknown) => logEvent('windy', `Windy opened: ${String(id)}`);
    const onClosed = (id: unknown) => logEvent('windy', `Windy closed: ${String(id)}`);
    const onOverlay = (v: unknown) => logEvent('windy', `Windy layer: ${String(v)}`);
    const onProduct = (v: unknown) => logEvent('windy', `Windy model: ${String(v)}`);
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('visibilitychange', onVis);
    addEventListener('resize', onResize);
    bcast.on('pluginOpened', onOpened);
    bcast.on('pluginClosed', onClosed);
    store.on('overlay', onOverlay);
    store.on('product', onProduct);
    // the panel's size, now and when it changes (a squeezed panel shows a layout problem)
    let ro: ResizeObserver | null = null;
    const first = setTimeout(() => {
        const s = sizes();
        logEvent('screen', `Sizes: window ${s.window}, plugin panel ${s.panel}`, s);
        const panel = document.querySelector('section.plugin__content.pp');
        if (panel && typeof ResizeObserver !== 'undefined') {
            let last = panel.getBoundingClientRect().width;
            ro = new ResizeObserver(() => {
                const w = panel.getBoundingClientRect().width;
                if (Math.abs(w - last) < 40) return;
                last = w;
                const s2 = sizes();
                logEvent('screen', `Plugin panel size changed: ${s2.panel}${w < 350 ? ' (squeezed: Windy layout problem?)' : ''}`, s2);
            });
            ro.observe(panel);
        }
    }, 1500);
    return () => {
        clearTimeout(first);
        if (rTimer) clearTimeout(rTimer);
        ro?.disconnect();
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('change', onChange, true);
        document.removeEventListener('visibilitychange', onVis);
        removeEventListener('resize', onResize);
        bcast.off('pluginOpened', onOpened);
        bcast.off('pluginClosed', onClosed);
        store.off('overlay', onOverlay);
        store.off('product', onProduct);
    };
}

let stops: (() => void)[] = [];
let openedAt = 0;
let tick: ReturnType<typeof setInterval> | null = null;

export function startLogging(): void {
    stopLogging();
    openedAt = Date.now();
    startSession();
    logEvent('open', `Plugin opened (v${config.version})`, { window: `${innerWidth}×${innerHeight}`, userAgent: navigator.userAgent, url: location.pathname });
    // another copy still running in this page? (installing an update over the open plugin does that)
    const w = window as unknown as Running;
    if (w.__ppRunning && w.__ppRunning.id !== INSTANCE) {
        otherCopy.set(w.__ppRunning.version);
        logEvent('warning', `Another copy of the plugin (v${w.__ppRunning.version}, open since ${iso(w.__ppRunning.since)}) is still running in this page`);
    }
    w.__ppRunning = { id: INSTANCE, version: config.version, since: Date.now() };
    stops.push(() => {
        if (w.__ppRunning?.id === INSTANCE) delete w.__ppRunning;
    });
    stops.push(startDetailedLog());
    tick = setInterval(() => {
        addUsedTime(60_000);
        openedAt += 60_000;
    }, 60_000);

    stops.push(
        debounced(route, 4000, () => {
            const s = routeSummary();
            logEvent('route', `Route "${s.name}": ${s.waypoints.length} waypoints, ${s.totalNm ?? 0} nm, ETD ${s.etd ?? '—'}, ETA ${s.eta ?? '—'}`, s);
        }),
        debounced(vessel, 4000, v => logEvent('ship', 'Ship particulars changed', v)),
        debounced(thresholds, 4000, t => logEvent('limits', 'Weather limits changed', t)),
    );

    // Map time: at most one entry every 20 s
    let lastTs = 0;
    stops.push(
        timelineTs.subscribe(ts => {
            if (Date.now() - lastTs < 20_000) return;
            lastTs = Date.now();
            logEvent('time', `Map time ${iso(ts)}`);
        }),
    );

    // Voyage start and position updates (also counted in the usage statistics)
    let prev = get(route).voyage ?? null;
    let prevAlong = get(plan).fix?.alongNm ?? null;
    stops.push(
        route.subscribe(r => {
            const v = r.voyage ?? null;
            if (v && !prev) {
                recordVoyageStart();
                logEvent('voyage', `Voyage started on "${r.name}"`);
            } else if (!v && prev) {
                logEvent('voyage', 'Voyage ended');
            }
            prev = v;
        }),
        plan.subscribe(p => {
            const f = p.fix;
            if (f && f.alongNm !== prevAlong) {
                // first position of the voyage: everything sailed from WP1 so far
                recordSailed(prevAlong != null ? f.alongNm - prevAlong : f.alongNm, f);
                logEvent('voyage', `Present position ${f.lat.toFixed(3)}, ${f.lon.toFixed(3)} at ${iso(f.t)}: sailed ${f.alongNm.toFixed(1)} nm, ${f.offNm.toFixed(1)} nm off track`, { lat: f.lat, lon: f.lon });
            }
            prevAlong = f?.alongNm ?? null;
        }),
    );

    const onError = (e: ErrorEvent) => logEvent('error', e.message || 'Error', { file: e.filename, line: e.lineno, stack: String(e.error?.stack ?? '').slice(0, 800) });
    const onReject = (e: PromiseRejectionEvent) => logEvent('error', `Unhandled: ${String((e.reason as Error)?.message ?? e.reason)}`, { stack: String((e.reason as Error)?.stack ?? '').slice(0, 800) });
    addEventListener('error', onError);
    addEventListener('unhandledrejection', onReject);
    stops.push(() => {
        removeEventListener('error', onError);
        removeEventListener('unhandledrejection', onReject);
    });
}

export function stopLogging(): void {
    if (tick) {
        clearInterval(tick);
        tick = null;
        addUsedTime(Date.now() - openedAt);
        logEvent('close', 'Plugin closed');
    }
    stops.forEach(s => s());
    stops = [];
}
