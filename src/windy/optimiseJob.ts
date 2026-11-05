// Route optimisation job (owner, 2026-10-27): fetches the forecast over the search area around the
// stretch WP a → WP b, runs the least-fuel optimiser (lib/optimise.ts) with the user's weather
// limits, and prepares the GC / RL / composite versions to compare and take. Progress window while
// it runs. Weather: ECMWF + ECMWF-WAM point forecasts; currents are not included (not in Windy's
// point forecasts).

import { get, writable } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { checkWaveSystem } from '../lib/circ1228';
import { makeIsWater } from '../lib/landMask';
import { legGeometry } from '../lib/geo';
import { motionAt } from '../lib/motionEstimate';
import type { Vessel } from '../lib/model';
import { buildGrid, forecastPoints, optimise, type OptimiseEnv, type OptimiseOptions, type OptimiseResult } from '../lib/optimise';
import { applyVersion, buildVersions, stretchTimes, type RouteVersion, type VersionId } from '../lib/optimisePlan';
import { recordOptimisation, usage } from '../lib/usage';
import { forecastInfo, rollPeriodFor, waveSystems, weatherAt, type WxSeries } from '../lib/weather';
import { plan, route, thresholds, updateRoute, vessel, workEnd, workProgress, workStart, wxSeries } from '../state';
import { fetchSeries, runLimited } from './forecast';
import { showPreview } from './previewLayer';

export interface OptSettings {
    /** How far either side of the great circle the search goes */
    width: 'narrow' | 'normal' | 'wide';
    /** How fine the search grid is (more = slower, a little better) */
    detail: 'fast' | 'normal' | 'fine';
    /** Latest acceptable arrival after the ETA, hours */
    etaTolH: number;
    /** Red weather limits: never enter ('hard') or only avoid when worth it ('soft') */
    limits: 'hard' | 'soft';
    /** Treat the IMO roll / broaching warnings as something to avoid */
    avoidImo: boolean;
    /** Keep out of places where the roll estimate is above the roll mark (step 4, owner 2026-11-01) */
    avoidRoll: boolean;
}

const KEY = 'windy-plugin-passage-plan:optimise';
const DEFAULTS: OptSettings = { width: 'normal', detail: 'normal', etaTolH: 1, limits: 'hard', avoidImo: true, avoidRoll: true };
const ROLL_COST_T_PER_H = 20;
/** Place-and-time cell for the roll check: 1° squares, 3-hour slots */
const rollCell = (lat: number, lon: number, t: number) => `${Math.round(lat)}|${Math.round(((lon + 540) % 360) - 180)}|${Math.floor(t / (3 * 3600e3))}`;
function load(): OptSettings {
    try {
        return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
        return { ...DEFAULTS };
    }
}
export const optSettings = writable<OptSettings>(load());
optSettings.subscribe(s => {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
        /* not remembered */
    }
});

export interface OptOutcome {
    a: number;
    b: number;
    etd: number;
    eta: number;
    res: OptimiseResult;
    versions: RouteVersion[];
    runInfo: ReturnType<typeof forecastInfo>;
    points: number;
    taken: VersionId | null;
    /** Route fingerprint the result belongs to (stale when the route changes) */
    key: string;
}
export const optOutcome = writable<OptOutcome | null>(null);
export const optStatus = writable('');
export const optBusy = writable(false);

const WIDTH = { narrow: 0.08, normal: 0.15, wide: 0.25 };
const DETAIL = { fast: { per: 220, half: 4 }, normal: { per: 150, half: 5 }, fine: { per: 100, half: 6 } };
const IMO_COST_T_PER_H = 20;

export const routeKey = (): string => JSON.stringify(get(route).waypoints.map(w => [w.lat.toFixed(4), w.lon.toFixed(4), w.legType]));

let signal = { cancelled: false };

