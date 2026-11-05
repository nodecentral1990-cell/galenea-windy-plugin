// Safe speed plan job (owner, 2026-10-30): runs lib/speedPlan.ts on the planned track with the
// forecast already fetched for the route (Weather tab), the user's limits and the RPM table, and
// puts the result into the route when the user takes it.

import { get, writable } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { checkWaveSystem } from '../lib/circ1228';
import { isLand } from '../lib/landMask';
import { motionAt } from '../lib/motionEstimate';
import type { PlanCalc } from '../lib/model';
import { driftOf, lossInputs, weatherLossKn } from '../lib/speed';
import { estimateLeeway } from '../lib/shipTypes';
import { applySpeedPlan, farFromLand, speedOptions, speedPlan, trackOf, type Hazard, type SpeedPlanResult } from '../lib/speedPlan';
import { checkLimits, forecastInfo, rollPeriodFor, waveSystems, weatherAt } from '../lib/weather';
import { addToCompare, plan, planKey, route, sim, thresholds, updateRoute, vessel, workEnd, workProgress, workStart, wxPlanKey, wxSeries } from '../state';

export type AvoidKind = 'waves' | 'swell' | 'wind' | 'imo' | 'cold' | 'motion';
export const AVOID_LABEL: Record<AvoidKind, string> = {
    waves: 'Waves: SWH and sea',
    swell: 'Swell 1 and swell 2',
    wind: 'Wind',
    imo: 'IMO warnings (parametric / synchronous rolling, high waves, broaching)',
    cold: 'Cold and ice (air, sea temperature, spray icing)',
    motion: 'Roll / pitch above your marks (estimate)',
};
const HITS: Record<AvoidKind, string[]> = { waves: ['SWH', 'Sea'], swell: ['Swell 1', 'Swell 2'], wind: ['Wind'], cold: ['Air temp', 'Sea temp', 'Icing'], imo: [], motion: [] };

export interface SpSettings {
    avoid: Record<AvoidKind, boolean>;
    /** 2 = red limits only, 1 = also amber alerts */
    level: 1 | 2;
    allowStop: boolean;
    /** Stop and drift only this far from land, nm */
    minLandNm: number;
    /** Fuel when stopped, t/day (null = not counted) */
    stopFuel: number | null;
    /** Hours between speed changes */
    stepH: number;
}
const KEY = 'windy-plugin-passage-plan:speedplan';
const DEFAULTS: SpSettings = {
    avoid: { waves: true, swell: true, wind: true, imo: false, cold: false, motion: false },
    level: 2,
    allowStop: true,
    minLandNm: 30,
    stopFuel: null,
    stepH: 3,
};
function load(): SpSettings {
    try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return { ...DEFAULTS, ...s, avoid: { ...DEFAULTS.avoid, ...(s.avoid ?? {}) } };
    } catch {
        return { ...DEFAULTS, avoid: { ...DEFAULTS.avoid } };
    }
}
export const spSettings = writable<SpSettings>(load());
spSettings.subscribe(s => {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
        /* not remembered */
    }
});

export interface StopDrift {
    kn: number;
    toward: number;
}
export interface SpOutcome {
    res: SpeedPlanResult;
    /** Drift estimate at the start of each stop segment (index in res.segments) */
    drift: Record<number, StopDrift | null>;
    arriveBy: number | null;
    startMs: number;
    fromFix: boolean;
    barredLeftOut: number;
    avoided: AvoidKind[];
    level: 1 | 2;
    runInfo: ReturnType<typeof forecastInfo>;
    key: string;
    taken: boolean;
}
export const spOutcome = writable<SpOutcome | null>(null);
export const spStatus = writable('');

export const spRouteKey = (): string => JSON.stringify([get(planKey), get(route).etd, get(route).voyage?.fix ?? null, get(route).waypoints.map(w => [w.speed, w.delayH ?? 0])]);

const legAt = (p: PlanCalc, s: number) => Math.max(0, p.legs.findIndex(l => l.cumNm >= s - 1e-9));

