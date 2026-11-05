<!-- A full-window panel over the map (moved to <body>, outside Windy's side panel). Esc closes it. -->
<div class="pp pp-overlay" use:portal>
    <div class="pp-overlay__head">
        <slot name="head" />
        <button class="pp-btn" on:click={onClose}>Close ✕</button>
    </div>
    <div class="pp-overlay__body">
        <slot />
    </div>
</div>

<script lang="ts">
    export let onClose: () => void;

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
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
    .pp-overlay__head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        button {
            margin-left: auto;
        }
    }
    .pp-overlay__body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }
</style>
