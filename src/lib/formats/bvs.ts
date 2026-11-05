// BVS voyage files (<Voyage dir="AROS"><TrackInfo ...><Position .../>...).
// I believe these come from StormGeo's BVS (Bon Voyage System) onboard weather routing; there is
// no public specification. The layout below is read from the owner's own files (TrackInfo
// version 8.5.1, release 2), checked 2026-10-25. Readings that are ASSUMPTIONS:
//  - Navigation="RL"/"GC" is the sailing method of the leg LEAVING that position (the ocean leg
//    in a file named "...GC" is marked GC at its start point).
//  - TimeFix="1" = time fixed by the user; Date = planned time at the position (UTC).
//  - ControlType="SC" = speed control: ControlValue is the speed (kn) from that position on.
//  - A second position at the same place with a later time = a stop (berth or waiting).
// Export has NOT been tested in BVS itself.

import { legGeometry, wrapLon } from '../geo';
import { newRoute, newWaypoint, type PlanCalc, type Route, type Vessel } from '../model';
import type { Thresholds } from '../weather';

const HOUR = 3600e3;

/** All attributes of one XML start tag, in order. */
function attrs(tag: string): [string, string][] {
    const out: [string, string][] = [];
    const re = /([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tag))) out.push([m[1], unesc(m[2])]);
    return out;
}
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v: string | undefined): number | null => (v != null && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : null);

