<!-- Date and time in UTC, always 24-hour, set with an explicit OK button.
     The editor opens IN PLACE (it pushes the content below down, never covers other settings),
     with separate Day / Month / Year / Hour / Minute boxes: no browser date picker, whose look and
     day/month order depend on the computer's settings. -->
<div class="dtf" class:inline>
    <button type="button" class="dtf__value" class:empty={value == null} class:fixed class:open on:click={toggle} title={title || 'Click to set (UTC, 24-hour)'}>
        {#if inline}{fixed ? '📌 ' : ''}{value == null ? '—' : fmtShort(value)}{:else}{value == null ? 'Not set: click to set' : `${fmtFull(value)} UTC`} ✎{/if}
    </button>
    {#if open}
        <div class="dtf__pop">
            <div class="dtf__row">
                <label>Day<select class="dtf-day" bind:value={day}>{#each DAYS as v}<option value={v}>{pad(v)}</option>{/each}</select></label>
                <label>Month<select class="dtf-mon" bind:value={mon}>{#each MONTHS as m, i}<option value={i}>{m}</option>{/each}</select></label>
                <label>Year<select class="dtf-year" bind:value={year}>{#each years as y}<option value={y}>{y}</option>{/each}</select></label>
            </div>
            <div class="dtf__row">
                <label>Hour (00–23)<select class="dtf-hour" bind:value={hh}>{#each HOURS as v}<option value={v}>{pad(v)}</option>{/each}</select></label>
                <label>Minute<select class="dtf-min" bind:value={mm}>{#each MINUTES as v}<option value={v}>{pad(v)}</option>{/each}</select></label>
                <span class="dtf__utc">UTC</span>
            </div>
            <div class="dtf__row dtf__steps">
                <button type="button" on:click={() => step(-24 * 60)} title="One day earlier">−1 day</button>
                <button type="button" on:click={() => step(-60)} title="One hour earlier">−1 h</button>
                <button type="button" on:click={() => step(60)} title="One hour later">+1 h</button>
                <button type="button" on:click={() => step(24 * 60)} title="One day later">+1 day</button>
                <button type="button" on:click={now} title="The current time, rounded to the minute">Now</button>
            </div>
            <div class="dtf__preview">Will be set to: <b>{fmtFull(picked)} UTC</b></div>
            <div class="dtf__row">
                <button type="button" class="pp-btn dtf__ok" on:click={ok}>OK</button>
                <button type="button" class="pp-btn pp-btn--ghost" on:click={() => (open = false)}>Cancel</button>
                {#if value != null && clearable}<button type="button" class="pp-btn pp-btn--ghost" on:click={clear}>{clearLabel}</button>{/if}
            </div>
        </div>
    {/if}
</div>

<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    /** UTC milliseconds, or null */
    export let value: number | null;
    /** Compact, for a table cell */
    export let inline = false;
    /** Shown highlighted with a pin (a time the user fixed) */
    export let fixed = false;
    export let title = '';
    export let clearable = true;
    export let clearLabel = 'Clear';

    const dispatch = createEventDispatcher<{ change: number | null }>();
    const pad = (n: number) => String(n).padStart(2, '0');
    const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const DAYS = range(1, 31);
    const HOURS = range(0, 23);
    const MINUTES = range(0, 59);
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let open = false;
    let day = 1;
    let mon = 0;
    let year = new Date().getUTCFullYear();
    let hh = 0;
    let mm = 0;

    $: years = range(Math.min(year, new Date().getUTCFullYear() - 1), Math.max(year, new Date().getUTCFullYear() + 2));
    // Day beyond the end of the month (e.g. 31 Feb) rolls back to the last day
    $: picked = Date.UTC(year, mon, Math.min(day, new Date(Date.UTC(year, mon + 1, 0)).getUTCDate()), hh, mm);

    function fmtFull(ms: number): string {
        const t = new Date(ms);
        return `${pad(t.getUTCDate())} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
    }
    const fmtShort = (ms: number) => fmtFull(ms).replace(/ \d{4} /, ' ');

    function load(ms: number) {
        const t = new Date(ms);
        day = t.getUTCDate();
        mon = t.getUTCMonth();
        year = t.getUTCFullYear();
        hh = t.getUTCHours();
        mm = t.getUTCMinutes();
    }

    function toggle() {
        if (open) {
            open = false;
            return;
        }
        load(value ?? Math.ceil(Date.now() / 3600e3) * 3600e3);
        open = true;
    }

    const step = (minutes: number) => load(picked + minutes * 60e3);
    const now = () => load(Math.floor(Date.now() / 60e3) * 60e3);

    function ok() {
        dispatch('change', picked);
        open = false;
    }

    function clear() {
        dispatch('change', null);
        open = false;
    }
</script>

<style lang="less">
    .dtf {
        position: relative;
    }
    .dtf__value {
        width: 100%;
        text-align: left;
        background: rgba(0, 0, 0, 0.35);
        color: inherit;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 3px;
        padding: 4px 6px;
        font: 13px monospace;
        cursor: pointer;
        &.empty {
            color: #ffb3b3;
            font-family: inherit;
        }
        &.open {
            border-color: #3fa9ff;
        }
    }
    .dtf__pop {
        margin-top: 4px;
        background: #1e1e1e;
        border: 2px solid #3fa9ff;
        border-radius: 6px;
        padding: 8px;
        font-size: 12px;
    }
    .dtf__row {
        display: flex;
        gap: 6px;
        align-items: flex-end;
        margin-bottom: 6px;
        flex-wrap: wrap;
        label {
            display: flex;
            flex-direction: column;
            font-size: 11px;
            opacity: 0.95;
        }
        select {
            font-size: 14px;
            padding: 3px 4px;
            min-width: 58px;
            background: #2b2b2b;
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.35);
            border-radius: 3px;
        }
    }
    .dtf__utc {
        font-weight: bold;
        padding-bottom: 5px;
    }
    .dtf__steps button {
        background: #2b2b2b;
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 3px;
        padding: 3px 7px;
        font-size: 12px;
        cursor: pointer;
    }
    .dtf__preview {
        margin: 2px 0 8px;
        font-size: 12px;
        b {
            color: #ffd400;
            font-family: monospace;
            font-size: 13px;
        }
    }
    .dtf__ok {
        min-width: 70px;
        font-weight: bold;
    }
    .inline {
        .dtf__value {
            width: auto;
            padding: 1px 4px;
            font-size: 11px;
            white-space: nowrap;
            &.empty {
                color: inherit;
            }
            &.fixed {
                background: rgba(255, 212, 0, 0.22);
                border-color: #ffd400;
                font-weight: bold;
            }
        }
        .dtf__pop {
            padding: 6px;
            white-space: normal;
            width: 250px;
        }
    }
</style>
