// Phones (owner, 2026-11-25: "when we lower the screen further down - it disappears and then we have to start the plug in
// again by going in menu"): Windy's phone panel can be pulled half way down to see the map, but pulled further Windy
// closes the plugin; a plugin cannot stop that. So when the panel closes on a phone, a small "Galenea" tab is left at the
// bottom of the map; one tap opens the plugin again (route, ship and settings are kept, as after any reopening). It goes
// away when the plugin is open again, or with its own ✕ (until the next closing). Switch: Settings → Map display.
// Opening: Windy's documented message bcast 'rqstOpen' with the plugin's name; if Windy has not opened it within 2 s, the
// plugin object in window.W is asked directly; failing both, the tab says to use Windy's menu ☰.

import bcast from '@windy/broadcast';
import { get } from 'svelte/store';

import config from '../pluginConfig';
import { logEvent } from '../lib/activityLog';
import { reopenTab } from '../state';

let el: HTMLElement | null = null;
let opened = false;
let timer: ReturnType<typeof setTimeout> | null = null;

const UP =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';

function openAgain(): void {
    opened = false;
    logEvent('click', 'Reopen tab: open the plugin again');
    try {
        bcast.emit('rqstOpen' as never, config.name as never);
    } catch {
        /* Windy refused: try the plugin object below */
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        if (opened) return;
        try {
            const W = (window as unknown as { W?: { plugins?: Record<string, { open?: () => unknown }> } }).W;
            const p = W?.plugins?.[config.name];
            if (p?.open) {
                void p.open();
                return;
            }
        } catch {
            /* not there */
        }
        const msg = el?.querySelector('.pp-reopen__msg');
        if (msg) msg.textContent = "Open Galenea from Windy's menu ☰";
    }, 2000);
}

/** The plugin was closed: on phones, leave the tab (if switched on) */
export function showReopenTab(isPhone: boolean): void {
    try {
        if (!isPhone || !get(reopenTab) || typeof document === 'undefined') return;
        hideReopenTab();
        if (!document.getElementById('pp-reopen-css')) {
            const st = document.createElement('style');
            st.id = 'pp-reopen-css';
            st.textContent = REOPEN_CSS;
            document.head.appendChild(st);
        }
        el = document.createElement('div');
        el.className = 'pp-reopen';
        el.innerHTML = `<button type="button" class="pp-reopen__open" aria-label="Open Galenea again">${UP}<span>Galenea</span><span class="pp-reopen__msg"></span></button><button type="button" class="pp-reopen__x" aria-label="Hide this tab" title="Hide this tab (Settings → Map display: switch it off for good)">✕</button>`;
        el.querySelector('.pp-reopen__open')?.addEventListener('click', openAgain);
        el.querySelector('.pp-reopen__x')?.addEventListener('click', () => {
            logEvent('click', 'Reopen tab: hidden');
            hideReopenTab();
        });
        document.body.appendChild(el);
        logEvent('ui', 'Panel closed on a phone: Galenea tab left on the map');
    } catch {
        /* never let this stop Windy closing the plugin */
    }
}

/** The plugin is open (again): no tab */
export function hideReopenTab(): void {
    opened = true;
    if (timer) clearTimeout(timer);
    timer = null;
    try {
        el?.remove();
    } catch {
        /* gone */
    }
    el = null;
}

/** Style for the tab: it lives outside the plugin's panel, so it brings its own (class names start with pp-reopen) */
export const REOPEN_CSS = `
.pp-reopen{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom, 0px) + 128px);z-index:2000;display:flex;align-items:stretch;gap:0;
 background:#16222f;border:1px solid #4aa3ff;border-radius:22px;box-shadow:0 4px 14px rgba(0,0,0,.45);overflow:hidden;font:600 15px/1 system-ui,sans-serif}
.pp-reopen button{background:none;border:0;color:#fff;cursor:pointer;min-height:44px;font:inherit}
.pp-reopen__open{display:flex;align-items:center;gap:6px;padding:0 14px 0 12px}
.pp-reopen__open svg{color:#4aa3ff}
.pp-reopen__msg:not(:empty){font-weight:400;font-size:12px;opacity:.85;margin-left:6px}
.pp-reopen__x{padding:0 12px;border-left:1px solid #2c3e52 !important;color:#9fb3c8 !important;font-size:14px !important}
`;
