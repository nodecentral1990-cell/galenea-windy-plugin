<!-- All settings in one place, in folding groups, so the working tabs stay clean. -->
<div class="st-index" aria-label="Settings groups">
    {#each SECTIONS as sec}
        <button class="st-chip" class:is-on={$openSections.includes(sec.id)} on:click={() => jump(sec.id)} title={sec.hint}><Icon name={sec.icon} size={14} />{sec.short}</button>
    {/each}
    <button class="st-chip st-chip--ghost" on:click={closeAll} title="Close all groups">Close all</button>
    <Hint title="Settings"><p>Every setting lives here, in folding groups. They are saved in this browser on this computer; "Save ship profile" (Ship particulars) writes a file you can take to another computer.</p></Hint>
</div>

{#each SECTIONS as sec}
    <details id="st-{sec.id}" open={$openSections.includes(sec.id)} on:toggle={e => toggle(sec.id, e)}>
        <summary><Icon name={sec.icon} size={16} /><span class="st-title">{sec.title}</span><span class="hint">{sec.hint}</span><span class="st-chev"><Icon name="chevronDown" size={16} /></span></summary>
        <div class="body">
            {#if sec.id === 'ship'}
                <ShipTab />
            {:else if sec.id === 'motion'}
                <MotionSettings />
            {:else if sec.id === 'speed'}
                <SpeedSettings />
            {:else if sec.id === 'limits'}
                <LimitsTab />
            {:else if sec.id === 'polar'}
                <p class="pp-note">Which IMO warnings are coloured in the polar diagram (ship window and Motion). Everything is still worked out and listed.</p>
                <div class="toggles">
                    {#each POLAR_KINDS as [k, label]}
                        <label class="switch"><input type="checkbox" bind:checked={$polarShow[k]} /><span class="knob" /><i class="zsw" style="background:{ZONE_COLORS[k]}" />{label}</label>
                    {/each}
                </div>
                <label class="switch pale"><input type="checkbox" bind:checked={$polarPale} /><span class="knob" />Also show pale zones where the warning would apply if the waves were higher</label>
                <p class="pp-note">The wave heights at which each warning starts are in ⚙ Weather limits (IMO warning heights).</p>
            {:else if sec.id === 'map'}
                <MapDisplaySettings />
            {:else if sec.id === 'route'}
                <div class="grid">
                    <label
                        >New legs drawn as
                        <select bind:value={$route.defaultLegType}>
                            <option value="RL">Rhumb line</option>
                            <option value="GC">Great circle</option>
                        </select>
                    </label>
                </div>
                <label class="check">
                    <input type="checkbox" bind:checked={$legClickInserts} />
                    Click on a course line inserts a new waypoint there
                </label>
            {:else if sec.id === 'weather'}
                <label class="check" title="After the forecast, step Windy's time slider through the voyage with the currents and visibility layers and read them at each ship position (about 1–2 s per step)">
                    <input type="checkbox" bind:checked={$autoLayers} />
                    Also read ocean currents and visibility after the forecast (moves Windy's time slider for a while)
                </label>
                <label class="check" title="Open-Meteo is a free weather service (no account). Used only where Windy has nothing: past times not kept in this browser, and days beyond your Windy plan (free Windy: about 5 days, 3-hour steps).">
                    <input type="checkbox" bind:checked={$freeForecast} />
                    Fill missing times from <b>Open-Meteo</b> (free): past times, and days beyond your Windy plan
                </label>
                <div class="pp-note g-hl">Rows marked <b>E</b> = earlier Windy run kept here; <b>OM</b> = Open-Meteo. <Hint title="Where the weather comes from"><p>The plugin uses Windy's ECMWF and ECMWF-WAM first. Rows from other sources are marked in the weather table: <b>E</b> = an earlier Windy run kept in this browser (past times), <b>OM</b> = Open-Meteo (ECMWF IFS 0.25° for wind and pressure, GFS Wave 0.25° for waves; CC BY 4.0).</p></Hint></div>
            {:else if sec.id === 'charts'}
                <label class="check">
                    <input type="checkbox" checked={$chartLayers.seamarks} on:change={e => chartLayers.update(c => ({ ...c, seamarks: e.currentTarget.checked }))} />
                    Show <b>OpenSeaMap</b> seamarks on the map (lights, buoys, traffic separation, anchorages; from zoom 9)
                </label>
                <label class="slider"
                    >Seamarks strength <input type="range" min="0.3" max="1" step="0.1" value={$chartLayers.opacity} on:input={e => chartLayers.update(c => ({ ...c, opacity: Number(e.currentTarget.value) }))} /></label
                >
                <label class="check">
                    <input type="checkbox" checked={$chartLayers.depth} on:change={e => chartLayers.update(c => ({ ...c, depth: e.currentTarget.checked }))} />
                    Depth shading (GEBCO, worldwide; experimental)
                </label>
                <label class="check">
                    <input type="checkbox" checked={$placesLayers.ports} on:change={e => placesLayers.update(c => ({ ...c, ports: e.currentTarget.checked }))} />
                    Show ports and pilot stations on the map
                </label>
                <label class="check">
                    <input type="checkbox" checked={$placesLayers.canals} on:change={e => placesLayers.update(c => ({ ...c, canals: e.currentTarget.checked }))} />
                    Show canals and main straits on the map
                </label>
                <p class="pp-note pp-err">Not official charts. For orientation only; always use ECDIS / official charts and publications. Seamarks © OpenSeaMap contributors (CC BY-SA), data © OpenStreetMap (ODbL). If the chart server is down, nothing is drawn.</p>
            {:else if sec.id === 'wavechart'}
                <WaveChartSettings />
            {:else if sec.id === 'optimise'}
                <div class="grid">
                    <label
                        >Search width either side of the great circle
                        <select bind:value={$optSettings.width}>
                            <option value="narrow">narrow (8 % of the distance)</option>
                            <option value="normal">normal (15 %)</option>
                            <option value="wide">wide (25 %)</option>
                        </select>
                    </label>
                    <label
                        >Detail
                        <select bind:value={$optSettings.detail}>
                            <option value="fast">fast (stages every 220 nm)</option>
                            <option value="normal">normal (150 nm)</option>
                            <option value="fine">fine (100 nm, slower)</option>
                        </select>
                    </label>
                    <label
                        >Arrival may be late by up to (h)
                        <input type="number" step="0.5" min="0" max="24" bind:value={$optSettings.etaTolH} />
                    </label>
                    <label
                        >Red weather limits
                        <select bind:value={$optSettings.limits}>
                            <option value="hard">never enter</option>
                            <option value="soft">avoid where worth it</option>
                        </select>
                    </label>
                </div>
                <label class="check"><input type="checkbox" bind:checked={$optSettings.avoidImo} /> Steer clear of IMO roll / broaching warnings (counted as 20 t of fuel per hour)</label>
                <label class="check"><input type="checkbox" bind:checked={$optSettings.avoidRoll} /> Keep out of places where the roll estimate is above your roll mark (⚙ Roll and pitch → Mark roll above{$vessel.rollLimitDeg ? `: ${$vessel.rollLimitDeg}°` : ': not set, so off'})</label>
                <p class="pp-note">"Never enter": if no track can keep out of the red limits and still arrive on time, the optimiser says so and shows the least exposed one.</p>
            {:else if sec.id === 'speedplan'}
                <div class="pp-note g-hl"><Hint title="Safe speed plan"><p>What the <b>safe speed plan</b> (⚡ Optimise tab → Speed only) keeps the ship out of, using your weather limits above. It keeps your track and changes only the speed: slow down, speed up, or stop and drift until the weather has passed.</p></Hint></div>
                <div class="toggles col">
                    {#each AVOID_KINDS as k}
                        <label class="switch"><input type="checkbox" bind:checked={$spSettings.avoid[k]} /><span class="knob" />{AVOID_LABEL[k]}</label>
                    {/each}
                </div>
                <div class="grid">
                    <label
                        >Keep out of
                        <select bind:value={$spSettings.level}>
                            <option value={2}>red limits only</option>
                            <option value={1}>amber alerts too</option>
                        </select>
                    </label>
                    <label
                        >Change speed at most every
                        <select bind:value={$spSettings.stepH}>
                            <option value={1}>1 hour</option>
                            <option value={3}>3 hours</option>
                            <option value={6}>6 hours</option>
                            <option value={12}>12 hours</option>
                        </select>
                    </label>
                    <label
                        >Stop and drift only at least (nm from land)
                        <input type="number" min="5" step="5" bind:value={$spSettings.minLandNm} />
                    </label>
                    <label
                        >Fuel when stopped, t/day (empty = not counted)
                        <input type="number" min="0" step="0.5" value={$spSettings.stopFuel ?? ''} on:change={e => ($spSettings.stopFuel = numOrNull(e))} />
                    </label>
                </div>
                <label class="switch"><input type="checkbox" bind:checked={$spSettings.allowStop} /><span class="knob" />Allow stopping and drifting (open water only)</label>
                <div class="pp-note g-hl"><span class="pp-err">Land distance is from a coarse world map: no depths, traffic or shelter.</span> <Hint title="Speeds and stops"><p>Speeds come from your RPM / speed / fuel table (fastest = top of the table) and never from a barred RPM range (⚙ Speed, RPM and fuel). Land distance is from a coarse world map: no depths, traffic or shelter information. Roll / pitch marks: ⚙ Roll and pitch estimate.</p></Hint></div>
            {:else if sec.id === 'updates'}
                <p class="pp-note">This is version <b>{config.version}</b>.</p>
                <label class="check"><input type="checkbox" bind:checked={$updates.auto} /> Check for a newer version by itself every 30 days</label>
                <div class="urow">
                    <button class="pp-btn" disabled={$updateBusy} on:click={() => checkForUpdates(true)}>🔄 Check for updates now</button>
                    {#if $updates.lastCheck}<span class="pp-note">Last checked {new Date($updates.lastCheck).toISOString().slice(0, 16).replace('T', ' ')} UTC</span>{/if}
                </div>
                {#if $updateStatus}<p class="pp-note"><b>{$updateStatus}</b></p>{/if}
                {#if $updates.latest && compareVersions($updates.latest, config.version) > 0}
                    {#if $installedPending === $updates.latest}
                        <button class="pp-btn" on:click={reloadWindy}>🔄 Reload Windy now to start {$updates.latest}</button>
                    {:else}
                        <button class="pp-btn" disabled={$updateBusy} on:click={() => installUpdate($updates.latest ?? '')}>Install version {$updates.latest}</button>
                    {/if}
                    <InstallSteps version={$updates.latest} />
                {/if}
                <div class="pp-note g-hl"><Hint title="How the update check works"><p>The check asks Windy's plugin server whether a newer version of this plugin has been published; nothing about you
                    or your route is sent. "What's new" appears at the top of the panel after an update. Release notes: Info tab.</p></Hint></div>
            {:else if sec.id === 'log'}
                <label class="check"><input type="checkbox" bind:checked={$logEnabled} /> Record an activity log (what the plugin does, for problem reports)</label>
                <label class="check"><input type="checkbox" bind:checked={$usageEnabled} /> Count usage statistics (hours, routes, heat map, fuel saved)</label>
                <p class="pp-note">Both stay in this browser only. The Usage tab shows them and saves the log as a file.</p>
            {/if}
        </div>
    </details>
{/each}

<script lang="ts">
    import { tick } from 'svelte';
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';

    import { legClickInserts, route, vessel } from '../state';
    import { autoLayers } from '../windy/weatherJobs';
    import { logEnabled } from '../lib/activityLog';
    import { usageEnabled } from '../lib/usage';
    import config from '../pluginConfig';
    import { compareVersions } from '../lib/releaseNotes';
    import { checkForUpdates, installedPending, installUpdate, reloadWindy, updateBusy, updateStatus, updates } from '../windy/updates';
    import InstallSteps from './InstallSteps.svelte';
    import { optSettings } from '../windy/optimiseJob';
    import { AVOID_LABEL, spSettings, type AvoidKind } from '../windy/speedPlanJob';
    const AVOID_KINDS = Object.keys(AVOID_LABEL) as AvoidKind[];
    const numOrNull = (e: Event) => {
        const v = (e.target as HTMLInputElement).value.trim();
        const n = Number(v);
        return v === '' || !isFinite(n) ? null : n;
    };


    import ShipTab from './ShipTab.svelte';
    import SpeedSettings from './SpeedSettings.svelte';
    import LimitsTab from './LimitsTab.svelte';
    import MapDisplaySettings from './MapDisplaySettings.svelte';
    import MotionSettings from './MotionSettings.svelte';
    import WaveChartSettings from './WaveChartSettings.svelte';
    import { chartLayers, freeForecast, placesLayers, polarPale, polarShow } from '../state';
    import { ZONE_COLORS } from '../lib/dangerZones';
    const POLAR_KINDS = [
        ['parametric', 'Parametric rolling'],
        ['synchronous', 'Synchronous rolling'],
        ['highWaves', 'Successive high waves'],
        ['surf', 'Surf-riding / broaching'],
    ] as const;

    const SECTIONS = [
        { id: 'ship', icon: 'ship', short: 'Ship', title: 'Ship particulars', hint: 'LBP, breadth, drafts, GM, roll period, pitch' },
        { id: 'motion', icon: 'motion', short: 'Roll & pitch', title: 'Roll and pitch estimate', hint: 'bilge keels (sections), KG, damping' },
        { id: 'speed', icon: 'ruler', short: 'Speed & fuel', title: 'Speed, RPM and fuel', hint: 'your table, weather loss, currents' },
        { id: 'limits', icon: 'warn', short: 'Limits', title: 'Weather limits', hint: 'alert / limit by sector, IMO warning heights' },
        { id: 'polar', icon: 'sparkle', short: 'Polar', title: 'Polar diagram', hint: 'which IMO warnings are shown (on / off switches)' },
        { id: 'map', icon: 'map', short: 'Map', title: 'Map display', hint: 'ship symbols, colours, ship window, follow ship' },
        { id: 'route', icon: 'route', short: 'Route', title: 'Route editing', hint: 'new legs, clicking on the course line' },
        { id: 'weather', icon: 'weather', short: 'Weather', title: 'Weather reading', hint: 'currents and visibility, free forecast for missing times' },
        { id: 'charts', icon: 'anchor', short: 'Charts', title: 'Nautical charts and places', hint: 'OpenSeaMap seamarks, depth, ports and canals on the map' },
        { id: 'wavechart', icon: 'layers', short: 'Wave chart', title: 'Wave chart (your colours)', hint: 'SWH / sea / swell colours, white below, steps, lines' },
        { id: 'optimise', icon: 'bolt', short: 'Optimiser', title: 'Route optimisation', hint: 'search width, detail, limits' },
        { id: 'speedplan', icon: 'lifebuoy', short: 'Speed plan', title: 'Safe speed plan', hint: 'what to avoid, stops, how often the speed changes' },
        { id: 'updates', icon: 'refresh', short: 'Updates', title: 'Updates', hint: 'check for a newer version, every 30 days by itself' },
        { id: 'log', icon: 'log', short: 'Log', title: 'Activity log and usage', hint: 'recording on / off' },
    ];

    async function jump(id: string) {
        openSections.update(l => [...new Set([...l, id])]);
        await tick();
        document.getElementById(`st-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    function closeAll() {
        openSections.set([]);
    }
    /** Which groups are open (kept while the plugin is open) */
    const openSections = OPEN;
    function toggle(id: string, e: Event) {
        const open = (e.currentTarget as HTMLDetailsElement).open;
        openSections.update(l => (open ? [...new Set([...l, id])] : l.filter(x => x !== id)));
    }
</script>

<script lang="ts" context="module">
    import { writable as w } from 'svelte/store';
    const OPEN = w<string[]>(['ship']);
    /** Open one settings group (e.g. from the ⚙ button on the ship window) */
    export function openSettingsSection(id: string): void {
        OPEN.update(l => [...new Set([...l, id])]);
    }
</script>

<style lang="less">
    .toggles {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 16px;
        &.col {
            flex-direction: column;
            margin-bottom: 6px;
        }
    }
    .urow {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        margin: 6px 0;
    }
    .zsw {
        display: inline-block;
        width: 12px;
        height: 10px;
        border: 1px solid #000;
    }
    .pale {
        margin-top: 8px;
    }
    /* on / off switch */
    .switch {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        input {
            position: absolute;
            opacity: 0;
            width: 0;
            height: 0;
        }
        .knob {
            position: relative;
            width: 30px;
            height: 16px;
            border-radius: 8px;
            background: #666;
            transition: background 0.15s;
            &::after {
                content: '';
                position: absolute;
                left: 2px;
                top: 2px;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #fff;
                transition: left 0.15s;
            }
        }
        input:checked + .knob {
            background: #2e9e4f;
            &::after {
                left: 16px;
            }
        }
        input:focus-visible + .knob {
            outline: 2px solid #9fd3ff;
        }
    }
    .st-index {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin: 0 0 10px;
        align-items: center;
    }
    .st-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 26px;
        padding: 0 8px;
        border-radius: 13px;
        border: 1px solid var(--g-border);
        background: var(--g-bg-1);
        color: var(--g-text-2);
        font: 500 12px var(--g-font);
        cursor: pointer;
        &:hover {
            border-color: var(--g-border-strong);
            color: var(--g-text-1);
        }
        &.is-on {
            border-color: var(--g-accent);
            color: var(--g-text-1);
            background: var(--g-accent-soft);
        }
        &.st-chip--ghost {
            background: transparent;
            border-color: transparent;
        }
    }
    details {
        border: 1px solid var(--g-border);
        border-radius: 8px;
        margin: 0 0 8px;
        background: var(--g-bg-1);
        scroll-margin-top: 8px;
    }
    summary {
        cursor: pointer;
        padding: 10px 12px;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        list-style: none;
        color: var(--g-text-1);
        &::-webkit-details-marker {
            display: none;
        }
        &:hover {
            background: rgba(255, 255, 255, 0.03);
        }
    }
    .st-title {
        font-weight: 650;
        white-space: nowrap;
    }
    .st-chev {
        margin-left: auto;
        color: var(--g-text-3);
        transition: transform 0.15s;
        display: inline-flex;
    }
    details[open] .st-chev {
        transform: rotate(180deg);
    }
    details[open] summary {
        border-bottom: 1px solid var(--g-border);
    }
    .hint {
        font-weight: normal;
        font-size: 12px;
        color: var(--g-text-3);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }
    .body {
        padding: 10px 12px 12px;
    }
    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 10px;
        label {
            display: flex;
            flex-direction: column;
            font-size: 11px;
        }
    }
    .check {
        display: flex;
        gap: 4px;
        align-items: center;
        margin: 4px 0;
    }
</style>