/** "2026-10-25T20:00:00-00:00" (or with Z / +hh:mm) to UTC ms */
function parseDate(v: string | undefined): number | null {
    if (!v) return null;
    const t = Date.parse(v.trim().replace(/-00:00$/, 'Z'));
    return isNaN(t) ? null : t;
}
const fmtDate = (ms: number) => new Date(Math.round(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, '-00:00');

export function isBvs(text: string): boolean {
    return /<Voyage[\s>]/.test(text) && /<TrackInfo[\s>]/.test(text);
}

export function parseBvs(text: string, fileName = 'route.bvs'): Route {
    if (!isBvs(text)) throw new Error('Not a BVS voyage file: no <Voyage> / <TrackInfo> found.');
    const voyageTag = text.match(/<Voyage\b[^>]*>/)?.[0] ?? '<Voyage dir="AROS">';
    const infoTag = text.match(/<TrackInfo\b[^>]*>/)?.[0] ?? '';
    const info = attrs(infoTag);
    const get = (k: string) => info.find(a => a[0] === k)?.[1];
    const route = newRoute(get('voyageId')?.trim() || fileName.replace(/\.[^.]+$/, ''));
    route.source = { format: 'BVS', fileName, raw: { voyage: attrs(voyageTag), trackInfo: info } };

    const tags = text.match(/<Position\b[^>]*>/g) ?? [];
    const pos = tags
        .map(tag => {
            const a = Object.fromEntries(attrs(tag));
            return { a, list: attrs(tag), lat: num(a.Lat), lon: num(a.Lon), t: parseDate(a.Date) };
        })
        .filter(p => p.lat != null && p.lon != null && Math.abs(p.lat) <= 90);
    if (!pos.length) throw new Error('The BVS file has no readable positions.');

    let speed: number | null = null;
    pos.forEach((p, i) => {
        const prevNav = i > 0 ? pos[i - 1].a.Navigation : p.a.Navigation;
        const wp = newWaypoint(p.lat as number, wrapLon(p.lon as number), prevNav === 'GC' ? 'GC' : 'RL', (p.a.Name || p.a.Position || '').trim());
        wp.raw = { bvs: p.list };
        if (i > 0 && speed != null) wp.speed = speed;
        // speed set at this position applies to the legs after it
        if (p.a.ControlType === 'SC' && num(p.a.ControlValue) != null) {
            speed = num(p.a.ControlValue);
            if (route.defaultSpeed === newRoute().defaultSpeed && i === 0) route.defaultSpeed = speed as number;
        }
        if (i > 0 && p.a.TimeFix === '1' && p.t != null) wp.fixedEta = p.t;
        route.waypoints.push(wp);
    });
    route.etd = pos[0].t;

    // Same place, later time = a stop at the earlier position
    for (let i = 1; i < pos.length; i++) {
        const a = pos[i - 1];
        const b = pos[i];
        if (a.t == null || b.t == null) continue;
        const d = legGeometry(route.waypoints[i - 1], route.waypoints[i], 'RL').distNm;
        if (d < 0.05 && b.t - a.t > 60e3) route.waypoints[i - 1].delayH = (b.t - a.t) / HOUR;
    }
    // A fixed time at the last position = plan by ETD + ETA
    const last = route.waypoints[route.waypoints.length - 1];
    if (last.fixedEta != null && route.waypoints.length > 1) {
        route.mode = 'eta';
        route.eta = last.fixedEta;
        last.fixedEta = null;
    }
    return route;
}

/** Ship particulars found in a BVS file, in the plugin's terms (only the values present). */
export function bvsShipInfo(route: Route): { vessel: Partial<Vessel>; resonance: Partial<Thresholds['resonance']> } | null {
    const info = route.source?.format === 'BVS' ? (route.source.raw?.trackInfo as [string, string][] | undefined) : undefined;
    if (!info) return null;
    const get = (k: string) => num(info.find(a => a[0] === k)?.[1]);
    const first = route.waypoints[0]?.raw?.bvs as [string, string][] | undefined;
    const fget = (k: string) => num(first?.find(a => a[0] === k)?.[1]);
    const v: Partial<Vessel> = {};
    const name = info.find(a => a[0] === 'shipName')?.[1]?.trim();
    if (name) v.name = name;
    if (get('length') != null) v.lbp = get('length');
    if (get('beam') != null) v.breadth = get('beam');
    if (get('GM') != null) v.gm = get('GM');
    if (get('rollperiod') != null) v.rollPeriod = get('rollperiod');
    const fwd = fget('ForeDraft') ?? get('draft');
    const aft = fget('AftDraft') ?? get('draft');
    if (fwd != null) v.draftFwd = fwd;
    if (aft != null) v.draftAft = aft;
    const r: Partial<Thresholds['resonance']> = {};
    if (get('mtParam') != null) r.parametric = get('mtParam');
    if (get('mtSync') != null) r.synchronous = get('mtSync');
    if (get('mtWave') != null) r.highWaves = get('mtWave');
    if (get('mtBroach') != null) r.broaching = get('mtBroach');
    return Object.keys(v).length || Object.keys(r).length ? { vessel: v, resonance: r } : null;
}

const TRACKINFO_KEYS = [
    'version', 'release', 'voyageId', 'trackCode', 'shipName', 'callSign', 'calmSeaSpeed', 'charterPartySpeed', 'rollperiod', 'GM',
    'draft', 'beam', 'length', 'rpm', 'slip', 'ncrSpeed', 'powerRatio', 'mdoFuelRate', 'ncrFuelRate', 'ncrPower', 'mtWave', 'mtParam',
    'mtSync', 'mtBroach', 'navFrom',
];

export interface BvsWriteContext {
    vessel?: Vessel;
    thresholds?: Thresholds;
}

/** Write a BVS voyage file. Needs an ETD (BVS files carry a time at every position). */
export function writeBvs(route: Route, plan: PlanCalc, ctx: BvsWriteContext = {}): string {
    if (plan.etd == null || !plan.legs.length) throw new Error('Set the ETD (and at least two waypoints) before saving a BVS file: it needs a time at every position.');
    const wps = route.waypoints;
    const v = ctx.vessel;
    const rs = ctx.thresholds?.resonance;
    const fromFile = route.source?.format === 'BVS';
    const raw = (fromFile ? (route.source?.raw?.trackInfo as [string, string][] | undefined) : undefined) ?? [];
    const info = new Map<string, string>(TRACKINFO_KEYS.map(k => [k, '']));
    info.set('version', '8.5.1');
    info.set('release', '2');
    info.set('navFrom', '1');
    for (const [k, val] of raw) info.set(k, val);
    const f2 = (n: number | null | undefined) => (n != null && isFinite(n) ? n.toFixed(2) : undefined);
    const set = (k: string, val: string | undefined) => val != null && val !== '' && info.set(k, val);
    set('voyageId', route.name);
    set('shipName', v?.name || undefined);
    set('rollperiod', f2(v?.rollPeriod));
    set('GM', f2(v?.gm));
    const meanDraft = v?.draftFwd != null && v?.draftAft != null ? (v.draftFwd + v.draftAft) / 2 : (v?.draftFwd ?? v?.draftAft);
    set('draft', f2(meanDraft));
    set('beam', f2(v?.breadth));
    set('length', f2(v?.lbp));
    if (!info.get('calmSeaSpeed')) set('calmSeaSpeed', f2(route.defaultSpeed));
    set('mtWave', f2(rs?.highWaves));
    set('mtParam', f2(rs?.parametric));
    set('mtSync', f2(rs?.synchronous));
    set('mtBroach', f2(rs?.broaching));
    const voyageAttrs = (fromFile ? (route.source?.raw?.voyage as [string, string][] | undefined) : undefined) ?? [['dir', 'AROS']];

    type Row = { id: string; type: string; t: number; lat: number; lon: number; nav: string; name: string; fix: boolean; speed: number | null; drafts?: [number, number] };
    const rows: Row[] = [];
    const rawOf = (i: number) => Object.fromEntries((wps[i].raw?.bvs as [string, string][] | undefined) ?? []);
    const navLeaving = (i: number) => (i < wps.length - 1 ? wps[i + 1].legType : (rawOf(i).Navigation ?? 'RL'));
    let lastSpeed: number | null = null;
    const speedOut = (i: number): number | null => {
        const leg = plan.legs[i]; // leg leaving waypoint i
        if (!leg) return null;
        const s = Math.round(leg.calmSpeed * 100) / 100;
        if (lastSpeed != null && Math.abs(s - lastSpeed) < 0.005) return null;
        lastSpeed = s;
        return s;
    };
    for (let i = 0; i < wps.length; i++) {
        const w = wps[i];
        const r = rawOf(i);
        const isFirst = i === 0;
        const isLast = i === wps.length - 1;
        const arrive = isFirst ? plan.etd : (plan.legs[i - 1].arriveMs as number);
        const delayH = isFirst ? plan.delayAtStartH : isLast ? 0 : plan.legs[i - 1].delayAfterH;
        const fixed = isFirst || (isLast && route.mode === 'eta' && route.eta != null) || w.fixedEta != null;
        const nextSame = !isLast && legGeometry(w, wps[i + 1], 'RL').distNm < 0.05;
        const type = isFirst ? 'BR' : isLast ? 'ER' : r.Type && r.Type !== 'BR' && r.Type !== 'ER' ? r.Type : 'WP';
        const drafts: [number, number] | undefined = isFirst && v?.draftFwd != null && v?.draftAft != null ? [v.draftFwd, v.draftAft] : undefined;
        if (delayH > 0 && !nextSame) {
            // A stop made in the plugin: BVS shows it as a second position at the same place
            rows.push({ id: r.id ?? '', type, t: arrive, lat: w.lat, lon: w.lon, nav: 'RL', name: w.name, fix: fixed, speed: null, drafts });
            rows.push({ id: '', type: 'WP', t: arrive + delayH * HOUR, lat: w.lat, lon: w.lon, nav: navLeaving(i), name: '', fix: false, speed: speedOut(i) });
        } else {
            rows.push({ id: r.id ?? '', type, t: arrive, lat: w.lat, lon: w.lon, nav: navLeaving(i), name: w.name, fix: fixed, speed: speedOut(i), drafts });
        }
    }
    const lines = rows.map(p => {
        let s = `\t\t<Position id="${esc(p.id)}" Type="${p.type}" Date="${fmtDate(p.t)}" Lat="${p.lat.toFixed(4)}" Lon="${wrapLon(p.lon).toFixed(4)}" Navigation="${p.nav}"`;
        if (p.name) s += ` Name="${esc(p.name)}"`;
        if (p.drafts) s += ` ForeDraft="${p.drafts[0].toFixed(2)}" AftDraft="${p.drafts[1].toFixed(2)}"`;
        if (p.fix) s += ` TimeFix="1"`;
        if (p.speed != null) s += ` ControlType="SC" ControlValue="${p.speed.toFixed(2)}"`;
        if (p.name) s += ` Position="${esc(p.name)}"`;
        return s + '/>';
    });
    const infoTxt = [...info].map(([k, val]) => `${k}="${esc(val)}"`).join(' ');
    return (
        `<?xml version="1.0" standalone="yes" ?>\r\n` +
        `<Voyage ${voyageAttrs.map(([k, val]) => `${k}="${esc(val)}"`).join(' ')}>\r\n` +
        `<TrackInfo ${infoTxt}>\r\n${lines.join('\r\n')}\r\n\t</TrackInfo>\r\n</Voyage>\r\n`
    );
}