export async function runOptimise(a: number, b: number, etaOverride: number | null): Promise<void> {
    if (get(optBusy)) return;
    const r = get(route);
    const p = get(plan);
    const v = get(vessel);
    const th = get(thresholds);
    const s = get(optSettings);
    const times = stretchTimes(p, a, b);
    const etd = times.etd;
    const eta = etaOverride ?? times.eta;
    if (b <= a || etd == null || eta == null) {
        optStatus.set('Set the ETD first (Route tab) and pick two waypoints, the first before the second.');
        return;
    }
    optBusy.set(true);
    signal = { cancelled: false };
    const steps = ['Forecast over the search area', 'Working out the routes'];
    workStart('Optimising the route', steps, signal);
    const t0 = Date.now();
    try {
        const start = { lat: r.waypoints[a].lat, lon: r.waypoints[a].lon };
        const end = { lat: r.waypoints[b].lat, lon: r.waypoints[b].lon };
        const isWater = makeIsWater([start, end]);
        const probe = buildGrid(start, end, {});
        const dist = probe.baseDistNm;
        const d = DETAIL[s.detail];
        const opts: OptimiseOptions = {
            eta,
            etaToleranceH: s.etaTolH,
            plannedSpeed: r.defaultSpeed,
            stages: Math.max(6, Math.min(40, Math.round(dist / d.per))),
            halfWidth: d.half,
            maxOffsetNm: Math.max(60, Math.min(900, dist * WIDTH[s.width])),
            limits: s.limits,
        };
        const grid = buildGrid(start, end, opts, isWater);
        const pts = forecastPoints(grid, 1);
        workProgress(steps[0], 0, pts.length);
        optStatus.set(`Fetching the forecast at ${pts.length} points…`);
        const got = await runLimited(
            pts.map(q => () => fetchSeries(q.lat, q.lon, 3, { start: etd, end: eta + 2 * 86400e3 })),
            6,
            n => workProgress(steps[0], n, pts.length),
            signal,
        );
        if (signal.cancelled) {
            optStatus.set('Stopped.');
            return;
        }
        const series: WxSeries[] = [...get(wxSeries), ...got.filter((x): x is WxSeries => !!x)];
        const roll = rollPeriodFor(v).value;
        // Roll above the mark (step 4): the roll estimate is too slow to work out at every step of the search,
        // so: search, check the roll along the route found, leave out the places (1° squares, 3-h slots) where it
        // is above the mark, and search again (up to 3 passes)
        const rollMark = s.avoidRoll && v.rollLimitDeg ? v.rollLimitDeg : null;
        const roughCells = new Set<string>();
        const env: OptimiseEnv = {
            wxAt: (lat, lon, t) => weatherAt(series, { lat, lon }, t),
            isWater,
            extraCost:
                s.avoidImo || rollMark
                    ? ctx => {
                          let cost = 0;
                          let what: string | undefined;
                          let forbidden = false;
                          if (s.avoidImo && ctx.wx) {
                              const ship = { headingDeg: ctx.course, speedKn: ctx.stw, lbp: v.lbp, rollPeriod: roll };
                              if (waveSystems(ctx.wx).some(ws => checkWaveSystem(ws, ship, th.resonance).length > 0)) {
                                  cost += ctx.hours * IMO_COST_T_PER_H;
                                  what = 'IMO';
                              }
                          }
                          if (rollMark && roughCells.has(rollCell(ctx.lat, ctx.lon, ctx.t))) {
                              if (s.limits === 'hard') forbidden = true;
                              else cost += ctx.hours * ROLL_COST_T_PER_H;
                              what = what ?? 'Roll';
                          }
                          return cost || forbidden ? { cost, forbidden, what } : null;
                      }
                    : undefined,
        };
        workProgress(steps[1], 0, 1);
        optStatus.set('Working out the routes (a few seconds; the screen may pause)…');
        await new Promise(res => setTimeout(res, 50)); // let the progress window paint
        let res = optimise(start, end, etd, v, th, env, opts);
        let rollPasses = 0;
        let rollAbove = 0;
        if (rollMark) {
            for (let pass = 0; pass < 3 && res.route; pass++) {
                const found = rollAboveMark(res, env, v, rollMark);
                rollAbove = found.length;
                const fresh = found.filter(k => !roughCells.has(k));
                if (!fresh.length) break;
                for (const k of fresh) roughCells.add(k);
                rollPasses++;
                optStatus.set(`Roll above your mark (${rollMark}°) on the way: searching again around it (pass ${pass + 2})…`);
                await new Promise(r2 => setTimeout(r2, 30));
                const again = optimise(start, end, etd, v, th, env, opts);
                if (!again.route) {
                    res.notes.push(`Keeping out of every place with roll above ${rollMark}° left no route within the ETA: the last route found is shown.`);
                    break;
                }
                res = again;
            }
            const left = res.route ? rollAboveMark(res, env, v, rollMark).length : 0;
            if (rollPasses) res.notes.push(left ? `Roll above your mark (${rollMark}°) remains in ${left} place${left > 1 ? 's' : ''} on the route after ${rollPasses + 1} searches.` : `Places with roll above your mark (${rollMark}°) were avoided (${rollPasses + 1} searches, ${roughCells.size} places left out).`);
            else if (rollAbove === 0) res.notes.push(`Roll estimate stays under your mark (${rollMark}°) on the route found.`);
        }
        const planned = r.waypoints.slice(a, b + 1).map(w => ({ lat: w.lat, lon: w.lon, legType: w.legType }));
        const versions = buildVersions(res, planned, etd, eta, v, th, env, opts);
        // roll / pitch estimate in the middle of each leg (shown for comparison; not used to steer the search)
        for (const ver of versions) {
            let roll = -1;
            let pitch = -1;
            for (const l of ver.ev.legs) {
                const mid = legGeometry(l.from, l.to, 'GC');
                const p = mid.pointAt(mid.distNm / 2);
                const m = motionAt(env.wxAt(p.lat, p.lon, (l.departMs + l.arriveMs) / 2), l.course, Math.max(0, l.sicw - l.avgLossKn), v);
                if (m) {
                    roll = Math.max(roll, m.roll);
                    pitch = Math.max(pitch, m.pitch);
                }
            }
            ver.motion = roll >= 0 ? { roll, pitch } : null;
        }
        workProgress(steps[1], 1, 1);
        const outcome: OptOutcome = { a, b, etd, eta, res, versions, runInfo: forecastInfo(series), points: pts.length, taken: null, key: routeKey() };
        optOutcome.set(outcome);
        showPreview(versions);
        const mine = versions.find(x => x.id === 'planned');
        const best = versions.find(x => x.id === 'optimised');
        recordOptimisation({
            fuelBeforeT: res.fuelUnit === 't' && mine ? mine.ev.fuel : null,
            fuelAfterT: res.fuelUnit === 't' && best ? best.ev.fuel : null,
            hoursBefore: mine?.ev.hours ?? null,
            hoursAfter: best?.ev.hours ?? null,
            nmBefore: mine?.ev.distNm ?? 0,
            nmAfter: best?.ev.distNm ?? 0,
            accepted: false,
        });
        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        optStatus.set(res.ok ? `Done in ${sec} s: ${versions.length - 1} optimised versions to compare below.` : `No route found that meets the ETA. ${res.notes.join(' ')}`);
        logEvent('optimise', `Optimised WP${a + 1}→WP${b + 1}: ${res.ok ? 'ok' : 'no route'} in ${sec} s, ${pts.length} forecast points, ${res.stats.legEvals} leg checks`, {
            settings: s,
            opts,
            notes: res.notes,
            versions: versions.map(x => ({ id: x.id, nm: Math.round(x.ev.distNm), hours: Math.round(x.ev.hours * 10) / 10, fuel: Math.round(x.ev.fuel * 10) / 10, breachH: Math.round(x.ev.breachH * 10) / 10, waypoints: x.wps.length })),
        });
    } catch (err) {
        optStatus.set(`Could not optimise: ${(err as Error).message}`);
        logEvent('error', `Optimise failed: ${(err as Error).message}`, { stack: String((err as Error).stack ?? '').slice(0, 800) });
    } finally {
        optBusy.set(false);
        workEnd();
    }
}

