<!-- A full-window panel over the map (moved to <body>, outside Windy's side panel). Esc closes it.
     Floating window (owner, 2026-11-13): drag the title bar to move, the right / bottom edge or corner to resize,
     – minimise, ↺ original size, Close. -->
<div class="pp pp-overlay" use:portal use:floating={{ key, head: '.pp-overlay__head', buttons: { min: true, reset: true, close: false }, minW: 320, minH: 160, fixedHeight: true }}>
    <div class="pp-overlay__head">
        <!-- phones (owner's report, 2026-11-19): the window covers the whole screen, so the way back is a big button at
             the top left (shown by the stylesheet on phones only), below the phone's status bar -->
        <button type="button" class="g-btn g-back" on:click={onClose} title="Close this and go back to the plugin"><Icon name="back" size={18} /> Back</button>
        <span class="pp-overlay__title"><slot name="head" /></span>
        <button class="pp-btn g-fw__end" on:click={onClose}>Close <Icon name="x" size={13} /></button>
    </div>
    <div class="pp-overlay__body">
        <slot />
    </div>
</div>

<script lang="ts">
    import { floating } from './floatWin';
    import Icon from './base/Icon.svelte';
    import { updateSafeTop } from './phoneSafe';

    export let onClose: () => void;
    /** Place and size are remembered under this name */
    export let key = 'fullwin';

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        updateSafeTop();
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        return {
            destroy() {
                document.removeEventListener('keydown', onKey);
                node.remove();
            },
        };
    }
</script>

<style lang="less">
    .pp-overlay {
        position: fixed;
        inset: 40px;
        z-index: 99999;
        background: rgb(35, 35, 35);
        color: #eee;
        border-radius: 8px;
        box-shadow: 0 6px 30px rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        padding: 10px;
        font-size: 12px;
    }
    /* on a computer the title's parts lie straight in the bar, as before; phones: see ui/theme.ts */
    .pp-overlay__title {
        display: contents;
    }
    .pp-overlay__head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        > button {
            margin-left: auto;
        }
        :global(.g-fw__btns) {
            margin-left: auto;
        }
        :global(.g-fw__btns + button) {
            margin-left: 4px;
        }
    }
    .pp-overlay__body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }
</style>