export async function runSpeedPlan(arriveMode: 'planned' | 'earliest' | 'own', ownEta: number | null): Promise<void> {
    const r = get(route);
    const p = get(plan);
    const v = get(vessel);
    const th = get(thresholds);
    const s = get(spSettings);
    const sm = get(sim);
    if (r.waypoints.length < 2 || p.etd == null || p.eta == null) {
        spStatus.set('Make the route and set the ETD first (Route tab).');
        return;
    }
    const series = get(wxSeries);
    if (!series.length || get(wxPlanKey) !== get(planKey)) {
        spStatus.set('Get the forecast for this route first (Weather tab → Get forecast).');
        return;
    }
    const avoided = (Object.keys(s.avoid) as AvoidKind[]).filter(k => s.avoid[k]);
    if (!avoided.length) {
        spStatus.set('Choose what to avoid first (⚙ Settings → Safe speed plan).');
        return;
    }
    const signal = { cancelled: false };
    workStart('Working out a safe speed plan', ['Trying speeds and stops'], signal);
    workProgress('Trying speeds and stops', 0, 1);
    await new Promise(res => setTimeout(res, 50));
    try {
        const track = trackOf(p);
        const fromFix = !!p.fix;
        const startNm = p.fix ? p.fix.alongNm : 0;
        const startMs = p.fix ? p.fix.t : p.etd + (p.delayAtStartH ?? 0) * 3600_000;
        const planned = (sNm: number) => sm.legs.find(l => l.legIdx === legAt(p, sNm))?.sicw ?? p.legs[legAt(p, sNm)]?.calmSpeed ?? r.defaultSpeed;
        const { options, barredLeftOut } = speedOptions(v, planned(startNm));
        const li = (r.lossMethod ?? 'manual') === 'kwon' ? lossInputs(v) : null;
        const roll = rollPeriodFor(v).value;
        const want = new Set(avoided.flatMap(k => HITS[k]));
        const hazards = (wx: Parameters<typeof checkLimits>[0], heading: number, stw: number): Hazard[] => {
            const out: Hazard[] = checkLimits(wx, heading, th)
                .filter(h => want.has(h.what))
                .map(h => ({ what: h.what, level: h.level, detail: h.detail }));
            if (s.avoid.imo) {
                const ship = { headingDeg: heading, speedKn: stw, lbp: v.lbp, rollPeriod: roll };
                for (const ws of waveSystems(wx)) {
                    const hit = checkWaveSystem(ws, ship, th.resonance)[0];
                    if (hit) out.push({ what: 'IMO', level: 2, detail: `IMO warning: ${hit.detail}` });
                }
            }
            if (s.avoid.motion && (v.rollLimitDeg || v.pitchLimitDeg)) {
                const m = motionAt(wx, heading, stw, v);
                if (m && v.rollLimitDeg && m.roll >= v.rollLimitDeg) out.push({ what: 'Roll', level: 2, detail: `roll about ${m.roll.toFixed(0)}° (your mark ${v.rollLimitDeg}°)` });
                if (m && v.pitchLimitDeg && m.pitch >= v.pitchLimitDeg) out.push({ what: 'Pitch', level: 2, detail: `pitch about ${m.pitch.toFixed(1)}° (your mark ${v.pitchLimitDeg}°)` });
            }
            return out;
        };
        const arriveBy = arriveMode === 'earliest' ? null : arriveMode === 'own' && ownEta != null ? ownEta : p.eta;
        const res = speedPlan({
            track,
            startNm,
            startMs,
            arriveBy,
            plannedSicwAt: planned,
            options,
            allowStop: s.allowStop,
            canStopAt: (lat, lon) => farFromLand(lat, lon, s.minLandNm, isLand),
            stopFuelPerDay: s.stopFuel,
            wxAt: (lat, lon, t) => weatherAt(series, { lat, lon }, t),
            lossKn: (wx, course, sicw, sNm) => {
                if (!li) return p.legs[legAt(p, sNm)]?.allowance ?? 0;
                const a = weatherLossKn(wx, course, sicw, li);
                return (a + weatherLossKn(wx, course, Math.max(1, sicw - a), li)) / 2;
            },
            hazards,
            avoidLevel: s.level,
            stepH: s.stepH,
        });
        if (barredLeftOut) res.notes.unshift(`Barred RPM ranges left out (⚙ Settings → Speed, RPM and fuel).`);
        if (r.useCurrents) res.notes.push('Ocean currents are not included in the speed plan (the route figures after you take it do include them).');
        if (r.waypoints.some((w, i) => i > 0 && (w.delayH ?? 0) > 0)) res.notes.push('Planned stops at waypoints are not included in the comparison; taking the plan replaces them with its own stops.');
        // drift estimate where the plan stops
        const leeway = v.leewayPct ?? estimateLeeway(v).pct;
        const drift: Record<number, StopDrift | null> = {};
        res.segments.forEach((seg, i) => {
            if (seg.action !== 'stop') return;
            const wx = weatherAt(series, seg.from, seg.fromMs);
            drift[i] = driftOf(wx, null, leeway, v.driftAngleDeg ?? 0);
        });
        spOutcome.set({ res, drift, arriveBy, startMs, fromFix, barredLeftOut, avoided, level: s.level, runInfo: forecastInfo(series), key: spRouteKey(), taken: false });
        const stops = res.segments.filter(x => x.action === 'stop').length;
        spStatus.set(
            res.ok
                ? `${res.mode === 'hard' ? 'Done: a plan that keeps out of the chosen weather' : 'Done, but the chosen weather cannot be fully avoided'} (${res.segments.length} speed changes${stops ? `, ${stops} stop${stops > 1 ? 's' : ''}` : ''}; ${(res.stats.ms / 1000).toFixed(1)} s).`
                : `No plan found. ${res.notes.join(' ')}`,
        );
        logEvent('speedplan', `Safe speed plan: ${res.ok ? res.mode : 'none'}, ${res.segments.length} segments, ${res.stats.ms} ms`, { settings: s, arriveBy, notes: res.notes });
    } catch (err) {
        spStatus.set(`Could not work out the speed plan: ${(err as Error).message}`);
        logEvent('error', `Speed plan failed: ${(err as Error).message}`, { stack: String((err as Error).stack ?? '').slice(0, 800) });
    } finally {
        workEnd();
    }
}

/** Take the plan into the route; a copy of the route as it was goes to the Compare tab first. */
export function takeSpeedPlan(): void {
    const o = get(spOutcome);
    if (!o || o.key !== spRouteKey() || !o.res.ok) return;
    const r = get(route);
    const p = get(plan);
    addToCompare({ ...r, name: `${r.name} (before safe speed plan)`, voyage: null });
    const startNm = p.fix ? p.fix.alongNm : 0;
    updateRoute(x => {
        x.waypoints = applySpeedPlan(r, p, o.res.segments, startNm);
        x.mode = 'speed';
    });
    spOutcome.set({ ...o, taken: true, key: spRouteKey() });
    spStatus.set('Speed plan taken into the route. The route as it was is kept in the Compare tab.');
    logEvent('speedplan', `Took the safe speed plan (${o.res.segments.length} segments)`);
}