/** Places (1° squares, 3-h slots) on the optimised route where the roll estimate is above the mark */
function rollAboveMark(res: OptimiseResult, env: OptimiseEnv, v: Vessel, mark: number): string[] {
    const out = new Set<string>();
    for (const l of res.route?.legs ?? []) {
        const g = legGeometry(l.from, l.to, 'GC');
        const n = Math.max(2, Math.ceil(l.hours / 2));
        for (let i = 0; i < n; i++) {
            const f = (i + 0.5) / n;
            const p = g.pointAt(g.distNm * f);
            const t = l.departMs + (l.arriveMs - l.departMs) * f;
            const m = motionAt(env.wxAt(p.lat, p.lon, t), p.course, Math.max(0, l.sicw - l.avgLossKn), v);
            if (m && m.roll >= mark) out.add(rollCell(p.lat, p.lon, t));
        }
    }
    return [...out];
}

/** Put a version into the route (WP a and WP b kept) and count it as taken in the usage statistics. */
export function takeVersion(id: VersionId): void {
    const o = get(optOutcome);
    if (!o || o.key !== routeKey()) return;
    const v = o.versions.find(x => x.id === id);
    const mine = o.versions.find(x => x.id === 'planned');
    if (!v || id === 'planned') return;
    updateRoute(r => (r.waypoints = applyVersion(r, o.a, o.b, v)));
    usage.update(u => {
        const last = u.optimisations[u.optimisations.length - 1];
        if (last) {
            last.accepted = true;
            last.fuelAfterT = o.res.fuelUnit === 't' ? v.ev.fuel : null;
            last.fuelBeforeT = o.res.fuelUnit === 't' && mine ? mine.ev.fuel : null;
            last.hoursAfter = v.ev.hours;
            last.nmAfter = v.ev.distNm;
        }
        return u;
    });
    logEvent('optimise', `Took "${v.label}": ${Math.round(v.ev.distNm)} nm, ${v.wps.length} waypoints`);
    optOutcome.set({ ...o, taken: id, key: routeKey() });
    showPreview([]);
}

export const stopOptimise = () => (signal.cancelled = true);
