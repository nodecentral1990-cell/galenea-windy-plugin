<!-- Settings → Activity log and usage -->
<label class="gs-check"><input type="checkbox" bind:checked={$logEnabled} /> Record an activity log (what the plugin does, for problem reports)</label>
<label class="gs-check"><input type="checkbox" bind:checked={$usageEnabled} /> Count usage statistics (hours, routes, heat map, fuel saved)</label>
<p class="pp-note">Both stay in this browser only. Help → Usage shows them and saves the log as a file.</p>

<script lang="ts">
    import { logEnabled } from '../../lib/activityLog';
    import { usageEnabled } from '../../lib/usage';
</script>
