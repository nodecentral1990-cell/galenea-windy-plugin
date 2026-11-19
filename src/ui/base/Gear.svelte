<!-- The small gear beside a function (owner, 2026-11-13: "placing a small gear icon next to the function").
     In the pane it opens the settings group in place (SettingsFold with the same `host` name); on a floating window
     (`win`) it opens the one floating settings window. The Settings tab still has everything. -->
<button
    type="button"
    class="g-ibtn g-ibtn--s g-gear"
    class:g-gear--line={line}
    class:is-on={open}
    bind:this={btn}
    data-g="gear"
    data-gear={chips[0]?.id}
    aria-label={label}
    aria-expanded={open}
    title={label}
    on:click|stopPropagation={press}
    on:keydown={onKey}><Icon name="gear" size={line ? 14 : 16} /></button
>

<script lang="ts">
    import Icon from './Icon.svelte';
    import { closeFold, fold, openSetWin, setWin, toggleFold, type Chip } from '../settings/foldState';
    import { groupInfo } from '../settings/registry';

    /** Name of the fold-out place this gear opens (a SettingsFold with the same host sits where it should unfold) */
    export let host = '';
    /** The group (first) and any others offered as chips */
    export let chips: Chip[];
    /** Smaller, for the end of a line of text */
    export let line = false;
    /** On a floating window: open the floating settings window instead of a fold-out */
    export let win = false;

    let btn: HTMLButtonElement;
    $: label = `Settings: ${groupInfo(chips[0]?.id)?.title ?? ''}`;
    $: open = win ? !!$setWin && $setWin.chips[0]?.id === chips[0]?.id : !!$fold && $fold.host === host && $fold.chips[0]?.id === chips[0]?.id && $fold.chips[0]?.part === chips[0]?.part;

    function press() {
        if (win) {
            if (open) setWin.set(null);
            else openSetWin(chips, btn.closest('.pp, .g-fw') ?? btn);
        } else toggleFold(host, chips, btn);
    }
    function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape' && open) {
            e.stopPropagation();
            if (win) setWin.set(null);
            else closeFold();
        }
    }
</script>
