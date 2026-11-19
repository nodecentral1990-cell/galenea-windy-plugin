<!-- A settings group shown in place, under the card head or the line whose gear was pressed (owner, 2026-11-13).
     An ordinary block in the flow of the pane: nothing floats, nothing is positioned (the pane must scroll).
     Closes by the gear again, Done, Esc, another gear, or leaving the section; not by a click elsewhere, so the
     table, the diagram and the map stay usable while it is open. Changes are saved as they are made. -->
{#if st}
    <div class="g-fold" role="group" aria-label={`Settings: ${info?.title ?? ''}`} bind:this={el} on:keydown={onKey}>
        <div class="g-fold__head">
            <Icon name="gear" size={15} />
            <b class="g-fold__title">{info?.title ?? ''}</b>
            <span class="g-fold__tools">
                <button type="button" class="g-btn g-btn--s g-btn--ghost g-fold__all" on:click={all} title="Open this group in the Settings tab, where every setting is">All settings</button>
                <button type="button" class="g-btn g-btn--s g-fold__done" on:click={() => closeFold()} title="Close (Esc)"><Icon name="check" size={14} /> Done</button>
            </span>
        </div>
        {#if st.chips.length > 1}
            <div class="g-fold__chips" role="tablist" aria-label="Settings for this">
                {#each st.chips as c, i}
                    <button type="button" role="tab" class="g-fold__chip" class:is-on={i === st.idx} aria-selected={i === st.idx} on:click={() => pick(i)}>{c.label ?? groupInfo(c.id)?.short ?? c.id}</button>
                {/each}
            </div>
        {/if}
        <div class="g-fold__body pp-scroll">
            {#key `${chip?.id}:${part}`}
                <SettingsGroup id={chip?.id ?? ''} {part} />
            {/key}
            {#if part}
                <button type="button" class="g-btn g-btn--s g-btn--ghost g-fold__more" on:click={() => fold.update(f => (f ? { ...f, whole: true } : f))}>More in {info?.title}</button>
            {/if}
        </div>
        {#if $phone}
            <div class="g-fold__foot"><button type="button" class="g-btn g-fold__done" on:click={() => closeFold()}><Icon name="check" size={15} /> Done</button></div>
        {/if}
    </div>
{/if}

<script lang="ts">
    import { onDestroy, tick } from 'svelte';
    import Icon from '../base/Icon.svelte';
    import SettingsGroup from './SettingsGroup.svelte';
    import { closeFold, fold } from './foldState';
    import { groupInfo } from './registry';
    import { goSettings } from '../nav';
    import { phone } from '../../state';
    import { bringToTop } from '../phoneSafe';

    /** The place this fold-out belongs to; the gear with the same host opens it */
    export let host: string;

    let el: HTMLElement | null = null;
    $: st = $fold && $fold.host === host ? $fold : null;
    $: chip = st ? st.chips[st.idx] : null;
    $: info = chip ? groupInfo(chip.id) : undefined;
    $: part = st && chip && !st.whole ? (chip.part ?? null) : null;

    // on opening: bring it into view and put the keyboard focus on its first field
    let wasOpen = false;
    $: if (!!st !== wasOpen) {
        wasOpen = !!st;
        if (st) opened();
    }
    async function opened() {
        await tick();
        try {
            // keep room under it for the table or diagram being adjusted: when it would end near the bottom of the
            // screen (or is cut off), bring it up under its card head
            const r = el?.getBoundingClientRect();
            // phones: under the section bar that stays at the top, moving only the panel's own scroll position
            if (r && $phone) bringToTop(el) || el?.scrollIntoView({ block: 'start' });
            else if (r && (r.top < 0 || r.bottom > window.innerHeight - 240)) el?.scrollIntoView({ block: 'start' });
            (el?.querySelector('.g-fold__body input, .g-fold__body select, .g-fold__body button') as HTMLElement | null)?.focus({ preventScroll: true });
        } catch {
            /* still open, just not focused */
        }
    }
    function pick(i: number) {
        fold.update(f => (f ? { ...f, idx: i, whole: false } : f));
    }
    function all() {
        const id = chip?.id;
        closeFold(false);
        if (id) goSettings(id);
    }
    function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closeFold();
        }
    }
    // leaving the section closes it
    onDestroy(() => {
        if ($fold && $fold.host === host) closeFold(false);
    });
</script>
