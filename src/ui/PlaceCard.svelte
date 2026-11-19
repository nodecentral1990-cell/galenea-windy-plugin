<!-- The place for Port weather and Tides (owner, 2026-11-13): click it on the map, or a port by name, the route's
     start / end, or the phone's / computer's own position. Shows the name (if known), lat / lon and the nearest port. -->
<div class="g-card pc">
    <div class="g-card__head">
        <span class="g-card__title">Place</span>
        <Hint title="Choose the place">
            <p><b>Pick on the map</b>, then click the place: the next click on the map chooses it (it does not add a waypoint). Or type a port name or UN/LOCODE, choose the route's start or end, or use your own position (GPS).</p>
            <p>The name comes from an open list of about 1,600 ports (approximate positions); you can type your own name. Any point at sea works too.</p>
        </Hint>
        <div class="g-card__actions">
            {#if p}<button class="g-btn g-btn--s" disabled={$placeBusy} on:click={() => loadPlace()} title="Fetch the forecast and the tide again"><Icon name="refresh" size={14} /> Refresh</button>{/if}
        </div>
    </div>
    <div class="pc__pick">
        {#if !$phone}
            <button class="g-btn" class:is-on={$picking} on:click={() => ($picking ? cancelPick() : startPick())} title="Then click the place on the map"><Icon name="crosshair" size={15} /> {$picking ? 'Click the map… (Esc to stop)' : 'Pick on the map'}</button>
        {/if}
        <div class="pc__port"><PlacePicker label="Port" bind:place={port} {routeEnds} /></div>
        <button class="g-btn" on:click={gps} title="Your phone's or computer's position (the browser asks first)"><Icon name="pin" size={15} /> My position</button>
    </div>
    {#if p}
        <div class="pc__now">
            <label class="pc__name">Name <input type="text" value={p.name} placeholder={p.nearest ? `near ${p.nearest.name}` : 'open sea'} on:change={e => rename(e.currentTarget.value)} /></label>
            <span class="pc__pos mono">{fmtLat(p.lat, 1)} {fmtLon(p.lon, 1)}</span>
            {#if !p.name && p.nearest}<span class="pp-note">{p.nearest.nm.toFixed(0)} nm from {p.nearest.name}</span>{/if}
        </div>
    {:else}
        <p class="pp-note">No place chosen yet.</p>
    {/if}
    {#if $placeStatus}<div class="g-status" class:g-status--warn={/missing|Could not/.test($placeStatus)}>{$placeStatus}</div>{/if}
</div>

<svelte:window on:keydown={e => e.key === 'Escape' && $picking && cancelPick()} />

<script lang="ts">
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import PlacePicker, { type Place } from './PlacePicker.svelte';
    import { fmtLat, fmtLon } from '../lib/format';
    import { phone, route } from '../state';
    import { cancelPick, loadPlace, picking, placeBusy, placePoint, placeStatus, setPoint, startPick } from '../windy/placeJob';

    $: p = $placePoint;
    let port: Place | null = null;
    let lastPort: Place | null = null;
    $: if (port && port !== lastPort) {
        lastPort = port;
        setPoint(port.lat, port.lon, port.name);
        loadPlace();
    }
    $: routeEnds =
        $route.waypoints.length >= 2
            ? {
                  first: { lat: $route.waypoints[0].lat, lon: $route.waypoints[0].lon, name: $route.waypoints[0].name ?? '' },
                  last: { lat: $route.waypoints[$route.waypoints.length - 1].lat, lon: $route.waypoints[$route.waypoints.length - 1].lon, name: $route.waypoints[$route.waypoints.length - 1].name ?? '' },
              }
            : null;
    function rename(v: string) {
        placePoint.update(x => (x ? { ...x, name: v.trim() } : x));
    }
    function gps() {
        if (!navigator.geolocation) {
            placeStatus.set('This browser cannot give its position.');
            return;
        }
        placeStatus.set('Asking the browser for your position…');
        navigator.geolocation.getCurrentPosition(
            pos => {
                setPoint(pos.coords.latitude, pos.coords.longitude);
                loadPlace();
            },
            err => placeStatus.set(`Position not available: ${err.message || 'refused'}.`),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
        );
    }
</script>

<style lang="less">
    .pc__pick {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: flex-end;
    }
    .pc__port {
        flex: 1 1 180px;
        min-width: 160px;
    }
    .pc__now {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 10px;
        align-items: center;
        margin-top: 8px;
    }
    .pc__name {
        display: flex;
        gap: 6px;
        align-items: center;
        input {
            width: 200px;
        }
    }
    .pc__pos {
        font-family: var(--g-mono);
        color: var(--g-accent-hover);
    }
</style>
