<!-- One settings group, drawn by its one component (UI reimagine, owner 2026-11-13). The Settings tab and every gear
     use this, so there is never a second copy of a field. `part` shows only one piece of the big groups. -->
<div class="g-set" data-set={id}>
    {#if id === 'ship'}
        <ShipTab {part} />
    {:else if id === 'motion'}
        <MotionSettings {part} />
    {:else if id === 'speed'}
        <SpeedSettings {part} />
    {:else if id === 'limits'}
        <LimitsTab {part} />
    {:else if id === 'polar'}
        <PolarSettings />
    {:else if id === 'map'}
        <MapDisplaySettings {part} />
    {:else if id === 'route'}
        <RouteEditSettings />
    {:else if id === 'weather'}
        <WeatherReadSettings />
    {:else if id === 'charts'}
        <ChartSettings />
    {:else if id === 'wavechart'}
        <WaveChartSettings />
    {:else if id === 'optimise'}
        <OptimiseSettings />
    {:else if id === 'speedplan'}
        <SpeedPlanSettings />
    {:else if id === 'drift'}
        <DriftSettings />
    {:else if id === 'updates'}
        <UpdateSettings />
    {:else if id === 'log'}
        <LogSettings />
    {/if}
</div>

<script lang="ts">
    import ShipTab from '../ShipTab.svelte';
    import SpeedSettings from '../SpeedSettings.svelte';
    import LimitsTab from '../LimitsTab.svelte';
    import MapDisplaySettings from '../MapDisplaySettings.svelte';
    import MotionSettings from '../MotionSettings.svelte';
    import WaveChartSettings from '../WaveChartSettings.svelte';
    import PolarSettings from './PolarSettings.svelte';
    import RouteEditSettings from './RouteEditSettings.svelte';
    import WeatherReadSettings from './WeatherReadSettings.svelte';
    import ChartSettings from './ChartSettings.svelte';
    import OptimiseSettings from './OptimiseSettings.svelte';
    import SpeedPlanSettings from './SpeedPlanSettings.svelte';
    import DriftSettings from './DriftSettings.svelte';
    import UpdateSettings from './UpdateSettings.svelte';
    import LogSettings from './LogSettings.svelte';

    /** Group id from ui/settings/registry.ts */
    export let id: string;
    /** One piece of the group, or null for all of it */
    export let part: string | null = null;
</script>
