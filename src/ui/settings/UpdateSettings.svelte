<!-- Settings → Updates -->
<p class="pp-note">This is version <b>{config.version}</b>.</p>
<label class="gs-check"><input type="checkbox" bind:checked={$updates.auto} /> Check for a newer version by itself (once a day)</label>
<div class="gs-urow">
    <button class="pp-btn" disabled={$updateBusy} on:click={() => checkForUpdates(true)}><Icon name="refresh" size={15} /> Check for updates now</button>
    {#if $updates.lastCheck}<span class="pp-note">Last checked {new Date($updates.lastCheck).toISOString().slice(0, 16).replace('T', ' ')} UTC</span>{/if}
</div>
{#if $updateStatus}<p class="pp-note"><b>{$updateStatus}</b></p>{/if}
{#if $updates.latest && compareVersions($updates.latest, config.version) > 0}
    {#if $installedPending === $updates.latest}
        <button class="pp-btn" on:click={reloadWindy}><Icon name="refresh" size={15} /> Reload Windy now to start {$updates.latest}</button>
    {:else}
        <button class="pp-btn" disabled={$updateBusy} on:click={() => installUpdate($updates.latest ?? '')}>Install version {$updates.latest}</button>
    {/if}
    <InstallSteps version={$updates.latest} />
{/if}
<div class="pp-note g-hl">
    Nothing about you or your route is sent.
    <Hint title="How the update check works"
        ><p>
            The check asks Windy's plugin server whether a newer version of this plugin has been published; nothing about you or your route is sent. "What's new" appears at the top of the panel after an update.
            Release notes: Help → Guide.
        </p></Hint
    >
</div>

<script lang="ts">
    import Hint from '../base/Hint.svelte';
    import Icon from '../base/Icon.svelte';
    import InstallSteps from '../InstallSteps.svelte';
    import config from '../../pluginConfig';
    import { compareVersions } from '../../lib/releaseNotes';
    import { checkForUpdates, installedPending, installUpdate, reloadWindy, updateBusy, updateStatus, updates } from '../../windy/updates';
</script>
