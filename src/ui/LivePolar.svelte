<!-- Live polar (owner, 2026-11-02): the ship's position from the phone's (or computer's) GPS, the forecast for that place
     and the present time, the heading typed in (or the GPS course) and the speed from GPS or typed in: the IMO warnings,
     roll and pitch live as the ship moves. Needs internet for the forecast; GPS works without it. -->
<div class="lv">
    <div class="g-row">
        {#if !watching}
            <button class="pp-btn g-btn--primary" on:click={startGps}><Icon name="crosshair" size={15} /> Start live (GPS)</button>
        {:else}
            <button class="pp-btn" on:click={stopGps}><Icon name="stop" size={14} /> Stop</button>
        {/if}
        <Hint title="Live polar from GPS" width={360}>
            <p>Uses this phone's (or computer's) <b>location</b>: the browser or the Windy app asks your permission first. The forecast for that place at the present time is fetched (internet needed), then the polar diagram, the IMO warnings and the roll / pitch estimate follow the ship as she moves.</p>
            <p><b>Heading</b>: type the ship's heading from the gyro. GPS gives only the <b>course over ground</b> (track), which differs from the heading with wind, current and leeway; "Use GPS course" copies it in as a starting point.</p>
            <p><b>Speed</b>: GPS speed is speed over ground; the IMO checks strictly use speed through the water: type it in if the current is strong.</p>
            <p>A phone's GPS inside the bridge can be weak or jump; it is checked here only for the weather position. Planning aid only.</p>
        </Hint>
    </div>
    {#if gpsError}<div class="g-status g-status--warn"><Icon name="warn" size={14} /> {gpsError}</div>{/if}
    {#if fix}
        <div class="lv__fix">
            <b class="mono">{fmtPos(fix.lat, fix.lon)}</b>
            <span>GPS {fmtTime(fix.t)} UTC · ±{fix.acc.toFixed(0)} m{fix.sog != null ? ` · SOG ${fix.sog.toFixed(1)} kn` : ''}{fix.cog != null ? ` · COG ${deg(fix.cog)}` : ''}</span>
        </div>
    {:else if watching}
        <div class="g-status">Waiting for a GPS position…</div>
    {/if}
    <div class="grid">
        <label
            >Heading (°T, from the gyro)
            <input type="number" min="0" max="359" step="1" value={$liveSettings.heading} on:change={e => setHeading(Number(e.currentTarget.value))} />
        </label>
        <label
            >Speed
            <select value={$liveSettings.speedMode} on:change={e => liveSettings.update(s => ({ ...s, speedMode: e.currentTarget.value === 'manual' ? 'manual' : 'gps' }))}>
                <option value="gps">from GPS (over ground)</option>
                <option value="manual">typed in (through the water)</option>
            </select>
        </label>
        {#if $liveSettings.speedMode === 'manual'}
            <label>Speed (kn) <input type="number" min="0" step="0.5" value={$liveSettings.manualSpeed} on:change={e => liveSettings.update(s => ({ ...s, manualSpeed: Math.max(0, Number(e.currentTarget.value) || 0) }))} /></label>
        {/if}
    </div>
    {#if fix?.cog != null}<button class="pp-btn pp-btn--ghost small" on:click={() => setHeading(Math.round(fix?.cog ?? 0))}>Use GPS course {deg(fix.cog)}</button>{/if}
    {#if wxStatus}<div class="g-status">{wxStatus}</div>{/if}
    {#if wx}
        <div class="lv__head"><b>Now {fmtTime(now)} UTC</b> · {heading.toFixed(0)}° · {speed.toFixed(1)} kn {$liveSettings.speedMode === 'gps' ? '(GPS)' : '(typed)'}</div>
        <RiskPolar {wx} {heading} {speed} lbp={$vessel.lbp} rollPeriod={roll.value} settings={$thresholds.resonance} size={490} style={$shipStyle} current={null} colors={$flagColors} />
        <h4>At this heading and speed <span class="g-chip">advisory</span></h4>
        {#if hits.length || limits.length}
            {#each hits as h}<div><span class="chip {h.phenomenon}">{PHENOMENON_LABEL[h.phenomenon]}</span> {h.detail}</div>{/each}
            {#each limits as l}<div class="lv{l.level}">{l.level === 2 ? 'LIMIT' : 'Alert'}: {l.detail}</div>{/each}
        {:else}
            <div class="g-status g-status--ok"><Icon name="check" size={14} /> No warnings from the checks. That does not mean it is safe.</div>
        {/if}
        <div class="lv__motion">
            {#if motion}<b>Roll / pitch estimate:</b> roll {motion.roll.toFixed(1)}° (likely largest in 3 h {motion.rollMax.toFixed(0)}°), pitch {motion.pitch.toFixed(1)}°.{:else}<span class="pp-note">Roll / pitch estimate: {motionMissing($vessel) || 'no wave data here'}.</span>{/if}
        </div>
        {#if run}<div class="g-prov"><Icon name="calendar" size={14} /> <span>Windy ECMWF / ECMWF-WAM {run} · forecast point {cell?.lat.toFixed(1)}°, {cell?.lon.toFixed(1)}°. Sea worked out from SWH and the swells.</span></div>{/if}
    {/if}
</div>

<script lang="ts">
    import { onDestroy } from 'svelte';
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import RiskPolar from './RiskPolar.svelte';
    import { checkWaveSystem, PHENOMENON_LABEL } from '../lib/circ1228';
    import { fmtPos, fmtTime } from '../lib/format';
    import { logEvent } from '../lib/activityLog';
    import { motionAt, motionMissing } from '../lib/motionEstimate';
    import { checkLimits, fmtRun, rollPeriodFor, sampleSeries, waveSystems, type WxPoint, type WxSeries } from '../lib/weather';
    import { flagColors, liveSettings, shipStyle, thresholds, vessel } from '../state';
    import { fetchSeries } from '../windy/forecast';

    interface Fix {
        lat: number;
        lon: number;
        acc: number;
        sog: number | null;
        cog: number | null;
        t: number;
    }
    let watchId: number | null = null;
    let watching = false;
    let fix: Fix | null = null;
    let gpsError = '';
    let series: WxSeries | null = null;
    let cell: { lat: number; lon: number } | null = null;
    let wxStatus = '';
    let now = Date.now();
    const tick = setInterval(() => (now = Date.now()), 60_000);

    const deg = (d: number | null | undefined) => (d == null ? '' : `${String(Math.round(d) % 360).padStart(3, '0')}°`);
    function setHeading(h: number) {
        liveSettings.update(s => ({ ...s, heading: ((Math.round(h) % 360) + 360) % 360 }));
    }

    function startGps() {
        gpsError = '';
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            gpsError = 'This browser or app gives no location.';
            return;
        }
        watching = true;
        logEvent('click', 'Motion: live GPS started');
        watchId = navigator.geolocation.watchPosition(
            p => {
                gpsError = '';
                fix = {
                    lat: p.coords.latitude,
                    lon: p.coords.longitude,
                    acc: p.coords.accuracy ?? 0,
                    sog: p.coords.speed != null && isFinite(p.coords.speed) ? p.coords.speed * 1.943844 : null,
                    cog: p.coords.heading != null && isFinite(p.coords.heading) && (p.coords.speed ?? 0) > 0.5 ? p.coords.heading : null,
                    t: p.timestamp || Date.now(),
                };
            },
            e => {
                gpsError = e.code === 1 ? 'Location permission refused: allow location for windy.com (or the Windy app) in the phone settings, then press Start again.' : e.code === 3 ? 'No GPS position yet (timed out). Try near a window or outside.' : `No GPS position: ${e.message}`;
                logEvent('error', `Live GPS: ${gpsError}`);
            },
            { enableHighAccuracy: true, maximumAge: 10_000, timeout: 60_000 },
        );
    }
    function stopGps() {
        if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
        watchId = null;
        watching = false;
    }
    onDestroy(() => {
        stopGps();
        clearInterval(tick);
    });

    // forecast for the 0.1° point around the ship; fetched again when she has moved to another point
    $: if (fix) loadFor(Math.round(fix.lat * 10) / 10, Math.round(fix.lon * 10) / 10);
    let loading = '';
    async function loadFor(lat: number, lon: number) {
        const key = `${lat},${lon}`;
        if (key === loading || (cell && cell.lat === lat && cell.lon === lon && series)) return;
        loading = key;
        wxStatus = 'Fetching the forecast for this position…';
        try {
            const s = await fetchSeries(lat, lon, 1);
            series = s;
            cell = { lat, lon };
            wxStatus = '';
        } catch (e) {
            wxStatus = `Forecast not available (${(e as Error).message}). Internet needed for the weather; GPS works without it.`;
        } finally {
            loading = '';
        }
    }

    $: wx = series ? (sampleSeries(series, now) as WxPoint | null) : null;
    $: run = series?.refTime ? `run ${fmtRun(series.refTime)}` : '';
    $: heading = $liveSettings.heading;
    $: speed = $liveSettings.speedMode === 'gps' ? (fix?.sog ?? 0) : $liveSettings.manualSpeed;
    $: roll = rollPeriodFor($vessel);
    $: hits = wx ? waveSystems(wx).flatMap(ws => checkWaveSystem(ws, { headingDeg: heading, speedKn: speed, lbp: $vessel.lbp, rollPeriod: roll.value }, $thresholds.resonance)) : [];
    $: limits = wx ? checkLimits(wx, heading, $thresholds) : [];
    $: motion = wx ? motionAt(wx, heading, speed, $vessel) : null;
</script>

<style lang="less">
    .lv__fix {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 8px 0;
        font-size: 12.5px;
        color: var(--g-text-2);
    }
    .lv__head {
        margin: 10px 0 4px;
    }
    .lv__motion {
        margin: 6px 0;
    }
    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 10px;
        margin: 8px 0;
        label {
            display: flex;
            flex-direction: column;
            font-size: 12px;
        }
    }
    .chip {
        display: inline-block;
        padding: 0 4px;
        border-radius: 3px;
        color: #fff;
        font-weight: bold;
        font-size: 10px;
        &.parametric {
            background: #e53935;
        }
        &.synchronous {
            background: #9c27b0;
        }
        &.highWaves {
            background: #1e9e4a;
        }
        &.surf {
            background: #3949ab;
        }
    }
    .lv1 {
        color: var(--g-warn);
    }
    .lv2 {
        color: var(--g-danger);
        font-weight: 650;
    }
</style>
