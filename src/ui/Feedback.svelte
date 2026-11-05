<!-- Send a suggestion or report a problem to the developer by email (the user's own email app). -->
<div class="fb g-card">
    <p class="fb__lead">
        <b>Your suggestions are valuable to mariners worldwide.</b> Every idea and every problem you report
        helps make passage planning easier and safer at sea.
    </p>
    {#if !open}
        <div class="fb__buttons">
            <button class="pp-btn g-btn--primary" on:click={() => start('suggestion')}><Icon name="mail" size={15} /> Send a suggestion</button>
            <button class="pp-btn" on:click={() => start('problem')}><Icon name="bug" size={15} /> Report a problem</button>
            <button class="pp-btn pp-btn--ghost" on:click={() => saveLog()} title="Saves what the plugin did (UTC times) as a file to attach to a report. Help → Usage: options and the last entries"><Icon name="log" size={15} /> Save activity log</button>
        </div>
    {:else}
        <div class="fb__form">
            <label>
                <select bind:value={kind}>
                    <option value="suggestion">Suggestion</option>
                    <option value="problem">Problem / bug</option>
                </select>
            </label>
            <textarea rows="5" bind:value={text} placeholder={kind === 'problem' ? 'What happened? What did you expect? What were you doing just before?' : 'What would make this plugin more useful on board?'} />
            <label class="check">
                <input type="checkbox" bind:checked={tech} />
                Add technical details (plugin version, browser, screen size). No route, ship or position data is added.
            </label>
            <div class="fb__buttons">
                <a class="pp-btn" href={mailto} target="_blank" rel="noopener" on:click={sent}>✉ Open in my email</a>
                <button class="pp-btn pp-btn--ghost" on:click={copy}>Copy text</button>
                <button class="pp-btn pp-btn--ghost" on:click={() => (open = false)}>Cancel</button>
            </div>
            <p class="pp-note">
                Opens your own email program with the message ready to send to <b>{EMAIL}</b>. If nothing opens
                (e.g. webmail only), press <b>Copy text</b> and paste it into an email to that address.
                {#if kind === 'problem'}<br />Tip: press <button class="lnk" on:click={() => saveLog()}>📋 Save activity log</button> and attach the file to the email: it shows what the plugin did.{/if}
                {#if note}<br /><b>{note}</b>{/if}
            </p>
        </div>
    {/if}
    <div class="fb__foot">
        {config.title.split(' – ')[0]} v{config.version} · <button class="lnk" on:click={() => checkForUpdates(true)}>Check for updates</button>{#if $updateStatus} ({$updateStatus}){/if}
        · Free to use · {EMAIL}
    </div>
</div>

<script lang="ts">
    import Icon from './base/Icon.svelte';
    import config from '../pluginConfig';
    import { saveLog } from './saveLog';
    import { checkForUpdates, updateStatus } from '../windy/updates';

    const EMAIL = 'nodecentral1990@gmail.com';
    let open = false;
    let kind: 'suggestion' | 'problem' = 'suggestion';
    let text = '';
    let tech = true;
    let note = '';

    function start(k: typeof kind) {
        kind = k;
        tech = k === 'problem';
        note = '';
        open = true;
    }

    $: subject = `${config.title} v${config.version}: ${kind === 'problem' ? 'problem report' : 'suggestion'}`;
    $: body =
        `${text.trim() || '(write here)'}\n\n` +
        (tech
            ? `---\nPlugin: ${config.name} ${config.version}\nBrowser: ${navigator.userAgent}\nScreen: ${window.innerWidth}×${window.innerHeight}\nTime (UTC): ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n`
            : '');
    $: mailto = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    function sent() {
        note = 'Thank you! Send the email from your email program to finish.';
    }

    async function copy() {
        const all = `To: ${EMAIL}\nSubject: ${subject}\n\n${body}`;
        try {
            await navigator.clipboard.writeText(all);
            note = `Copied. Paste it into an email to ${EMAIL}. Thank you!`;
        } catch {
            note = `Copy was blocked by the browser: please select the text above and copy it by hand.`;
        }
    }
</script>

<style lang="less">
    .lnk {
        background: none;
        border: 0;
        color: #9fd3ff;
        text-decoration: underline;
        cursor: pointer;
        padding: 0;
        font: inherit;
    }
    .fb {
        font-size: 12px;
    }
    .fb__lead {
        margin: 0 0 6px;
        background: var(--g-accent-soft);
        border-left: 3px solid var(--g-accent);
        border-radius: 0 6px 6px 0;
        padding: 5px 8px;
        border-radius: 3px;
    }
    .fb__buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 4px 0;
        a.pp-btn {
            text-decoration: none;
            display: inline-block;
        }
    }
    .fb__form {
        display: flex;
        flex-direction: column;
        gap: 4px;
        textarea {
            width: 100%;
            box-sizing: border-box;
            font: 12px sans-serif;
            background: rgba(0, 0, 0, 0.35);
            color: inherit;
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 3px;
            padding: 4px;
        }
    }
    .check {
        display: flex;
        gap: 4px;
        align-items: flex-start;
    }
    .fb__foot {
        opacity: 0.7;
        margin-top: 4px;
    }
</style>
