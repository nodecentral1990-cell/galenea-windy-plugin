<!-- The one floating settings window, for gears on the windows over the map (ship window, map keys, weather bar,
     full-size tables) (owner, 2026-11-13). Same group component as the Settings tab. Moves, resizes, minimises,
     original size, closes like every floating window (ui/floatWin.ts); Esc closes. Computer only. -->
{#if st}
    <div class="pp g-setwin" data-g-dim={$panelDim ? '' : null} use:toBody use:floating={{ key: 'settings-win', head: '.g-setwin__head', minW: 300, minH: 120, onClose: closeSetWin, closeTitle: 'Close (Esc)' }} style="--sw-x:{st.x}px;--sw-y:{st.y}px" role="dialog" aria-label={`Settings: ${info?.title ?? ''}`}>
        <div class="g-setwin__head">
            <Icon name="gear" size={15} />
            <b class="g-setwin__title g-fw__title">{info?.title ?? ''}</b>
        </div>
        {#if st.chips.length > 1}
            <div class="g-fold__chips" role="tablist">
                {#each st.chips as c, i}
                    <button type="button" role="tab" class="g-fold__chip" class:is-on={i === st.idx} aria-selected={i === st.idx} on:click={() => setWin.update(s => (s ? { ...s, idx: i, whole: false } : s))}>{c.label ?? groupInfo(c.id)?.short ?? c.id}</button>
                {/each}
            </div>
        {/if}
        <div class="g-setwin__body pp-scroll">
            {#key `${chip?.id}:${part}`}
                <SettingsGroup id={chip?.id ?? ''} {part} />
            {/key}
            <div class="g-setwin__foot">
                {#if part}<button type="button" class="g-btn g-btn--s g-btn--ghost" on:click={() => setWin.update(s => (s ? { ...s, whole: true } : s))}>More in {info?.title}</button>{/if}
                <button type="button" class="g-btn g-btn--s g-btn--ghost g-fold__all" on:click={all} title="Open this group in the Settings tab, where every setting is">All settings</button>
            </div>
        </div>
    </div>
{/if}

<script lang="ts">
    import Icon from '../base/Icon.svelte';
    import SettingsGroup from './SettingsGroup.svelte';
    import { closeSetWin, setWin } from './foldState';
    import { groupInfo } from './registry';
    import { goSettings } from '../nav';
    import { floating } from '../floatWin';
    import { panelDim } from '../../state';

    $: st = $setWin;
    $: chip = st ? st.chips[st.idx] : null;
    $: info = chip ? groupInfo(chip.id) : undefined;
    $: part = st && chip && !st.whole ? (chip.part ?? null) : null;

    function toBody(node: HTMLElement) {
        document.body.appendChild(node);
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            const t = e.target as HTMLElement | null;
            // Esc in a pop-up of the pane (date box, ⓘ) belongs to that pop-up
            if (t?.closest?.('.g-pop, .dtf__pop')) return;
            // this window first: a full-size table open under it stays (it closes with the next Esc)
            e.stopPropagation();
            closeSetWin();
        };
        document.addEventListener('keydown', onKey, true);
        return {
            destroy() {
                document.removeEventListener('keydown', onKey, true);
                node.remove();
            },
        };
    }
    function all() {
        const id = chip?.id;
        if (id) goSettings(id);
    }
</script>
