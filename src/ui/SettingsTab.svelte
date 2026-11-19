<!-- All settings in one place, in folding groups, so the working tabs stay clean. Every group is drawn through
     ui/settings/SettingsGroup.svelte, the same component a gear beside a function shows in place (owner, 2026-11-13). -->
<div class="st-search">
    <Icon name="search" size={15} />
    <input type="search" class="st-search__in" placeholder="Search the settings (e.g. barred, roll period, colour)" aria-label="Search the settings" bind:value={query} />
    {#if query}<button type="button" class="g-ibtn g-ibtn--s" aria-label="Clear the search" title="Clear the search" on:click={() => (query = '')}><Icon name="x" size={14} /></button>{/if}
</div>
<div class="st-index" aria-label="Settings groups">
    {#each shown as sec}
        <button class="st-chip" class:is-on={$openSections.includes(sec.id)} on:click={() => jump(sec.id)} title={sec.hint}><Icon name={sec.icon} size={14} />{sec.short}</button>
    {/each}
    <button class="st-chip st-chip--ghost" on:click={closeAll} title="Close all groups">Close all</button>
    <Hint title="Settings"><p><b>Every setting is here</b>, in folding groups. A gear beside a function shows the same setting there, so you rarely need to come here.</p><p>Settings are saved in this browser on this computer; "Save ship profile" (Ship particulars) writes a file you can take to another computer.</p></Hint>
</div>
{#if query && !shown.length}<div class="g-status">No setting found for "{query}". Try another word, or clear the search.</div>{/if}

{#each shown as sec (sec.id)}
    <details id="st-{sec.id}" open={!!query || $openSections.includes(sec.id)} on:toggle={e => toggle(sec.id, e)}>
        <summary><Icon name={sec.icon} size={16} /><span class="st-title">{sec.title}</span><span class="hint">{sec.hint}</span><span class="st-chev"><Icon name="chevronDown" size={16} /></span></summary>
        <div class="body">
            {#if sec.usedIn.length}
                <div class="st-used">Used in: {#each sec.usedIn as u, i}{i ? ' · ' : ''}<button type="button" class="st-used__link" on:click={() => goScreen({ tab: u.tab, seg: u.seg })}>{u.label}</button>{/each}</div>
            {/if}
            <SettingsGroup id={sec.id} />
        </div>
    </details>
{/each}

<script lang="ts">
    import { onMount, tick } from 'svelte';
    import Hint from './base/Hint.svelte';
    import Icon from './base/Icon.svelte';
    import SettingsGroup from './settings/SettingsGroup.svelte';
    import { searchGroups } from './settings/registry';
    import { goScreen } from './nav';

    let query = '';
    $: shown = searchGroups(query);

    async function jump(id: string) {
        openSections.update(l => [...new Set([...l, id])]);
        await tick();
        document.getElementById(`st-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    function closeAll() {
        openSections.set([]);
    }
    /** Which groups are open (kept while the plugin is open) */
    const openSections = OPEN;
    function toggle(id: string, e: Event) {
        if (query) return; // while searching, every group found is shown open
        const open = (e.currentTarget as HTMLDetailsElement).open;
        openSections.update(l => (open ? [...new Set([...l, id])] : l.filter(x => x !== id)));
    }
    // asked for from a gear or a button elsewhere: bring the group into view once the tab is drawn
    onMount(() => {
        scrollToPending();
    });
</script>

<script lang="ts" context="module">
    import { writable as w } from 'svelte/store';
    const OPEN = w<string[]>(['ship']);
    let pending: string | null = null;
    function scrollToPending(): void {
        const id = pending;
        if (!id) return;
        // after the group has been drawn (and the others closed)
        setTimeout(() => {
            const el = document.getElementById(`st-${id}`);
            if (!el) return;
            pending = null;
            try {
                el.scrollIntoView({ block: 'start' });
            } catch {
                /* stays where it is */
            }
        }, 30);
    }
    /**
     * Open one settings group and bring it into view (0.26: it used to open the group without scrolling to it, so
     * the user landed at the top of Settings and had to hunt). `only` closes the other groups.
     */
    export function openSettingsSection(id: string, only = false): void {
        OPEN.update(l => (only ? [id] : [...new Set([...l, id])]));
        pending = id;
        scrollToPending();
    }
</script>

<style lang="less">
    .st-search {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 8px;
        color: var(--g-text-3);
    }
    .st-search__in {
        flex: 1;
        min-width: 0;
    }
    .st-used {
        font-size: 12px;
        color: var(--g-text-3);
        margin: -2px 0 8px;
    }
    .st-used__link {
        border: 0;
        background: none;
        padding: 0;
        color: var(--g-accent-hover);
        font: inherit;
        cursor: pointer;
        text-decoration: underline;
    }
    .st-index {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin: 0 0 10px;
        align-items: center;
    }
    .st-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 26px;
        padding: 0 8px;
        border-radius: 13px;
        border: 1px solid var(--g-border);
        background: var(--g-bg-1);
        color: var(--g-text-2);
        font: 500 12px var(--g-font);
        cursor: pointer;
        &:hover {
            border-color: var(--g-border-strong);
            color: var(--g-text-1);
        }
        &.is-on {
            border-color: var(--g-accent);
            color: var(--g-text-1);
            background: var(--g-accent-soft);
        }
        &.st-chip--ghost {
            background: transparent;
            border-color: transparent;
        }
    }
    details {
        border: 1px solid var(--g-border);
        border-radius: 8px;
        margin: 0 0 8px;
        background: var(--g-bg-1);
        scroll-margin-top: 8px;
    }
    summary {
        cursor: pointer;
        padding: 10px 12px;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        list-style: none;
        color: var(--g-text-1);
        &::-webkit-details-marker {
            display: none;
        }
        &:hover {
            background: rgba(255, 255, 255, 0.03);
        }
    }
    .st-title {
        font-weight: 650;
        white-space: nowrap;
    }
    .st-chev {
        margin-left: auto;
        color: var(--g-text-3);
        transition: transform 0.15s;
        display: inline-flex;
    }
    details[open] .st-chev {
        transform: rotate(180deg);
    }
    details[open] summary {
        border-bottom: 1px solid var(--g-border);
    }
    .hint {
        font-weight: normal;
        font-size: 12px;
        color: var(--g-text-3);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }
    .body {
        padding: 10px 12px 12px;
    }
</style>
