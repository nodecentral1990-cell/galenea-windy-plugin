<!-- Settings → Route editing -->
<div class="gs-grid">
    <label
        >New legs drawn as
        <select bind:value={$route.defaultLegType}>
            <option value="RL">Rhumb line</option>
            <option value="GC">Great circle</option>
        </select>
    </label>
</div>
<label class="gs-check">
    <input type="checkbox" bind:checked={$legClickInserts} />
    Click on a course line inserts a new waypoint there
</label>

<script lang="ts">
    import { legClickInserts, route } from '../../state';
</script>
