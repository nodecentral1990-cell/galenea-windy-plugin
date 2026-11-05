<!-- ⓘ button (UI overhaul 2026-11-02, owner: "compact the hints in an i kind of button"). The explanation opens in a
     small pop-over on click (not on hover), one at a time; Esc, a click outside or scrolling closes it. -->
<button
    type="button"
    class="g-hint"
    class:is-open={open}
    bind:this={btn}
    aria-label={`About: ${title}`}
    aria-expanded={open}
    aria-haspopup="dialog"
    title={`About: ${title}`}
    on:click|stopPropagation={toggle}><Icon name="info" size={size} /></button
>
{#if open}
    <div class="g-pop" role="dialog" aria-label={title} use:portal style="left:{x}px;top:{y}px;width:{w}px" on:click|stopPropagation on:keydown={onKey}>
        <div class="g-pop__head">
            <span class="g-pop__title">{title}</span>
            <button type="button" class="g-pop__x" aria-label="Close" on:click={close}>✕</button>
        </div>
        <div class="g-pop__body"><slot /></div>
    </div>
{/if}

<script context="module" lang="ts">
    // only one hint open at a time
    let closeOpen: (() => void) | null = null;
</script>

<script lang="ts">
    import { onDestroy, tick } from 'svelte';
    import Icon from './Icon.svelte';
    import { logEvent } from '../../lib/activityLog';

    export let title: string;
    export let size = 16;
    /** Preferred width of the pop-over, px */
    export let width = 340;

    let open = false;
    let btn: HTMLButtonElement;
    let x = 0;
    let y = 0;
    let w = width;
    let scroll0 = 0;

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        // keep it inside the plugin pane (or the window) and flip above when there is no room below
        requestAnimationFrame(() => {
            const h = node.offsetHeight;
            const r = btn.getBoundingClientRect();
            if (r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h > 8) y = r.top - 6 - h;
        });
        return { destroy: () => node.remove() };
    }

    async function place() {
        const r = btn.getBoundingClientRect();
        const pane = (btn.closest('.pp') as HTMLElement | null)?.getBoundingClientRect();
        const left = Math.max(8, (pane?.left ?? 0) + 8);
        const right = Math.min(window.innerWidth - 8, (pane ? pane.right : window.innerWidth) - 8);
        w = Math.max(220, Math.min(width, right - left));
        x = Math.max(left, Math.min(r.left - 12, right - w));
        y = r.bottom + 6;
        await tick();
    }
    async function toggle() {
        if (open) return close();
        closeOpen?.();
        await place();
        open = true;
        closeOpen = close;
        scroll0 = window.scrollY;
        setTimeout(() => {
            window.addEventListener('click', close);
            window.addEventListener('keydown', onKey);
            window.addEventListener('scroll', onScroll, true);
        });
        logEvent('ui', `Hint opened: ${title}`);
    }
    function close() {
        if (!open) return;
        open = false;
        if (closeOpen === close) closeOpen = null;
        window.removeEventListener('click', close);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('scroll', onScroll, true);
    }
    function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            close();
            btn?.focus();
        }
    }
    let lastScrollTop: number | null = null;
    function onScroll(e: Event) {
        const t = e.target as HTMLElement | Document;
        if (t instanceof HTMLElement && t.closest('.g-pop')) return;
        const top = t instanceof HTMLElement ? t.scrollTop : window.scrollY;
        if (lastScrollTop == null) lastScrollTop = top;
        if (Math.abs(top - lastScrollTop) > 40 || Math.abs(window.scrollY - scroll0) > 40) close();
    }
    onDestroy(close);
</script>
