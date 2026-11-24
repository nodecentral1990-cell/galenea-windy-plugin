<!-- Top of the panel: "updated to vX, what's new" after an update, or "version X available" with install. -->
{#if justUpdated}
    <div class="ub ok">
        <div class="ub__head">
            <b>✅ Updated to version {config.version}.</b> What's new:
            <button class="pp-btn small ub__ok" on:click={seenIt} title="Close this note (Help → Guide → What's new keeps it)">OK, close</button>
        </div>
        <!-- its own scroll bar, so the rest of the panel is always reachable (owner's report 0.23.2) -->
        <!-- every version since the one this user last opened, each with its number and date (owner, 2026-11-24) -->
        <div class="ub__list pp-scroll">
            {#each notes as n}
                <div class="ub__ver">Version {n.version} · {fmtDay(n.date)}</div>
                <ul>{#each n.notes as line}<li>{line}</li>{/each}</ul>
            {/each}
            {#if older}<p class="ub__more">Changes before {oldest}: Help → Guide → What's new.</p>{/if}
        </div>
        <button class="pp-btn small" on:click={seenIt}>OK</button>
    </div>
{:else if available}
    <div class="ub new">
        <b>🔔 Version {$updates.latest} is available</b> (you have {config.version}{$updates.latestBuilt ? `; published ${$updates.latestBuilt.slice(0, 10)}` : ''}).
        <div class="row">
            {#if $installedPending === $updates.latest}
                <button class="pp-btn small" on:click={reloadWindy}><Icon name="refresh" size={14} /> Reload Windy now to start {$updates.latest}</button>
            {:else}
                <button class="pp-btn small" disabled={busy || $updateBusy} on:click={install}>{busy ? 'Installing…' : 'Install update'}</button>
            {/if}
            <button class="pp-btn pp-btn--ghost small" on:click={() => (steps = !steps)}>How to install by hand</button>
            <button class="pp-btn pp-btn--ghost small" on:click={later}>Later</button>
        </div>
        {#if $updateStatus}<p class="st">{$updateStatus}</p>{/if}
        {#if steps}<InstallSteps version={$updates.latest ?? ''} />{/if}
    </div>
{/if}

<script lang="ts">
    import Icon from './base/Icon.svelte';
    import { onMount } from 'svelte';

    import config from '../pluginConfig';
    import { compareVersions, notesBetween, RELEASE_NOTES } from '../lib/releaseNotes';
    import { autoCheck, installedPending, installUpdate, reloadWindy, updateBusy, updateStatus, updates, wantInstallSteps } from '../windy/updates';
    import InstallSteps from './InstallSteps.svelte';

    let steps = false;
    let busy = false;
    let justUpdated = false;
    let notes = notesBetween(null, config.version).slice(0, 1);
    let older = false;
    const oldest = RELEASE_NOTES[RELEASE_NOTES.length - 1]?.version ?? '';
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fmtDay = (d: string) => {
        const [y, m, dd] = d.split('-').map(Number);
        return y && m && dd ? `${dd} ${MON[m - 1]} ${y}` : d;
    };
    // the header's update button could not install by itself: show the steps here
    $: if ($wantInstallSteps) {
        steps = true;
        wantInstallSteps.set(false);
    }

    onMount(() => {
        const seen = $updates.seen;
        if (seen && compareVersions(seen, config.version) < 0) {
            justUpdated = true;
            notes = notesBetween(seen, config.version);
            // last opened a version older than the notes kept in the plugin: say where the rest is
            older = RELEASE_NOTES.length > 0 && compareVersions(seen, RELEASE_NOTES[RELEASE_NOTES.length - 1].version) < 0;
        } else if (!seen) {
            updates.update(s => ({ ...s, seen: config.version }));
        }
        autoCheck();
    });

    $: available = !!$updates.latest && compareVersions($updates.latest, config.version) > 0 && $updates.dismissed !== $updates.latest;

    function seenIt() {
        justUpdated = false;
        updates.update(s => ({ ...s, seen: config.version }));
    }
    function later() {
        updates.update(s => ({ ...s, dismissed: s.latest }));
    }
    async function install() {
        busy = true;
        const ok = await installUpdate($updates.latest as string);
        busy = false;
        if (!ok) steps = true;
    }
</script>

<style lang="less">
    .ub {
        border-radius: 6px;
        padding: 6px 8px;
        margin: 6px 0;
        font-size: 12px;
        ul {
            margin: 4px 0;
            padding-left: 18px;
        }
        &.ok {
            background: rgba(57, 160, 80, 0.25);
            border: 1px solid rgba(57, 160, 80, 0.7);
        }
        &.new {
            background: rgba(30, 136, 229, 0.22);
            border: 1px solid rgba(30, 136, 229, 0.7);
        }
    }
    .row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 4px;
    }
    .st {
        margin: 4px 0 0;
        font-size: 11px;
    }
    .small {
        padding: 2px 8px;
        font-size: 11px;
    }
    .ub__head {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }
    .ub__ok {
        margin-left: auto !important;
    }
    .ub__list {
        max-height: 34vh;
        overflow-y: auto;
        margin: 6px 0;
        padding-right: 6px;
        ul {
            margin: 2px 0 6px;
            padding-left: 18px;
        }
    }
    .ub__ver {
        font-weight: 700;
        margin-top: 4px;
    }
    .ub__more {
        opacity: 0.8;
        margin: 4px 0;
    }
</style>
