<!-- Progress window over the whole screen while the plugin reads the forecast or Windy's layers.
     It also stops stray clicks on the map, which would disturb the reading. -->
<div class="wo pp" use:toBody>
    <div class="wo__card">
        <div class="wo__title">⏳ {job.title}</div>
        {#each job.steps as s}
            {@const pct = s.total ? Math.round((100 * s.done) / s.total) : 0}
            <div class="wo__step" class:wait={!s.total && !s.done}>
                <div class="wo__label"><span>{s.label}</span><b>{s.total ? `${pct} %` : 'waiting'}</b></div>
                <div class="wo__bar"><i style="width:{pct}%" /></div>
            </div>
        {/each}
        {#if job.paused}<p class="wo__paused">⏸ {job.paused}</p>{/if}
        <p class="wo__note">
            <b>Please wait and don't click on the map, change layers or move the time slider</b> until this
            finishes: the plugin is moving Windy's time and layers itself. Your layer and time are put back at the end.
        </p>
        <button class="pp-btn" on:click={() => (job.signal.cancelled = true)}>Stop</button>
    </div>
</div>

<script lang="ts">
    import type { Work } from '../state';

    export let job: Work;

    function toBody(node: HTMLElement) {
        document.body.appendChild(node);
        return { destroy: () => node.remove() };
    }
</script>

<style lang="less">
    .wo__paused {
        background: #ffd28a;
        color: #000;
        border-radius: 4px;
        padding: 6px 8px;
        margin: 8px 0;
        font-size: 12px;
    }
    .wo {
        position: fixed;
        inset: 0;
        z-index: 100000;
        background: rgba(0, 0, 0, 0.35);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 90px;
    }
    .wo__card {
        width: 340px;
        background: var(--g-bg-1);
        box-shadow: var(--g-shadow);
        border-radius: 12px;
        color: var(--g-text-1);
        padding: 14px 16px;
        font: 13px var(--g-font);
    }
    .wo__title {
        font-size: 14px;
        font-weight: bold;
        margin-bottom: 8px;
    }
    .wo__step {
        margin-bottom: 8px;
        &.wait {
            opacity: 0.55;
        }
    }
    .wo__label {
        display: flex;
        justify-content: space-between;
        margin-bottom: 2px;
    }
    .wo__bar {
        height: 8px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        overflow: hidden;
        i {
            display: block;
            height: 100%;
            background: #3fa9ff;
            transition: width 0.3s;
        }
    }
    .wo__note {
        font-size: 11px;
        color: #ffd28a;
        margin: 8px 0;
    }
</style>
