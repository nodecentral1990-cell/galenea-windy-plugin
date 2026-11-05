<!-- Top of the panel: "updated to vX, what's new" after an update, or "version X available" with install. -->
{#if justUpdated}
    <div class="ub ok">
        <div class="ub__head">
            <b>✅ Updated to version {config.version}.</b> What's new:
            <button class="pp-btn small ub__ok" on:click={seenIt} title="Close this note (Help → Guide → What's new keeps it)">OK, close</button>
        </div>
        <!-- its own scroll bar, so the rest of the panel is always reachable (owner's report 0.23.2) -->
        <ul class="ub__list pp-scroll">
            {#each notes as n}{#each n.notes as line}<li>{line}</li>{/each}{/each}
        </ul>
        <button class="pp-btn small" on:click={seenIt}>OK</button>
    </div>
{:else if available}
    <div class="ub new">
        <b>🔔 Version {$updates.latest} is available</b> (you have {config.version}{$updates.latestBuilt ? `; published ${$updates.latestBuilt.slice(0, 10)}` : ''}).
        <div class="row">
            {#if $installedPending === $updates.latest}
                <button class="pp-btn small" on:click={reloadWindy}>🔄 Reload Windy now to start {$updates.latest}</button>
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
    import { onMount } from 'svelte';

    import config from '../pluginConfig';
    import { compareVersions, notesBetween } from '../lib/releaseNotes';
    import { autoCheck, installedPending, installUpdate, reloadWindy, updateBusy, updateStatus, updates } from '../windy/updates';
    import InstallSteps from './InstallSteps.svelte';

    let steps = false;
    let busy = false;
    let justUpdated = false;
    let notes = notesBetween(null, config.version).slice(0, 1);

    onMount(() => {
        const seen = $updates.seen;
        if (seen && compareVersions(seen, config.version) < 0) {
            justUpdated = true;
            notes = notesBetween(seen, config.version);
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
    }
</style>
