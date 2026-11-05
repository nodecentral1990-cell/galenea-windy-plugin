// Updates (owner, 2026-10-28): look for a newer published version of the plugin (button, and by
// itself every 30 days), say so, and install it with one click where Windy allows it.
// How: every published version has its own folder on Windy's plugin server; the plugin asks for
// the plugin.json of the next possible version numbers (e.g. 0.13.1, 0.14.0, 1.0.0) and follows
// them up to the newest. Install: Windy's own "install plugin from URL" function, which is not an
// official plugin API (checked in Windy's type files 2026-10-28) — if it is missing or refuses,
// the 7 manual steps are shown instead.

import { get, writable } from 'svelte/store';

import config from '../pluginConfig';
import { logEvent } from '../lib/activityLog';
import { compareVersions, nextCandidates } from '../lib/releaseNotes';

export const PLUGIN_BASE = 'https://windy-plugins.com/7865207/windy-plugin-passage-plan';
export const pluginUrl = (version: string) => `${PLUGIN_BASE}/${version}/plugin.min.js`;

const KEY = 'windy-plugin-passage-plan:updates';
const DAY = 24 * 3600e3;

interface Saved {
    auto: boolean;
    lastCheck: number;
    /** Newest version found at the last check */
    latest: string | null;
    latestBuilt: string | null;
    /** Version the user last opened (for "What's new" after an update) */
    seen: string | null;
    /** Update notice closed for this version */
    dismissed: string | null;
}
function load(): Saved {
    const d: Saved = { auto: true, lastCheck: 0, latest: null, latestBuilt: null, seen: null, dismissed: null };
    try {
        return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
        return d;
    }
}
export const updates = writable<Saved>(load());
updates.subscribe(s => {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
        /* not remembered */
    }
});
export const updateStatus = writable('');
export const updateBusy = writable(false);
/** Version installed in this page but not yet started (Windy must reload the page) (owner's report, 2026-10-30) */
export const installedPending = writable<string | null>(null);

/**
 * Reload Windy so the new version starts cleanly. Installing over the running copy left the old one
 * on screen and jumbled Windy's side panel (owner's report, 2026-10-30). Route and settings are kept
 * in this browser; the forecast is fetched again.
 */
export function reloadWindy(): void {
    logEvent('update', 'Reloading Windy to start the new version');
    setTimeout(() => location.reload(), 300); // let the log be saved first
}

/** plugin.json of a published version, or null when there is none */
async function published(version: string): Promise<{ version: string; builtReadable?: string } | null> {
    try {
        const r = await fetch(`${PLUGIN_BASE}/${version}/plugin.json`, { cache: 'no-store' });
        if (!r.ok) return null;
        const j = (await r.json()) as { version?: string; builtReadable?: string };
        return j && j.version === version ? { version, builtReadable: j.builtReadable } : null;
    } catch {
        return null;
    }
}

/** Look for a newer version. Returns it, or null when this is the newest. */
export async function checkForUpdates(manual = false): Promise<string | null> {
    if (get(updateBusy)) return null;
    updateBusy.set(true);
    updateStatus.set('Checking for updates…');
    try {
        let best: { version: string; builtReadable?: string } | null = null;
        let from: string = config.version;
        // follow the version numbers up (at most a few rounds)
        for (let round = 0; round < 6; round++) {
            const found = (await Promise.all(nextCandidates(from).map(published))).filter((x): x is NonNullable<typeof x> => !!x);
            if (!found.length) break;
            found.sort((a, b) => compareVersions(b.version, a.version));
            best = found[0];
            from = best.version;
        }
        updates.update(s => ({ ...s, lastCheck: Date.now(), latest: best?.version ?? null, latestBuilt: best?.builtReadable ?? null }));
        const msg = best
            ? `Version ${best.version} is available (you have ${config.version}).`
            : `You have the newest version (${config.version}). Checked ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`;
        updateStatus.set(msg);
        logEvent('update', `${manual ? 'Update check' : 'Automatic update check'}: ${msg}`);
        return best?.version ?? null;
    } finally {
        updateBusy.set(false);
    }
}

/** On opening: the automatic check, once every 30 days */
export function autoCheck(): void {
    const s = get(updates);
    if (s.auto && Date.now() - s.lastCheck > 30 * DAY) checkForUpdates(false).catch(() => {});
}

/** One-click install through Windy, if it lets the plugin do it; otherwise false (show the manual steps). */
export async function installUpdate(version: string): Promise<boolean> {
    if (get(installedPending) === version) {
        reloadWindy();
        return true;
    }
    if (get(updateBusy)) return false;
    const ext = (window as unknown as { W?: { externalPlugins?: { installExternalPlugin?: (url: string, by: string) => Promise<unknown> } } }).W?.externalPlugins;
    if (!ext?.installExternalPlugin) {
        updateStatus.set('Windy does not let the plugin install itself here: please use the steps below.');
        logEvent('update', 'One-click install not available (Windy function missing)');
        return false;
    }
    updateBusy.set(true);
    updateStatus.set(`Installing version ${version}…`);
    logEvent('update', `Installing ${version} with one click (from ${config.version})`, { url: pluginUrl(version) });
    try {
        await ext.installExternalPlugin(pluginUrl(version), 'url');
        installedPending.set(version);
        updateStatus.set(`Version ${version} installed. Windy must reload the page to start it (your route and settings are kept).`);
        logEvent('update', `Installed ${version} with one click`);
        updateBusy.set(false);
        if (confirm(`Version ${version} is installed.\n\nWindy must reload the page to start it. Your route and settings are kept; the forecast is fetched again.\n\nReload now?`)) reloadWindy();
        return true;
    } catch (err) {
        updateBusy.set(false);
        updateStatus.set(`Windy refused the one-click install (${(err as Error)?.message ?? err}): please use the steps below.`);
        logEvent('update', `One-click install of ${version} failed: ${(err as Error)?.message ?? err}`);
        return false;
    }
}
