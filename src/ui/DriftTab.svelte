<!-- Drift (owner, 2026-11-26): where a stopped ship will drift, from the forecast and the ship's particulars. Start position
     and time → Start drift → tracks on the map for either side to the weather, a mark every 1 or 3 hours, the area the ship
     may be in, distance to land, nightfall, a drift polar, the master's fixes. Model and assumptions: lib/drift.ts and
     windy/notes/drift-mode.md. -->
<div class="g-card" data-g="drift-card">
    <div class="g-card__head">
        <span class="g-card__title">Drift</span>
        <Hint title="Drift"
            ><p>Where the ship will drift while stopped: the forecast wind and current at the drift position, and your ship's windage and draft.</p>
            <p>
                A stopped ship lies with the wind about {p ? Math.round(p.theta) : 75}° on the bow, with either side to the weather. Its wind drift is a little off downwind, to one side or the
                other, so the two tracks part: <b style="color:{SIDE_COLOR.stbd}">green</b> = starboard side to the weather, <b style="color:{SIDE_COLOR.port}">red</b> = port side. The yellow area
                is where the ship may be if the drift is {$driftSettings.spreadPct} % faster or slower and {$driftSettings.spreadDeg}° either way.
            </p>
            <p>Type the gyro heading when you can see it: the app then knows the side and the angle. Update the position while drifting: the prediction then runs from the real position, and the plugin learns from every update how your ship really drifts (Settings → Drift).</p>
            <p>Not included: wave drift (adds roughly 0.3–1 % of the wind speed in a developed sea, more in heavy swell), shallow water, wind shadow under land.</p></Hint
        >
        <Gear host="drift" chips={[{ id: 'drift' }, { id: 'ship', part: 'particulars', label: 'Ship particulars' }]} />
    </div>
    <p class="g-status g-status--warn">An estimate from the forecast, not a prediction you can rely on: keep the watch, radar and ECDIS. Times UTC.</p>

    {#if !$driftSession.on}
        <div class="dr-grid">
            <div class="dr-col">Lat <PositionInput kind="lat" value={lat} on:change={e => (lat = e.detail)} /></div>
            <div class="dr-col">Lon <PositionInput kind="lon" value={lon} on:change={e => (lon = e.detail)} /></div>
            <div class="dr-col">Stopped at (UTC) <DateTimeField value={t0} clearable={false} on:change={e => (t0 = e.detail ?? Date.now())} /></div>
            <label class="dr-col">Heading seen (°T, optional) <input type="number" min="0" max="360" step="1" bind:value={hdg} placeholder="gyro" /></label>
        </div>
        <div class="g-card__actions dr-row">
            <button class="g-btn g-btn--s" on:click={fromShip} disabled={!$shipNow} title="The ship's position on the plan at the map time"><Icon name="ship" size={14} /> Ship on the plan</button>
            <button class="g-btn g-btn--s" on:click={fromGps} title="This phone's / computer's position"><Icon name="crosshair" size={14} /> My position (GPS)</button>
            <button class="g-btn g-btn--s" on:click={fromMap} title="The middle of the map"><Icon name="map" size={14} /> Map centre</button>
        </div>
        {#if msg}<p class="g-status">{msg}</p>{/if}
        <button class="g-btn g-btn--primary dr-start" data-g="drift-start" disabled={lat == null || lon == null} on:click={start}><Icon name="play" size={15} /> Start drift</button>
    {:else}
        {@const ses = $driftSession}
        <p class="dr-line">
            Drifting since <b>{fmtTime(ses.start?.t ?? null)}</b> from {ses.start ? fmtPos(ses.start.lat, ses.start.lon) : ''}{ses.fixes.length ? ` · ${ses.fixes.length} position update${ses.fixes.length > 1 ? 's' : ''}` : ''}.
        </p>
        {#if $driftBusy}<p class="g-status">{$driftStatus || 'Getting the forecast…'}</p>{:else if $driftStatus}<p class="g-status g-status--warn">{$driftStatus}</p>{/if}
        <div class="dr-fix" data-g="drift-update">
            <b>Update position while drifting</b>
            <p class="pp-note">Each update moves the prediction to where the ship really is, and teaches it how your ship drifts.</p>
            <button class="g-btn g-btn--primary dr-start" on:click={updateNowGps} data-g="drift-update-gps"><Icon name="crosshair" size={15} /> Update position now (GPS)</button>
            <details class="dr-type" bind:open={typeOpen}>
                <summary>…or type the position (from the ECDIS / GPS)</summary>
                <div class="dr-grid">
                    <div class="dr-col">Lat <PositionInput kind="lat" value={fLat} on:change={e => (fLat = e.detail)} /></div>
                    <div class="dr-col">Lon <PositionInput kind="lon" value={fLon} on:change={e => (fLon = e.detail)} /></div>
                    <div class="dr-col">Time (UTC) <DateTimeField value={fT} clearable={false} on:change={e => (fT = e.detail ?? Date.now())} /></div>
                    <label class="dr-col">Heading seen (°T, optional) <input type="number" min="0" max="360" step="1" bind:value={fHdg} placeholder="gyro" /></label>
                </div>
                <button class="g-btn g-btn--s g-btn--primary" disabled={fLat == null || fLon == null} on:click={fix} data-g="drift-fix">Update position</button>
            </details>
            {#if $driftSession.fixes.length}<button class="g-btn g-btn--s" on:click={removeLastFix}>Remove the last update</button>{/if}
            {#if msg}<p class="g-status">{msg}</p>{/if}
            {#if r && r.tracks[0]?.intervals.length}
                {@const tr0 = r.tracks.find(t => t.side === r.sideSeen) ?? r.tracks[0]}
                <div class="dr-past" data-g="drift-past">
                    <b>How the ship drifted</b>
                    {#each tr0.intervals as iv}
                        <span>{hhmm(iv.from.t)} → {hhmm(iv.to.t)}: drifted <b>{iv.seenKn.toFixed(1)} kn toward {deg(iv.seenToward)}</b> · estimate was {iv.modelKn.toFixed(1)} kn toward {deg(iv.modelToward)}</span>
                    {/each}
                    {#each r.tracks as tr}
                        <span style="color:{SIDE_COLOR[tr.side]}">
                            {r.tracks.length > 1 ? (tr.side === 'stbd' ? 'Starboard side: ' : 'Port side: ') : ''}{tr.cal ? `learned: wind drift ${Math.abs(Math.round((tr.cal.factor - 1) * 100))} % ${tr.cal.factor >= 1 ? 'faster' : 'slower'}, ${Math.abs(Math.round(tr.cal.turn))}° ${tr.cal.turn >= 0 ? 'to the right' : 'to the left'} of the estimate; used for the prediction ahead` : $driftSettings.learn ? 'not enough drift between the updates yet to learn from' : 'learning is off (Settings → Drift)'}.
                        </span>
                    {/each}
                </div>
            {/if}
        </div>
        {#if r}
            {#each r.tracks as tr}
                {@const nowPt = pointAt(tr.pts, r.now)}
                {@const end = tr.pts[tr.pts.length - 1]}
                <div class="dr-side" style="border-color:{SIDE_COLOR[tr.side]}" data-g="drift-{tr.side}">
                    <b style="color:{SIDE_COLOR[tr.side]}">{r.tracks.length > 1 ? `If ${SIDE_NAME[tr.side]}` : `${SIDE_NAME[tr.side][0].toUpperCase()}${SIDE_NAME[tr.side].slice(1)}${r.sideSeen ? ' (from the heading seen)' : ''}`}</b>
                    {#if nowPt}
                        <span>Now: <b>{nowPt.kn.toFixed(1)} kn toward {deg(nowPt.toward)}</b>, heading about {deg(nowPt.heading)}.</span>
                    {/if}
                    {#if end && end.t > r.now}
                        <span>In {fmtDuration((end.t - r.now) / 3600e3)}: {fmtPos(end.lat, end.lon)}, {nmFrom(nowPt ?? r.from, end)} from here.</span>
                    {/if}
                    {#if tr.danger}
                        <span class="dr-warn">Within {$driftSettings.dangerNm} nm of land at <b>{fmtTime(tr.danger.t)}</b> (in {fmtDuration((tr.danger.t - r.now) / 3600e3)}){night(tr.danger.t)}: reposition before then.</span>
                    {:else if tr.closest}
                        <span>Land never closer than {tr.closest.nm.toFixed(0)} nm in the next {$driftSettings.hours} h (coarse land map).</span>
                    {:else}
                        <span>No land within 40 nm in the next {$driftSettings.hours} h (coarse land map).</span>
                    {/if}
                    {#if tr.stopped === 'land'}<span class="dr-warn">The track reaches land.</span>{:else if tr.stopped === 'noweather'}<span class="dr-warn">The forecast ends at {fmtTime(end?.t ?? null)}.</span>{/if}
                </div>
            {/each}
            <p class="pp-note">
                Sunset {r.nextSunset ? fmtTime(r.nextSunset) : '—'}, sunrise {r.nextSunrise ? fmtTime(r.nextSunrise) : '—'}. Wind drift {r.params.leewayPct.toFixed(1)} % of the wind ({r.params.leewayHow}); lies with the wind
                {Math.round(r.params.theta)}° on the bow ({r.params.thetaHow}); drift {r.params.delta}° off downwind ({r.params.deltaHow}){r.cal ? `; corrected from your position updates (see above)` : ''}.
            </p>

            <div class="dr-polar">
                <div class="dr-polar__head">
                    <b>At {fmtTime($timelineTs)}</b>
                    {#if r.tracks.length > 1}
                        <div class="g-seg dr-sides">
                            {#each r.tracks as tr}<button class="g-seg__opt" class:is-on={polarSide === tr.side} on:click={() => (polarSide = tr.side)}>{tr.side === 'stbd' ? 'Stbd side' : 'Port side'}</button>{/each}
                        </div>
                    {/if}
                </div>
                <div class="dr-time">
                    <button class="g-btn g-btn--s" on:click={() => shift(-3)}>−3 h</button>
                    <button class="g-btn g-btn--s" on:click={() => shift(-1)}>−1 h</button>
                    <button class="g-btn g-btn--s" on:click={toNow}><Icon name="clock" size={14} /> Now</button>
                    <button class="g-btn g-btn--s" on:click={() => shift(1)}>+1 h</button>
                    <button class="g-btn g-btn--s" on:click={() => shift(3)}>+3 h</button>
                </div>
                {#if here}
                    <DriftPolar wx={here.wx} vel={here.vel} color={SIDE_COLOR[polarSide]} other={otherHeading} colors={$flagColors} />
                    <div class="dr-key" data-g="drift-key">
                        {#if here.wx?.windKn != null}<span>Wind <b>{Math.round(here.wx.windKn)} kn</b> from {deg(here.wx.windDir)}{here.wx.gustKn != null ? `, gusts ${Math.round(here.wx.gustKn)} kn` : ''}</span>{/if}
                        {#if here.wx?.full}
                            {#each wavesOf(here.wx.full).filter(w => w.h != null && w.h > 0.05) as w}
                                <span class="dr-k--wave"><i style="background:{waveFill(w.id)}"></i>{w.label} <b>{w.h?.toFixed(1)} m</b>{w.period != null && w.period >= 1 ? `, ${w.period.toFixed(0)} s` : ''}{w.dir != null ? ` from ${deg(w.dir)}` : ''}{w.estimated ? ' (worked out from SWH and the swells)' : ''}</span>
                            {/each}
                        {/if}
                        {#if here.wx?.cur && here.wx.cur.kn > 0.01}
                            <span class="dr-k--cur"><i></i>Current <b>{here.wx.cur.kn.toFixed(1)} kn</b> setting {deg(here.wx.cur.set)}</span>
                        {:else}
                            <span class="dr-k--cur"><i></i>Current: {here.wx?.cur ? 'none' : 'not in the forecast here: the drift is wind only'}</span>
                        {/if}
                        {#if here.vel}
                            <span class="dr-k--lee"><i></i>Wind drift <b>{here.vel.leewayKn.toFixed(1)} kn toward {deg(here.vel.leewayToward)}</b> (through the water)</span>
                            <span class="dr-k--drift"><i></i>Drift over the ground <b>{here.vel.kn.toFixed(1)} kn toward {deg(here.vel.toward)}</b> = wind drift + current</span>
                            <span>Heading about <b>{deg(here.vel.heading)}</b>{otherHeading != null ? `, or ${deg(otherHeading)} with the other side to the weather (faint)` : ''}</span>
                        {/if}
                        {#if here.motion.m}
                            <span>Roll about <b>{here.motion.m.roll.toFixed(0)}°</b> (likely largest in 3 h {here.motion.m.rollMax.toFixed(0)}°), pitch about <b>{here.motion.m.pitch.toFixed(1)}°</b> ({here.motion.m.pitchMax.toFixed(1)}°): estimate, lying stopped at this heading</span>
                        {:else}
                            <span>Roll and pitch: {here.motion.why}</span>
                        {/if}
                    </div>
                {:else}
                    <p class="pp-note">The map time is outside the drift (from {fmtTime(r.from.t)} to {fmtTime(r.until)}): press Now.</p>
                {/if}
            </div>

            <div class="dr-tablebox">
                <table class="dr-table">
                    <thead>
                        <tr><th>UTC</th>{#each r.tracks as tr}<th style="color:{SIDE_COLOR[tr.side]}">{tr.side === 'stbd' ? 'Stbd side' : 'Port side'}: position · drift · land · roll / pitch</th>{/each}<th>Wind</th><th>Current</th><th>SWH</th></tr>
                    </thead>
                    <tbody>
                        {#each rows as row}
                            <tr class:dr-night={row.night} class:dr-now={row.now}>
                                <td>{hhmm(row.t)}</td>
                                {#each row.sides as c}
                                    <td>{c ? `${fmtPos(c.lat, c.lon)} · ${c.kn.toFixed(1)} kn ${deg(c.toward)} · ${c.land == null ? '>40' : c.land.toFixed(0)} nm · ${c.roll}` : '—'}</td>
                                {/each}
                                <td>{row.wx?.windKn != null ? `${deg(row.wx.windDir)} ${Math.round(row.wx.windKn)}${row.wx.gustKn != null ? ` G${Math.round(row.wx.gustKn)}` : ''}` : '—'}</td>
                                <td>{row.wx?.cur ? `${row.wx.cur.kn.toFixed(1)} → ${deg(row.wx.cur.set)}` : '—'}</td>
                                <td>{row.wx?.hs != null ? row.wx.hs.toFixed(1) : '—'}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            <p class="pp-note">Every {$driftSettings.marksH} h; night rows shaded; land distance from a coarse land map (0.1°, about 6 nm squares): small islands and rocks are not in it.</p>
            <div class="g-prov"><Icon name="calendar" size={14} /> <span>{r.source || 'Forecast source not known'}</span></div>
        {:else if !$driftBusy}
            <p class="g-status g-status--warn">No forecast for the drift position yet{IS_APP ? ' (none kept on this phone for it)' : ''}: press Get latest forecast.</p>
        {/if}

        <div class="g-card__actions dr-row">
            <button class="g-btn g-btn--s" on:click={() => getDriftWeather(true)} disabled={$driftBusy}><Icon name="refresh" size={14} /> Get latest forecast</button>
            <button class="g-btn g-btn--s" on:click={showMap}><Icon name="map" size={14} /> Show on the map</button>
            <button class="g-btn g-btn--s" on:click={stop} data-g="drift-stop"><Icon name="stop" size={14} /> Stop drift</button>
        </div>
    {/if}
</div>

<script lang="ts">
    import { map } from '@windy/map';
    import store from '@windy/store';

    import Icon from './base/Icon.svelte';
    import Hint from './base/Hint.svelte';
    import Gear from './base/Gear.svelte';
    import PositionInput from './PositionInput.svelte';
    import DateTimeField from './DateTimeField.svelte';
    import DriftPolar from './DriftPolar.svelte';
    import { logEvent } from '../lib/activityLog';
    import { IS_APP } from '../lib/appMode';
    import { pointAt, type Side } from '../lib/drift';
    import { fmtDuration, fmtPos, fmtTime } from '../lib/format';
    import { rhumbInverse } from '../lib/geo';
    import { nearestLandNm } from '../lib/drift';
    import { sunTimes } from '../lib/astro';
    import { flagColors, timelineTs } from '../state';
    import { wavesOf } from '../lib/weather';
    import { shipNow } from '../windy/mapKeeperState';
    import { addFix, driftAt, driftMotion, driftBusy, driftResult, driftSession, driftSettings, driftStatus, driftWx, driftWxAt, getDriftWeather, removeLastFix, startDrift, stopDrift } from '../windy/driftJob';
    import { SIDE_COLOR, SIDE_NAME, fitDrift, fitWhenReady } from '../windy/driftLayer';

    let lat: number | null = null;
    let lon: number | null = null;
    let t0 = Date.now();
    let hdg: number | null = null;
    let fLat: number | null = null;
    let fLon: number | null = null;
    let fT = Date.now();
    let fHdg: number | null = null;
    let msg = '';
    let polarSide: Side = 'stbd';
    let typeOpen = false;

    $: r = $driftResult;
    $: p = r?.params ?? null;
    $: if (r && !r.tracks.some(t => t.side === polarSide)) polarSide = r.tracks[0]?.side ?? 'stbd';
    $: here = r ? driftAt(r, polarSide, $timelineTs) : null;
    $: otherHeading = r && r.tracks.length > 1 && here?.vel ? driftAt(r, polarSide === 'stbd' ? 'port' : 'stbd', $timelineTs)?.vel?.heading ?? null : null;
    $: rows = r ? tableRows(r, $driftSettings.marksH) : [];

    const waveFill = (id: string) => ({ swh: $flagColors.swh, sea: $flagColors.sea, sw1: $flagColors.swell, sw2: $flagColors.swell2 })[id] ?? '#888';
    const deg = (d: number | null | undefined) => (d == null ? '—' : `${String(Math.round(((d % 360) + 360) % 360)).padStart(3, '0')}°`);
    const hhmm = (t: number) => {
        const d = new Date(t);
        return `${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`;
    };
    const nmFrom = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
        const x = rhumbInverse(a, b);
        return `${x.distNm.toFixed(1)} nm ${deg(x.course)}`;
    };
    function isNight(t: number, la: number, lo: number): boolean {
        const s = sunTimes(t, la, lo);
        if (s.alwaysDown) return true;
        if (s.alwaysUp) return false;
        return s.rise != null && s.set != null ? (s.rise < s.set ? t < s.rise || t > s.set : t > s.set && t < s.rise) : false;
    }
    function night(t: number): string {
        return r && isNight(t, r.from.lat, r.from.lon) ? ', in the dark' : '';
    }
    function tableRows(res: NonNullable<typeof r>, stepH: number) {
        const step = stepH * 3600e3;
        const out: { t: number; now: boolean; night: boolean; sides: ({ lat: number; lon: number; kn: number; toward: number; land: number | null; roll: string } | null)[]; wx: ReturnType<typeof driftWxAt> }[] = [];
        const series = $driftWx;
        for (let t = Math.ceil(res.from.t / step) * step; t <= res.until; t += step) {
            const sides = res.tracks.map(tr => {
                const q = pointAt(tr.pts, t);
                if (!q) return null;
                const mo = driftMotion(driftWxAt(series, q, t), q.heading).m;
                return { lat: q.lat, lon: q.lon, kn: q.kn, toward: q.toward, land: nearestLandNm(q.lat, q.lon, 40), roll: mo ? `${mo.roll.toFixed(0)}° / ${mo.pitch.toFixed(1)}°` : '—' };
            });
            const first = sides.find(Boolean);
            out.push({ t, now: Math.abs(t - res.now) < step / 2, night: isNight(t, res.from.lat, res.from.lon), sides, wx: first ? driftWxAt(series, first, t) : null });
        }
        return out;
    }

    function fromShip() {
        const s = $shipNow;
        if (!s) return;
        lat = s.lat;
        lon = s.lon;
        t0 = $timelineTs;
        msg = 'The ship on the plan at the map time.';
    }
    function gps(done: (la: number, lo: number) => void) {
        msg = 'Asking for the position…';
        try {
            navigator.geolocation.getCurrentPosition(
                g => {
                    done(g.coords.latitude, g.coords.longitude);
                    msg = `GPS position (± ${Math.round(g.coords.accuracy)} m).`;
                },
                e => (msg = `No GPS position: ${e.message || 'not allowed'}.`),
                { enableHighAccuracy: true, timeout: 20000 },
            );
        } catch {
            msg = 'This device gives no position.';
        }
    }
    const fromGps = () =>
        gps((a, b) => {
            lat = a;
            lon = b;
            t0 = Date.now();
        });
    function fromMap() {
        try {
            const c = map.getCenter();
            lat = c.lat;
            lon = ((((c.lng + 180) % 360) + 360) % 360) - 180;
            msg = 'The middle of the map.';
        } catch {
            msg = 'The map is not ready.';
        }
    }
    function start() {
        if (lat == null || lon == null) return;
        startDrift({ lat, lon, t: t0, heading: hdg != null && isFinite(hdg) ? ((hdg % 360) + 360) % 360 : null });
        store.set('timestamp', Date.now());
        msg = '';
        fitWhenReady();
    }
    function updateNowGps() {
        msg = 'Asking for the position…';
        try {
            navigator.geolocation.getCurrentPosition(
                g => {
                    addFix({ lat: g.coords.latitude, lon: g.coords.longitude, t: Date.now(), heading: fHdg != null && isFinite(fHdg) ? ((fHdg % 360) + 360) % 360 : null });
                    msg = `Position updated from GPS (± ${Math.round(g.coords.accuracy)} m): the prediction runs from here.`;
                    fHdg = null;
                },
                e => {
                    msg = `No GPS position (${e.message || 'not allowed'}): type it below.`;
                    typeOpen = true;
                },
                { enableHighAccuracy: true, timeout: 20000 },
            );
        } catch {
            msg = 'This device gives no position: type it below.';
            typeOpen = true;
        }
    }
    function fix() {
        if (fLat == null || fLon == null) return;
        addFix({ lat: fLat, lon: fLon, t: fT, heading: fHdg != null && isFinite(fHdg) ? ((fHdg % 360) + 360) % 360 : null });
        fLat = fLon = fHdg = null;
        fT = Date.now();
        msg = 'Position updated: the prediction runs from here.';
    }
    function stop() {
        if (!confirm('Stop drift mode? The drift tracks go off the map.')) return;
        stopDrift();
    }
    function shift(h: number) {
        store.set('timestamp', $timelineTs + h * 3600e3);
        logEvent('click', `Drift: time ${h > 0 ? '+' : ''}${h} h`);
    }
    function toNow() {
        store.set('timestamp', Date.now());
    }
    function showMap() {
        fitDrift();
    }
</script>

<style>
    .dr-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(178px, 100%), 1fr));
        gap: 8px;
        margin: 8px 0;
    }
    .dr-col {
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 12px;
        color: #b9c4ce;
    }
    .dr-col input {
        min-height: 36px;
        font-size: 16px;
    }
    .dr-row {
        flex-wrap: wrap;
        gap: 6px;
        margin: 6px 0;
    }
    .dr-start {
        width: 100%;
        min-height: 42px;
        margin-top: 6px;
    }
    .dr-line {
        margin: 6px 0;
    }
    .dr-side {
        display: flex;
        flex-direction: column;
        gap: 3px;
        border-left: 4px solid;
        padding: 6px 10px;
        margin: 8px 0;
        background: rgba(255, 255, 255, 0.04);
        border-radius: 0 6px 6px 0;
    }
    .dr-warn {
        color: #ff8a80;
        font-weight: 600;
    }
    .dr-polar {
        margin: 10px 0;
        padding: 8px;
        border: 1px solid #2c3743;
        border-radius: 8px;
    }
    .dr-polar__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
    }
    .dr-time {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        margin: 6px 0;
    }
    .dr-key {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 13px;
        margin-top: 6px;
    }
    .dr-key i {
        display: inline-block;
        width: 10px;
        height: 10px;
        margin-right: 6px;
        border-radius: 2px;
        vertical-align: -1px;
    }
    .dr-k--cur i {
        background: #1f6fd1;
    }
    .dr-k--lee i {
        background: #2e9e5b;
    }
    .dr-k--drift i {
        background: #ffb020;
    }
    .dr-k--cur b {
        color: #6fb2ff;
    }
    .dr-k--drift b {
        color: #ffb020;
    }
    .dr-tablebox {
        overflow: auto;
        max-height: 60vh;
        border: 1px solid #2c3743;
        border-radius: 6px;
    }
    .dr-table {
        border-collapse: collapse;
        font-size: 12px;
        width: max-content;
        min-width: 100%;
    }
    .dr-table th,
    .dr-table td {
        padding: 3px 7px;
        border-right: 1px solid #2c3743;
        white-space: nowrap;
        text-align: left;
    }
    .dr-table thead th {
        position: sticky;
        top: 0;
        background: #18212b;
    }
    .dr-night td {
        background: rgba(60, 70, 120, 0.25);
    }
    .dr-now td {
        outline: 1px solid #ffb020;
    }
    .dr-fix {
        margin: 10px 0;
        padding: 8px 10px;
        border: 1px solid #2c3743;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .dr-type summary {
        cursor: pointer;
        min-height: 38px;
        display: flex;
        align-items: center;
        color: #b9c4ce;
    }
    .dr-past {
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 13px;
    }
</style>
