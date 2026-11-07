<!-- Weather under the cursor (owner, 2026-11-02): a bar at the top of the map with the weather where the mouse rests,
     at Windy's map time. Minimise / close; switch back on in Settings → Map display. Computer only (phones have no cursor,
     and Windy hides the map while the plugin is open there). -->
<div class="cb pp" class:cb--min={$cursorBar.min} data-g-dim={$panelDim ? '' : null} use:toBody role="status" aria-live="polite" style={place}>
    <div class="cb__row">
        <span class="cb__pos mono" title="Cursor position">
            {#if $cursorPos}{fmtLat($cursorPos.lat, 1)} {fmtLon($cursorPos.lon, 1)}{:else}Move the mouse over the map{/if}
        </span>
        {#if $cursorBar.min}
            {#if w}<span class="cb__it">Wind <b>{f0(w.windKn)} kn</b> {dir(w.windDir)}</span><span class="cb__it">SWH <b>{f1(w.hs)} m</b></span>{/if}
        {:else if c && c.status === 'loading' && !w}
            <span class="cb__it cb__muted">Reading the forecast…</span>
        {:else if c && (c.status === 'none' || c.status === 'error')}
            <span class="cb__it cb__muted">{c.status === 'none' ? 'No forecast for this place and time' : 'Forecast could not be read'}</span>
        {:else if w}
            <span class="cb__it">Wind <b>{f0(w.windKn)} kn</b> {dir(w.windDir)}{w.gustKn != null ? ` · gust ${f0(w.gustKn)}` : ''}{bf != null ? ` · Bf ${bf}` : ''}</span>
            {#each waves as wv}
                <span class="cb__it" class:cb__muted={wv.h == null}><i style="background:{colorOf(wv.id)}" />{wv.label} <b>{wv.h != null ? `${wv.h.toFixed(1)} m` : '—'}</b>{wv.period != null ? ` ${wv.period.toFixed(0)} s` : ''}{wv.dir != null ? ` ${dir(wv.dir)}` : ''}{wv.estimated && wv.h != null ? '*' : ''}</span>
            {/each}
            {#if w.powerKw != null}<span class="cb__it">Power <b>{f0(w.powerKw)}</b> kW/m</span>{/if}
            <span class="cb__it">{weatherWords}</span>
            <span class="cb__it" title={vis == null ? "Visibility: switch Windy's layer to Visibility to read it here" : ''}>Vis <b>{vis == null ? '—' : vis > 7 ? '> 7 nm' : `${vis.toFixed(1)} nm`}</b></span>
            <span class="cb__it" title={c?.currentKn == null ? "Current: switch Windy's layer to Currents to read it here" : 'Where the current sets'}>Current <b>{c?.currentKn != null ? `${c.currentKn.toFixed(1)} kn → ${dir(c.currentSet)}` : '—'}</b></span>
            <span class="cb__it"><b>{f0(w.pressureHpa)}</b> hPa</span>
            <span class="cb__it">Air <b>{f0(w.airTempC)} °C</b></span>
            <span class="cb__it">Sea temp <b>{f0(w.seaTempC)} °C</b></span>
            <span class="cb__it">RH <b>{w.rhPct != null ? `${w.rhPct.toFixed(0)} %` : '—'}</b></span>
            {#if icing && icing.cls !== 'none'}<span class="cb__it cb__warn">Spray icing <b>{icing.cls}</b></span>{/if}
        {/if}
        <span class="cb__tools">
            <Hint title="Weather under the cursor" size={14}>
                <p>The weather where the mouse rests, at <b>Windy's map time</b> ({c ? fmtTime(c.t) : '—'} UTC), from Windy's ECMWF and ECMWF-WAM point forecast for the nearest 0.25° point{c?.cell ? ` (${c.cell.lat.toFixed(2)}°, ${c.cell.lon.toFixed(2)}°)` : ''}{c?.run ? `, run ${fmtRun(c.run)}` : ''}.</p>
                <p><b>Sea*</b> = worked out from SWH and the swells (Windy's point forecast has no sea of its own). Visibility and current are read from Windy's map only when that layer is shown. Directions: where wind and waves come <b>from</b>; current: where it sets.</p>
                <p>Planning aid only. Switch the bar on or off in Settings → Map display.</p>
            </Hint>
            <button class="g-ibtn g-ibtn--s" title={$cursorBar.min ? 'Show everything' : 'Minimise'} aria-label={$cursorBar.min ? 'Show everything' : 'Minimise'} on:click={() => cursorBar.update(b => ({ ...b, min: !b.min }))}>{$cursorBar.min ? '▢' : '–'}</button>
            <button class="g-ibtn g-ibtn--s" title="Close (switch on again in Settings → Map display)" aria-label="Close" on:click={close}>✕</button>
        </span>
    </div>
</div>

<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import Hint from './base/Hint.svelte';
    import { fmtLat, fmtLon, fmtTime } from '../lib/format';
    import { sprayIcing } from '../lib/icing';
    import { beaufort, fmtRun, wavesOf } from '../lib/weather';
    import { logEvent } from '../lib/activityLog';
    import { cursorBar, flagColors, panelDim } from '../state';
    import { cursorPos, cursorWx, startCursorWx, stopCursorWx } from '../windy/cursorWx';

    $: c = $cursorWx;
    $: w = c?.wx ?? null;
    $: waves = w ? wavesOf(w) : [];
    $: bf = w ? beaufort(w.windKn) : null;
    $: vis = c?.visNm ?? w?.visNm ?? null;
    $: icing = w ? sprayIcing(w.windKn, w.airTempC, w.seaTempC) : null;
    $: weatherWords = w ? [w.thunder ? 'Thunder' : '', w.fog ? 'Fog' : '', w.precipMm != null && w.precipMm >= 0.1 ? `Rain ${w.precipMm.toFixed(1)} mm` : ''].filter(Boolean).join(' · ') || 'No rain' : '';
    const colorOf = (id: string) => ({ swh: $flagColors.swh, sea: $flagColors.sea, sw1: $flagColors.swell, sw2: $flagColors.swell2 })[id] ?? '#888';
    const f0 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v.toFixed(0));
    const f1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v.toFixed(1));
    const dir = (d: number | null | undefined) => (d == null || !isFinite(d) ? '' : `${String(Math.round(d) % 360).padStart(3, '0')}°`);

    function close() {
        cursorBar.update(b => ({ ...b, on: false }));
        logEvent('settings', 'Weather under the cursor bar closed');
    }
    function toBody(node: HTMLElement) {
        document.body.appendChild(node);
        return { destroy: () => node.remove() };
    }
    // keep clear of the ship window (top left, movable): the bar starts to its right when they would overlap
    let place = '';
    function fit() {
        const PANE = 520;
        const mapRight = window.innerWidth - PANE;
        const sb = document.querySelector('.sb') as HTMLElement | null;
        const r = sb?.getBoundingClientRect();
        if (r && r.width > 0 && r.top < 130 && r.left < mapRight / 2) {
            const left = Math.round(r.right + 12);
            place = `left:${left}px;transform:none;max-width:${Math.max(260, mapRight - left - 12)}px`;
        } else place = '';
    }
    let fitTimer: ReturnType<typeof setInterval> | null = null;
    onMount(() => {
        startCursorWx();
        fit();
        fitTimer = setInterval(fit, 800);
        window.addEventListener('resize', fit);
    });
    onDestroy(() => {
        stopCursorWx();
        if (fitTimer) clearInterval(fitTimer);
        window.removeEventListener('resize', fit);
    });
</script>

<style lang="less">
    .cb {
        position: fixed;
        top: 62px;
        left: calc((100vw - 520px) / 2);
        transform: translateX(-50%);
        z-index: 1100; /* below the graph window (1150) and the ship window (1200): their buttons stay clickable */
        max-width: calc(100vw - 520px - 40px);
        background: rgba(24, 28, 33, 0.93);
        color: var(--g-text-1);
        border-radius: 10px;
        box-shadow: var(--g-shadow);
        backdrop-filter: blur(6px);
        padding: 5px 6px 5px 10px;
        font: 12px var(--g-font);
        pointer-events: auto;
    }
    .cb__row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px 12px;
    }
    .cb__pos {
        font-family: var(--g-mono);
        color: var(--g-accent-hover);
        white-space: nowrap;
    }
    .cb__it {
        white-space: nowrap;
        color: var(--g-text-2);
        i {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 2px;
            margin-right: 3px;
            vertical-align: 0;
        }
        b {
            color: var(--g-text-1);
        }
    }
    .cb__muted {
        color: var(--g-text-3);
    }
    .cb__warn,
    .cb__warn b {
        color: var(--g-warn);
    }
    .cb__tools {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 2px;
    }
    @media (max-width: 600px) {
        .cb {
            display: none;
        }
    }
</style>
