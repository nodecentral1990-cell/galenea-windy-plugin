<!-- The 7 steps to install a version by hand (as in windy/INSTALL.md), with the link and a copy button. -->
<ol class="steps">
    <li>Open <b>www.windy.com</b> and log in.</li>
    <li>Click the <b>menu (☰)</b> → <b>Install Windy Plugin</b>.</li>
    <li>Scroll to <b>Load plugin directly from URL</b>.</li>
    <li>
        Click in the box, press <b>⌘A</b> (Mac) / <b>Ctrl+A</b> (PC) to clear the old text, then paste this link:
        <div class="link"><code>{url}</code> <button class="pp-btn pp-btn--ghost small" on:click={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button></div>
    </li>
    <li>Click <b>Install untrusted plugin</b>.</li>
    <li>Open it from Windy's <b>menu (☰)</b> → <b>{config.title}</b>.</li>
    <li>If the old version still shows: reload the page (⌘R / Ctrl+R) and open the plugin again.</li>
</ol>

<script lang="ts">
    import config from '../pluginConfig';
    import { pluginUrl } from '../windy/updates';

    export let version: string;
    $: url = pluginUrl(version);
    let copied = false;
    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            copied = true;
        } catch {
            prompt('Copy this link:', url);
        }
    }
</script>

<style lang="less">
    .steps {
        margin: 6px 0;
        padding-left: 20px;
        font-size: 11.5px;
    }
    .link {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
        margin: 3px 0;
        code {
            word-break: break-all;
            font-size: 10.5px;
        }
    }
    .small {
        padding: 1px 6px;
        font-size: 10px;
    }
</style>
